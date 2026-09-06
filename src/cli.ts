#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks, registerConnectImpl } from './orchestrator.js';
import { formatReportHuman, formatReportJSON } from './report.js';
import { loadConfig } from './config-loader.js';
import { discoverConfigFiles } from './discovery.js';
import { watchFileDebounced } from './watch.js';
import { resolveRegistryServer } from './registry.js';
import { isConfigPatch, diffConfigPatch, applyConfigPatch, type ConfigPatch } from './fix.js';
import { loadPolicy, createPolicyChecks, type MCPMedicPolicy } from './policy.js';
import { runFleetChecks, diffConfigs, filterDiagnosticsByBaseline } from './fleet.js';
import { formatReportJUnit, formatFleetReportJUnit } from './junit.js';
import { formatReportSarif } from './sarif.js';
import { computeReportQualityScore } from './quality-score.js';
import type { Check, MCPConfig, RunReport, DiagnosticResult } from './types.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from './protocol/versions.js';
import pc from 'picocolors';

export interface ParsedArgs {
  command: 'check' | 'watch' | 'check-all' | 'diff' | 'fix' | 'score' | 'help' | 'version';
  configPath?: string;
  configPathB?: string;
  globPattern?: string;
  registryServer?: string;
  policyPath?: string;
  exportJunit?: string;
  exportJson?: string;
  exportSarif?: string;
  snapshotPath?: string;
  updateSnapshotPath?: string;
  json: boolean;
  timeoutMs?: number;
  showFixes: boolean;
  verbose: boolean;
  failOn: 'error' | 'warning';
  checkFilter?: string;
  dryRun: boolean;
  /** Include the MCP quality score section in the report (`--score`, or implied by the `score` command). */
  showScore: boolean;
  /** "auto" (default) or an explicit MCP protocolVersion string, e.g. "2025-06-18". */
  protocolVersion: string;
}

/** Prompts the user with `question` and resolves true for an explicit "y"/"yes" answer. */
export type ConfirmFn = (question: string) => Promise<boolean>;

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: 'check',
    json: false,
    showFixes: false,
    verbose: false,
    failOn: 'error',
    dryRun: false,
    protocolVersion: 'auto',
    showScore: false,
  };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--show-fixes') {
      args.showFixes = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--score') {
      args.showScore = true;
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
    } else if (arg === '--version' || arg === '-V') {
      args.command = 'version';
    } else if (arg === '--fail-on') {
      const val = argv[++i];
      if (val !== 'error' && val !== 'warning') {
        throw new Error(`--fail-on requires "error" or "warning", got: ${val ?? '(none)'}`);
      }
      args.failOn = val;
    } else if (arg === '--check') {
      const val = argv[++i];
      if (!val) {
        throw new Error('--check requires a check id, e.g. --check security.untrusted-remote');
      }
      args.checkFilter = val;
    } else if (arg === '--policy') {
      args.policyPath = argv[++i];
    } else if (arg === '--export-junit' || arg === '--junit') {
      args.exportJunit = argv[++i];
    } else if (arg === '--export-json') {
      args.exportJson = argv[++i];
    } else if (arg === '--export-sarif') {
      args.exportSarif = argv[++i];
    } else if (arg === '--snapshot') {
      args.snapshotPath = argv[++i];
    } else if (arg === '--update-snapshot') {
      args.updateSnapshotPath = argv[++i];
    } else if (arg === '--registry') {
      const val = argv[++i];
      if (!val) {
        throw new Error('--registry requires a server identifier or registry URL');
      }
      args.registryServer = val;
    } else if (arg === '--config') {
      const val = argv[++i];
      if (!val) {
        throw new Error('--config requires a path argument');
      }
      args.configPath = val;
    } else if (arg === '--timeout') {
      const value = argv[++i];
      const parsed = value ? Number(value) : NaN;
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`--timeout requires a positive numeric value in ms, got: ${value ?? '(none)'}`);
      }
      args.timeoutMs = parsed;
    } else if (arg === '--protocol-version') {
      const val = argv[++i];
      if (!val) {
        throw new Error(
          `--protocol-version requires a value: "auto" or an explicit version (e.g. ${SUPPORTED_PROTOCOL_VERSIONS[0]})`,
        );
      }
      args.protocolVersion = val;
    } else {
      positional.push(arg);
    }
  }

  if (args.command !== 'help' && args.command !== 'version') {
    const first = positional[0];
    if (first === 'check' || first === 'watch' || first === 'check-all' || first === 'diff' || first === 'fix' || first === 'score') {
      args.command = first;
      if (first === 'diff') {
        args.configPath = positional[1];
        args.configPathB = positional[2];
      } else if (first === 'check-all') {
        args.globPattern = positional[1] || '**/*mcp*.json';
      } else {
        if (!args.configPath && positional[1]) {
          args.configPath = positional[1];
        }
      }
      if (first === 'score') {
        args.showScore = true;
      }
    } else if (first && !args.configPath) {
      args.configPath = first;
    }
  }

  return args;
}

async function importOptional(specifier: string): Promise<Record<string, unknown> | undefined> {
  try {
    return await import(specifier);
  } catch {
    return undefined;
  }
}

async function loadChecks(policyPath?: string): Promise<Check[]> {
  const mod = await importOptional('./checks/index.js');
  const baseChecks = Array.isArray(mod?.allChecks) ? (mod?.allChecks as Check[]) : [];

  const policy = loadPolicy(policyPath);
  if (policy) {
    const policyChecks = createPolicyChecks(policy);
    return [...baseChecks, ...policyChecks];
  }
  return baseChecks;
}

async function loadProtocol(): Promise<void> {
  const mod = await importOptional('./protocol/index.js');
  if (!mod) return;
  if (typeof mod.registerProtocol === 'function') {
    (mod.registerProtocol as () => void)();
  } else if (typeof mod.connect === 'function') {
    registerConnectImpl(mod.connect as Parameters<typeof registerConnectImpl>[0]);
  }
}

/** Reads the installed package's version from package.json, one directory up from dist/cli.js. */
function getPackageVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function printHelp(): void {
  const helpText = `
${pc.bold('mcp-medic')} — Diagnose broken MCP server configs before they break your agent.

USAGE
  $ mcp-medic [check] [path/to/config.json] [options]
  $ mcp-medic check --registry <server-id> [options]
  $ mcp-medic check-all "<glob-pattern>" [options]
  $ mcp-medic score <path/to/config.json> [options]
  $ mcp-medic diff <configA.json> <configB.json>
  $ mcp-medic watch <path/to/config.json> [options]
  $ mcp-medic fix <path/to/config.json> [--check <id>] [--dry-run]

OPTIONS
  --config <path>       Specify path to MCP configuration file
  --registry <id/url>   Validate published registry entry directly
  --policy <path>       Apply organizational policy rules (.mcp-medic-policy.json)
  --snapshot <path>     Filter report against baseline snapshot, reporting regressions only
  --update-snapshot <p> Save diagnostic report as new baseline snapshot
  --export-junit <file> Export report in JUnit XML format
  --export-json <file>  Export report in JSON format
  --export-sarif <file> Export report in SARIF 2.1.0 format (GitHub Code Scanning, etc.)
  --score               Include the MCP quality score in the report (implied by the "score" command)
  --show-fixes          Print actionable suggested fixes under diagnostics
  --fail-on <severity>  Exit with code 1 on 'error' (default) or 'warning'
  --verbose, -v         Print raw JSON-RPC traffic and debug messages
  --json                Output report in JSON format (always includes a "quality" field)
  --timeout <ms>        Per-server handshake timeout in milliseconds (default: 5000)
  --protocol-version <v> MCP protocolVersion to request: "auto" (default, latest supported)
                        or an explicit version, e.g. ${SUPPORTED_PROTOCOL_VERSIONS[SUPPORTED_PROTOCOL_VERSIONS.length - 1]}
  --help, -h            Show help
  --version, -V         Print the installed mcp-medic version

PROTOCOL VERSIONS
  This client supports: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}
  "auto" requests ${SUPPORTED_PROTOCOL_VERSIONS[0]} (the newest). The server may negotiate an
  older version instead; mcp-medic reports both and fails cleanly if the
  negotiated version isn't one this client supports.

MCP QUALITY SCORE
  A deterministic 0-100 score (no LLM, no randomness) across five weighted
  dimensions: Protocol (25%), Schema (20%), Agent usability (20%), Security
  (20%), Reliability (15%). Every point deducted is derived from an actual
  diagnostic and is explained in the report's "Deductions" list. Policy can
  gate on it via "quality": { "minimumScore": N } in .mcp-medic-policy.json.

FIX OPTIONS (mcp-medic fix)
  --check <id>          Only offer fixes from this check id (e.g. security.untrusted-remote)
  --dry-run             Show every available fix as a diff; apply nothing, prompt for nothing

FIX BEHAVIOR
  Only diagnostics that carry a mechanical suggestedFix.patch can be
  auto-applied (most diagnostics are description-only and must be fixed by
  hand). Each one is shown as a diff and requires an explicit y/n
  confirmation — fixes are never bulk-applied silently. Before writing
  anything, the original file is copied to <path>.bak.

EXIT CODES
  0  All checks passed cleanly / fix completed (including "nothing to fix")
  1  Diagnostics failed (errors found, or warnings when --fail-on warning)
  2  Usage or configuration error (invalid flags, missing/malformed config)
`;
  console.log(helpText);
}

function colorizeHumanReport(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\[OK\]/.test(line)) return pc.green(line);
      if (/^\[FAILED\]|^\[TIMEOUT\]/.test(line)) return pc.red(line);
      if (/\[error\]/.test(line)) return pc.red(line);
      if (/\[warning\]/.test(line)) return pc.yellow(line);
      if (/Suggested fix:/.test(line)) return pc.cyan(line);
      if (/^\s*Protocol:.*✗ incompatible/.test(line)) return pc.red(line);
      if (/^\s*Protocol:/.test(line)) return pc.dim(line);
      return line;
    })
    .join('\n');
}

async function executeCheck(
  config: MCPConfig,
  args: ParsedArgs,
): Promise<number> {
  const [checks] = await Promise.all([loadChecks(args.policyPath), loadProtocol()]);

  let report = await runChecks(config, {
    timeoutMs: args.timeoutMs,
    checks,
    verbose: args.verbose,
    protocolVersion: args.protocolVersion,
  });

  // Handle baseline snapshot comparison
  if (args.snapshotPath) {
    if (existsSync(args.snapshotPath)) {
      try {
        const baseline = JSON.parse(readFileSync(args.snapshotPath, 'utf-8')) as RunReport;
        report = filterDiagnosticsByBaseline(report, baseline);
        // The quality score must reflect what's actually being reported —
        // recompute it against the post-baseline-filter diagnostics rather
        // than leaving the pre-filter score (computed by runChecks) stale.
        report.quality = computeReportQualityScore(report);
      } catch (err) {
        console.error(pc.yellow(`Warning: Could not read snapshot baseline: ${String(err)}`));
      }
    }
  }

  // Policy gate: fail if the computed quality score is below the configured
  // minimum. This can't be a `Check` (it needs the score computed from every
  // check's output, not a single connection), so it's enforced here instead.
  const policy = loadPolicy(args.policyPath);
  if (typeof policy?.quality?.minimumScore === 'number' && report.quality) {
    if (report.quality.overall < policy.quality.minimumScore) {
      report.diagnostics.push({
        checkId: 'policy.minimum-quality-score',
        severity: 'error',
        message: `MCP quality score ${report.quality.overall} is below the policy minimum of ${policy.quality.minimumScore}.`,
        serverName: config.servers.map((s) => s.name).join(', ') || '(no servers)',
        category: 'configuration',
      });
      report.summary.errors += 1;
    }
  }

  // Handle update snapshot
  if (args.updateSnapshotPath) {
    try {
      writeFileSync(resolve(args.updateSnapshotPath), JSON.stringify(report, null, 2));
      if (!args.json) {
        console.log(pc.green(`Updated baseline snapshot at ${args.updateSnapshotPath}`));
      }
    } catch (err) {
      console.error(pc.red(`Failed to save snapshot: ${String(err)}`));
    }
  }

  // Handle JUnit XML export
  if (args.exportJunit) {
    try {
      writeFileSync(resolve(args.exportJunit), formatReportJUnit(report));
    } catch (err) {
      console.error(pc.red(`Failed to write JUnit export: ${String(err)}`));
    }
  }

  // Handle JSON export
  if (args.exportJson) {
    try {
      writeFileSync(resolve(args.exportJson), JSON.stringify(report, null, 2));
    } catch (err) {
      console.error(pc.red(`Failed to write JSON export: ${String(err)}`));
    }
  }

  // Handle SARIF export
  if (args.exportSarif) {
    try {
      writeFileSync(resolve(args.exportSarif), formatReportSarif(report));
    } catch (err) {
      console.error(pc.red(`Failed to write SARIF export: ${String(err)}`));
    }
  }

  if (args.json) {
    console.log(formatReportJSON(report));
  } else {
    console.log(
      colorizeHumanReport(formatReportHuman(report, { showFixes: args.showFixes, showScore: args.showScore })),
    );
  }

  const hasErrors = report.summary.errors > 0;
  const hasWarnings = report.summary.warnings > 0;

  if (args.failOn === 'warning') {
    return hasErrors || hasWarnings ? 1 : 0;
  }
  return hasErrors ? 1 : 0;
}

interface LoadedConfig {
  config?: MCPConfig;
  rawText?: string;
  rawJson?: unknown;
  exitCode?: number;
}

async function loadConfigFromPath(configPath: string): Promise<LoadedConfig> {
  if (!existsSync(configPath)) {
    console.error(pc.red(`Config file not found: ${configPath}`));
    return { exitCode: 2 };
  }

  let rawText: string;
  try {
    rawText = readFileSync(configPath, 'utf-8');
  } catch (err) {
    console.error(
      pc.red(`Could not read config file: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { exitCode: 2 };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch (err) {
    console.error(
      pc.red(`Could not parse config as JSON: ${err instanceof Error ? err.message : String(err)}`),
    );
    return { exitCode: 2 };
  }

  const { config, errors } = loadConfig(rawJson, configPath);
  if (errors.length > 0 || !config) {
    console.error(pc.red('Config validation failed:'));
    for (const error of errors) {
      console.error(pc.red(`  - ${error}`));
    }
    return { exitCode: 2 };
  }

  return { config, rawText, rawJson };
}

async function defaultConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

/**
 * `mcp-doctor fix`: runs the same checks as `check`, then offers to apply
 * every diagnostic whose suggestedFix carries a mechanical `patch` (see
 * src/fix.ts). Per FR3-1: always shows a diff, always asks y/n per fix
 * (never bulk-applies), always writes a `.bak` before touching the file,
 * and `--dry-run` shows every diff without prompting or writing anything.
 */
async function executeFix(
  configPath: string,
  rawText: string,
  rawJson: unknown,
  config: MCPConfig,
  args: ParsedArgs,
  confirm: ConfirmFn,
): Promise<number> {
  const [checks] = await Promise.all([loadChecks(args.policyPath), loadProtocol()]);
  const report = await runChecks(config, {
    timeoutMs: args.timeoutMs,
    checks,
    verbose: args.verbose,
    protocolVersion: args.protocolVersion,
  });

  let fixable = report.diagnostics.filter((d) => isConfigPatch(d.suggestedFix?.patch));
  if (args.checkFilter) {
    fixable = fixable.filter((d) => d.checkId === args.checkFilter);
  }

  // Multiple diagnostics can suggest the exact same patch; only offer it once.
  const seen = new Set<string>();
  const uniqueFixable: Array<{ diagnostic: DiagnosticResult; patch: ConfigPatch }> = [];
  for (const diagnostic of fixable) {
    const patch = diagnostic.suggestedFix!.patch as ConfigPatch;
    const key = JSON.stringify(patch);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueFixable.push({ diagnostic, patch });
  }

  if (uniqueFixable.length === 0) {
    console.log(pc.green('No auto-fixable diagnostics found.'));
    return 0;
  }

  let working: unknown = rawJson;
  let applied = 0;
  let skipped = 0;
  const dryRunEntries: Array<{
    checkId: string;
    serverName: string;
    toolName?: string;
    message: string;
    diff: ReturnType<typeof diffConfigPatch>;
  }> = [];

  for (const { diagnostic, patch } of uniqueFixable) {
    const diffs = diffConfigPatch(working, patch);
    if (diffs.length === 0) continue; // already fixed — nothing to show or confirm

    if (args.dryRun) {
      dryRunEntries.push({
        checkId: diagnostic.checkId,
        serverName: diagnostic.serverName,
        toolName: diagnostic.toolName,
        message: diagnostic.message,
        diff: diffs,
      });
      continue;
    }

    console.log('');
    console.log(pc.bold(`[${diagnostic.severity}] ${diagnostic.serverName} — ${diagnostic.message} (${diagnostic.checkId})`));
    for (const d of diffs) {
      console.log(pc.red(`  - ${d.field}: ${JSON.stringify(d.before)}`));
      console.log(pc.green(`  + ${d.field}: ${JSON.stringify(d.after)}`));
    }

    const proceed = await confirm(`Apply this fix to ${configPath}? [y/N] `);
    if (proceed) {
      working = applyConfigPatch(working, patch);
      applied++;
    } else {
      skipped++;
    }
  }

  if (args.dryRun) {
    if (args.json) {
      console.log(JSON.stringify({ fixable: dryRunEntries.length, fixes: dryRunEntries }, null, 2));
    } else if (dryRunEntries.length === 0) {
      console.log(pc.green('Dry run: nothing to fix (every fixable diagnostic is already applied).'));
    } else {
      for (const entry of dryRunEntries) {
        console.log('');
        console.log(pc.bold(`[dry-run] ${entry.serverName} — ${entry.message} (${entry.checkId})`));
        for (const d of entry.diff) {
          console.log(pc.red(`  - ${d.field}: ${JSON.stringify(d.before)}`));
          console.log(pc.green(`  + ${d.field}: ${JSON.stringify(d.after)}`));
        }
      }
      console.log(pc.dim(`\nDry run: ${dryRunEntries.length} fix(es) shown, 0 applied.`));
    }
    return 0;
  }

  if (applied > 0) {
    const backupPath = `${configPath}.bak`;
    writeFileSync(backupPath, rawText, 'utf-8');
    writeFileSync(configPath, `${JSON.stringify(working, null, 2)}\n`, 'utf-8');
    console.log(pc.green(`\nApplied ${applied} fix(es). Original saved to ${backupPath}.`));
  } else {
    console.log(pc.dim('\nNo fixes applied.'));
  }
  if (skipped > 0) {
    console.log(pc.yellow(`Skipped ${skipped} fix(es).`));
  }

  return 0;
}

export interface CliDeps {
  confirm?: ConfirmFn;
}

export async function main(argv: string[] = process.argv.slice(2), deps: CliDeps = {}): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(pc.red(`mcp-medic usage error: ${err instanceof Error ? err.message : String(err)}`));
    return 2;
  }

  if (args.command === 'help') {
    printHelp();
    return 0;
  }

  if (args.command === 'version') {
    console.log(getPackageVersion());
    return 0;
  }

  if (args.command === 'fix' && args.registryServer) {
    console.error(pc.red('mcp-doctor fix does not support --registry — there is no local file to write the fix to.'));
    return 2;
  }

  // Handle diff command
  if (args.command === 'diff') {
    if (!args.configPath || !args.configPathB) {
      console.error(pc.red('mcp-medic diff requires two config paths: mcp-medic diff <configA> <configB>'));
      return 2;
    }
    const [resA, resB] = await Promise.all([
      loadConfigFromPath(args.configPath),
      loadConfigFromPath(args.configPathB),
    ]);
    if (!resA.config || !resB.config) return 2;

    const diff = diffConfigs(resA.config, resB.config);
    if (args.json) {
      console.log(JSON.stringify(diff, null, 2));
    } else {
      console.log(pc.bold(`\nMCP Config Drift Report`));
      console.log(`Config A: ${args.configPath}`);
      console.log(`Config B: ${args.configPathB}\n`);

      if (diff.identical) {
        console.log(pc.green('✔ Configurations are identical. No drift detected.'));
      } else {
        for (const entry of diff.entries) {
          if (entry.kind === 'added') {
            console.log(pc.green(`+ Added in B: ${entry.serverName}`));
          } else if (entry.kind === 'removed') {
            console.log(pc.red(`- Removed in B: ${entry.serverName}`));
          } else if (entry.kind === 'modified') {
            console.log(pc.yellow(`~ Modified server: ${entry.serverName}`));
            for (const ch of entry.changes || []) {
              console.log(pc.dim(`    ${ch.field}: ${JSON.stringify(ch.from)} -> ${JSON.stringify(ch.to)}`));
            }
          }
        }
      }
    }
    return diff.identical ? 0 : 1;
  }

  // Handle fleet check-all command
  if (args.command === 'check-all') {
    const glob = args.globPattern || '**/*mcp*.json';
    const [checks] = await Promise.all([loadChecks(args.policyPath), loadProtocol()]);
    const fleetReport = await runFleetChecks(glob, {
      checks,
      timeoutMs: args.timeoutMs,
      verbose: args.verbose,
      protocolVersion: args.protocolVersion,
    });

    if (args.exportJunit) {
      try {
        writeFileSync(resolve(args.exportJunit), formatFleetReportJUnit(fleetReport));
      } catch (err) {
        console.error(pc.red(`Failed to write JUnit export: ${String(err)}`));
      }
    }

    if (args.json) {
      console.log(JSON.stringify(fleetReport, null, 2));
    } else {
      console.log(pc.bold(`\nMCP Medic Fleet Report`));
      console.log(`Files scanned: ${fleetReport.totalFiles} (${fleetReport.successfulFiles} valid, ${fleetReport.failedFiles} invalid)`);
      console.log(`Servers checked: ${fleetReport.totalServers}`);
      console.log(`Results: ${fleetReport.totalErrors} error(s), ${fleetReport.totalWarnings} warning(s)\n`);

      for (const res of fleetReport.fileResults) {
        if (res.error) {
          console.log(pc.red(`[FAIL] ${res.filePath} — ${res.error}`));
        } else if (res.report) {
          const status = res.report.summary.errors === 0 ? pc.green('[PASS]') : pc.red('[FAIL]');
          console.log(`${status} ${res.filePath} (${res.report.summary.servers} servers, ${res.report.summary.errors} errors, ${res.report.summary.warnings} warnings)`);
        }
      }
    }

    const hasErrors = fleetReport.totalErrors > 0;
    const hasWarnings = fleetReport.totalWarnings > 0;
    if (args.failOn === 'warning') {
      return hasErrors || hasWarnings ? 1 : 0;
    }
    return hasErrors ? 1 : 0;
  }

  // Handle direct registry validation
  if (args.registryServer) {
    try {
      const serverConfig = await resolveRegistryServer(args.registryServer, {
        timeoutMs: args.timeoutMs,
      });
      const config: MCPConfig = {
        servers: [serverConfig],
        sourcePath: `registry:${args.registryServer}`,
      };
      return await executeCheck(config, args);
    } catch (err) {
      console.error(
        pc.red(`Failed to resolve registry server: ${err instanceof Error ? err.message : String(err)}`),
      );
      return 2;
    }
  }

  // Resolve config path (explicit argument or auto-discovery)
  let targetPath = args.configPath;
  if (!targetPath) {
    const discovered = discoverConfigFiles();
    if (discovered.length === 0) {
      console.error(
        pc.yellow(
          'No MCP configuration files discovered (checked Claude Desktop, .mcp.json, and VS Code/Cursor locations). ' +
            'Specify a file path (mcp-medic check <path>) or create a .mcp.json in your project.',
        ),
      );
      return 2;
    }
    if (discovered.length === 1) {
      targetPath = discovered[0].path;
      if (!args.json) {
        console.log(pc.dim(`Auto-discovered config: ${targetPath} (${discovered[0].label})`));
      }
    } else {
      targetPath = discovered[0].path;
      if (!args.json) {
        console.log(pc.yellow(`Found ${discovered.length} MCP configuration files:`));
        for (let i = 0; i < discovered.length; i++) {
          console.log(pc.dim(`  ${i + 1}. ${discovered[i].label}: ${discovered[i].path}`));
        }
        console.log(pc.dim(`Using: ${targetPath} (use --config <path> to specify another)\n`));
      }
    }
  }

  if (args.command === 'watch') {
    if (!args.json) {
      console.log(pc.bold(`\nWatching ${targetPath} for changes... (Press Ctrl+C to exit)\n`));
    }
    const { config, exitCode } = await loadConfigFromPath(targetPath);
    if (exitCode !== undefined || !config) return exitCode ?? 2;

    await executeCheck(config, args);

    return new Promise<number>(() => {
      watchFileDebounced(targetPath!, {
        onTrigger: async () => {
          if (!args.json) {
            console.log(pc.dim(`\n--- Config changed: re-running checks ---`));
          }
          const loaded = await loadConfigFromPath(targetPath!);
          if (loaded.config) {
            await executeCheck(loaded.config, args);
          }
        },
        onError: (err) => {
          console.error(pc.red(`Watch error: ${err.message}`));
        },
      });
    });
  }

  if (args.command === 'fix') {
    const { config, rawText, rawJson, exitCode } = await loadConfigFromPath(targetPath);
    if (exitCode !== undefined || !config || rawText === undefined) return exitCode ?? 2;
    return executeFix(targetPath, rawText, rawJson, config, args, deps.confirm ?? defaultConfirm);
  }

  const { config, exitCode } = await loadConfigFromPath(targetPath);
  if (exitCode !== undefined || !config) return exitCode ?? 2;

  return executeCheck(config, args);
}

// Only invoke automatically when run as CLI entry point
if (process.argv[1] && (process.argv[1].endsWith('/cli.js') || process.argv[1].endsWith('/cli.ts') || process.argv[1].endsWith('/mcp-medic') || process.argv[1].endsWith('/mcp-doctor') || process.argv[1].endsWith('/mcpmedic') || process.argv[1].endsWith('/mcpdoctor'))) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(pc.red(`mcp-medic: unexpected error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    });
}
