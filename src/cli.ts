#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as readline from 'node:readline/promises';
import { runChecks, registerConnectImpl } from './orchestrator.js';
import { formatReportHuman, formatReportJSON } from './report.js';
import { loadConfig } from './config-loader.js';
import { discoverConfigFiles } from './discovery.js';
import { watchFileDebounced } from './watch.js';
import { resolveRegistryServer } from './registry.js';
import { isConfigPatch, diffConfigPatch, applyConfigPatch, type ConfigPatch } from './fix.js';
import type { Check, MCPConfig, DiagnosticResult } from './types.js';
import pc from 'picocolors';

export interface ParsedArgs {
  command: 'check' | 'watch' | 'fix' | 'help';
  configPath?: string;
  registryServer?: string;
  json: boolean;
  timeoutMs?: number;
  showFixes: boolean;
  verbose: boolean;
  failOn: 'error' | 'warning';
  checkFilter?: string;
  dryRun: boolean;
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
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
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
    } else {
      positional.push(arg);
    }
  }

  if (args.command !== 'help') {
    if (positional[0] === 'check' || positional[0] === 'watch' || positional[0] === 'fix') {
      args.command = positional[0];
      if (!args.configPath && positional[1]) {
        args.configPath = positional[1];
      }
    } else if (positional[0] && !args.configPath) {
      args.configPath = positional[0];
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

async function loadChecks(): Promise<Check[]> {
  const mod = await importOptional('./checks/index.js');
  const checks = mod?.allChecks;
  return Array.isArray(checks) ? (checks as Check[]) : [];
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

function printHelp(): void {
  console.log(`
${pc.bold('mcp-doctor')} — Diagnose broken MCP server configs before they break your agent.

${pc.bold('USAGE')}
  $ mcp-doctor [check] [path/to/config.json] [options]
  $ mcp-doctor check --registry <server-id> [options]
  $ mcp-doctor watch <path/to/config.json> [options]
  $ mcp-doctor fix <path/to/config.json> [--check <id>] [--dry-run]

${pc.bold('OPTIONS')}
  --config <path>       Specify path to MCP configuration file
  --registry <id/url>   Validate published registry entry directly
  --show-fixes          Print actionable suggested fixes under diagnostics
  --fail-on <severity>  Exit with code 1 on 'error' (default) or 'warning'
  --verbose, -v         Print raw JSON-RPC traffic and debug messages
  --json                Output report in JSON format
  --timeout <ms>        Per-server handshake timeout in milliseconds (default: 5000)
  --help, -h            Show help

${pc.bold('FIX OPTIONS')} (mcp-doctor fix)
  --check <id>          Only offer fixes from this check id (e.g. security.untrusted-remote)
  --dry-run             Show every available fix as a diff; apply nothing, prompt for nothing

${pc.bold('FIX BEHAVIOR')}
  Only diagnostics that carry a mechanical suggestedFix.patch can be
  auto-applied (most diagnostics are description-only and must be fixed by
  hand). Each one is shown as a diff and requires an explicit y/n
  confirmation — fixes are never bulk-applied silently. Before writing
  anything, the original file is copied to <path>.bak.

${pc.bold('EXIT CODES')}
  0  All checks passed cleanly / fix completed (including "nothing to fix")
  1  Diagnostics failed (errors found, or warnings when --fail-on warning)
  2  Usage or configuration error (invalid flags, missing/malformed config)
`);
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
      return line;
    })
    .join('\n');
}

async function executeCheck(
  config: MCPConfig,
  args: ParsedArgs,
): Promise<number> {
  const [checks] = await Promise.all([loadChecks(), loadProtocol()]);

  const report = await runChecks(config, {
    timeoutMs: args.timeoutMs,
    checks,
    verbose: args.verbose,
  });

  if (args.json) {
    console.log(formatReportJSON(report));
  } else {
    console.log(
      colorizeHumanReport(formatReportHuman(report, { showFixes: args.showFixes })),
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
  const [checks] = await Promise.all([loadChecks(), loadProtocol()]);
  const report = await runChecks(config, { timeoutMs: args.timeoutMs, checks, verbose: args.verbose });

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
    console.error(pc.red(`mcp-doctor usage error: ${err instanceof Error ? err.message : String(err)}`));
    return 2;
  }

  if (args.command === 'help') {
    printHelp();
    return 0;
  }

  if (args.command === 'fix' && args.registryServer) {
    console.error(pc.red('mcp-doctor fix does not support --registry — there is no local file to write the fix to.'));
    return 2;
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
        pc.red(
          'No MCP configuration files discovered. Specify a file path or create a .mcp.json in your project.',
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
if (process.argv[1] && (process.argv[1].endsWith('/cli.js') || process.argv[1].endsWith('/cli.ts') || process.argv[1].endsWith('/mcp-doctor'))) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(pc.red(`mcp-doctor: unexpected error: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(2);
    });
}
