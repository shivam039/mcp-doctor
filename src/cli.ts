#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { runChecks, registerConnectImpl } from './orchestrator.js';
import { formatReportHuman, formatReportJSON } from './report.js';
import { loadConfig } from './config-loader.js';
import { discoverConfigFiles } from './discovery.js';
import { watchFileDebounced } from './watch.js';
import type { Check } from './types.js';
import pc from 'picocolors';

export interface ParsedArgs {
  command: 'check' | 'watch' | 'help';
  configPath?: string;
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
    if (positional[0] === 'check' || positional[0] === 'watch') {
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
  $ mcp-doctor watch <path/to/config.json> [options]

${pc.bold('OPTIONS')}
  --config <path>       Specify path to MCP configuration file
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
  configPath: string,
  args: ParsedArgs,
): Promise<number> {
  if (!existsSync(configPath)) {
    console.error(pc.red(`Config file not found: ${configPath}`));
    return 2;
  }

  let rawText: string;
  try {
    rawText = readFileSync(configPath, 'utf-8');
  } catch (err) {
    console.error(
      pc.red(`Could not read config file: ${err instanceof Error ? err.message : String(err)}`),
    );
    return 2;
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch (err) {
    console.error(
      pc.red(`Could not parse config as JSON: ${err instanceof Error ? err.message : String(err)}`),
    );
    return 2;
  }

  const { config, errors } = loadConfig(rawJson, configPath);
  if (errors.length > 0 || !config) {
    console.error(pc.red('Config validation failed:'));
    for (const error of errors) {
      console.error(pc.red(`  - ${error}`));
    }
    return 2;
  }

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
    await executeCheck(targetPath, args);

    return new Promise<number>(() => {
      watchFileDebounced(targetPath!, {
        onTrigger: async () => {
          if (!args.json) {
            console.log(pc.dim(`\n--- Config changed: re-running checks ---`));
          }
          await executeCheck(targetPath!, args);
        },
        onError: (err) => {
          console.error(pc.red(`Watch error: ${err.message}`));
        },
      });
    });
  }

  return executeCheck(targetPath, args);
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
