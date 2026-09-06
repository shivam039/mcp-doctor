#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runChecks, registerConnectImpl } from './orchestrator.js';
import { formatReportHuman, formatReportJSON } from './report.js';
import { loadConfig } from './config-loader.js';
import { discoverConfigFiles } from './discovery.js';
import { watchFileDebounced } from './watch.js';
import { resolveRegistryServer } from './registry.js';
import { loadPolicy, createPolicyChecks } from './policy.js';
import { runFleetChecks, diffConfigs, filterDiagnosticsByBaseline } from './fleet.js';
import { formatReportJUnit, formatFleetReportJUnit } from './junit.js';
import type { Check, MCPConfig, RunReport } from './types.js';
import pc from 'picocolors';

export interface ParsedArgs {
  command: 'check' | 'watch' | 'check-all' | 'diff' | 'help';
  configPath?: string;
  configPathB?: string;
  globPattern?: string;
  registryServer?: string;
  policyPath?: string;
  exportJunit?: string;
  exportJson?: string;
  snapshotPath?: string;
  updateSnapshotPath?: string;
  json: boolean;
  timeoutMs?: number;
  showFixes: boolean;
  verbose: boolean;
  failOn: 'error' | 'warning';
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: 'check',
    json: false,
    showFixes: false,
    verbose: false,
    failOn: 'error',
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
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
    } else if (arg === '--fail-on') {
      const val = argv[++i];
      if (val !== 'error' && val !== 'warning') {
        throw new Error(`--fail-on requires "error" or "warning", got: ${val ?? '(none)'}`);
      }
      args.failOn = val;
    } else if (arg === '--policy') {
      args.policyPath = argv[++i];
    } else if (arg === '--export-junit' || arg === '--junit') {
      args.exportJunit = argv[++i];
    } else if (arg === '--export-json') {
      args.exportJson = argv[++i];
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
    } else {
      positional.push(arg);
    }
  }

  if (args.command !== 'help') {
    const first = positional[0];
    if (first === 'check' || first === 'watch' || first === 'check-all' || first === 'diff') {
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

function printHelp(): void {
  console.log(`
${pc.bold('mcp-doctor')} — Diagnose broken MCP server configs before they break your agent.

${pc.bold('USAGE')}
  $ mcp-doctor [check] [path/to/config.json] [options]
  $ mcp-doctor check --registry <server-id> [options]
  $ mcp-doctor check-all "<glob-pattern>" [options]
  $ mcp-doctor diff <configA.json> <configB.json>
  $ mcp-doctor watch <path/to/config.json> [options]

${pc.bold('OPTIONS')}
  --config <path>       Specify path to MCP configuration file
  --registry <id/url>   Validate published registry entry directly
  --policy <path>       Apply organizational policy rules (.mcp-doctor-policy.json)
  --snapshot <path>     Filter report against baseline snapshot, reporting regressions only
  --update-snapshot <p> Save diagnostic report as new baseline snapshot
  --export-junit <file> Export report in JUnit XML format
  --export-json <file>  Export report in JSON format
  --show-fixes          Print actionable suggested fixes under diagnostics
  --fail-on <severity>  Exit with code 1 on 'error' (default) or 'warning'
  --verbose, -v         Print raw JSON-RPC traffic and debug messages
  --json                Output report in JSON format
  --timeout <ms>        Per-server handshake timeout in milliseconds (default: 5000)
  --help, -h            Show help

${pc.bold('EXIT CODES')}
  0  All checks passed cleanly
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
  const [checks] = await Promise.all([loadChecks(args.policyPath), loadProtocol()]);

  let report = await runChecks(config, {
    timeoutMs: args.timeoutMs,
    checks,
    verbose: args.verbose,
  });

  // Handle baseline snapshot comparison
  if (args.snapshotPath) {
    if (existsSync(args.snapshotPath)) {
      try {
        const baseline = JSON.parse(readFileSync(args.snapshotPath, 'utf-8')) as RunReport;
        report = filterDiagnosticsByBaseline(report, baseline);
      } catch (err) {
        console.error(pc.yellow(`Warning: Could not read snapshot baseline: ${String(err)}`));
      }
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

async function loadConfigFromPath(configPath: string): Promise<{ config?: MCPConfig; exitCode?: number }> {
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

  return { config };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
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

  // Handle diff command
  if (args.command === 'diff') {
    if (!args.configPath || !args.configPathB) {
      console.error(pc.red('mcp-doctor diff requires two config paths: mcp-doctor diff <configA> <configB>'));
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
      console.log(pc.bold(`\nMCP Doctor Fleet Report`));
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
