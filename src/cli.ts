#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runChecks, registerConnectImpl } from './orchestrator.js';
import { formatReportHuman, formatReportJSON } from './report.js';
import { loadConfig } from './config-loader.js';
import type { Check } from './types.js';
import pc from 'picocolors';

interface ParsedArgs {
  command?: string;
  configPath?: string;
  json: boolean;
  timeoutMs?: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const args: ParsedArgs = { command, json: false };
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--timeout') {
      const value = rest[++i];
      const parsed = value ? Number(value) : NaN;
      if (Number.isNaN(parsed)) {
        throw new Error(`--timeout requires a numeric value in ms, got: ${value ?? '(none)'}`);
      }
      args.timeoutMs = parsed;
    } else {
      positional.push(arg);
    }
  }

  args.configPath = positional[0];
  return args;
}

// Codex's protocol layer and Jules' checks layer land independently of the
// CLI (see .agent-room/STATUS.md merge order) and don't exist yet (both
// dirs are still just .gitkeep). Import them through a non-literal
// specifier so tsc doesn't try to resolve modules that aren't there today,
// and load them dynamically so the CLI works now against the orchestrator's
// connectStub and an empty check list, picking up the real implementations
// automatically the moment those modules exist — no CLI changes needed
// either way.
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
  if (!mod) return; // protocol layer not implemented yet — orchestrator falls
  // back to its built-in connectStub, which reports a clear per-server error.

  if (typeof mod.registerProtocol === 'function') {
    (mod.registerProtocol as () => void)();
  } else if (typeof mod.connect === 'function') {
    registerConnectImpl(mod.connect as Parameters<typeof registerConnectImpl>[0]);
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command !== 'check' || !args.configPath) {
    console.error('Usage: mcp-doctor check <path-to-config.json> [--json] [--timeout <ms>]');
    return 1;
  }

  let rawText: string;
  try {
    rawText = readFileSync(args.configPath, 'utf-8');
  } catch (err) {
    console.error(pc.red(`could not read config file: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch (err) {
    console.error(pc.red(`could not parse config as JSON: ${err instanceof Error ? err.message : String(err)}`));
    return 1;
  }

  const { config, errors } = loadConfig(rawJson, args.configPath);
  if (errors.length > 0 || !config) {
    console.error(pc.red('Config validation failed:'));
    for (const error of errors) {
      console.error(pc.red(`  - ${error}`));
    }
    return 1;
  }

  const [checks] = await Promise.all([loadChecks(), loadProtocol()]);

  const report = await runChecks(config, { timeoutMs: args.timeoutMs, checks });

  if (args.json) {
    console.log(formatReportJSON(report));
  } else {
    console.log(colorizeHumanReport(formatReportHuman(report)));
  }

  return report.summary.errors === 0 ? 0 : 1;
}

function colorizeHumanReport(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\[OK\]/.test(line)) return pc.green(line);
      if (/^\[FAILED\]|^\[TIMEOUT\]/.test(line)) return pc.red(line);
      if (/\[error\]/.test(line)) return pc.red(line);
      if (/\[warning\]/.test(line)) return pc.yellow(line);
      return line;
    })
    .join('\n');
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(pc.red(`mcp-doctor: unexpected error: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  });
