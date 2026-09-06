import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadConfig } from './config-loader.js';
import { runChecks } from './orchestrator.js';
import { allChecks } from './checks/index.js';
import type { MCPConfig, MCPServerConfig, RunReport, RunOptions, DiagnosticResult } from './types.js';
import { redactRecord } from './redact.js';

export interface FileRunResult {
  filePath: string;
  report?: RunReport;
  error?: string;
}

export interface FleetReport {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  totalServers: number;
  totalErrors: number;
  totalWarnings: number;
  fileResults: FileRunResult[];
}

export interface ConfigDiffEntry {
  serverName: string;
  kind: 'added' | 'removed' | 'modified';
  changes?: { field: string; from: unknown; to: unknown }[];
}

export interface ConfigDiffResult {
  configAPath?: string;
  configBPath?: string;
  identical: boolean;
  entries: ConfigDiffEntry[];
}

function findFilesMatching(dir: string, pattern: RegExp, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        findFilesMatching(fullPath, pattern, results);
      } else if (stat.isFile() && pattern.test(fullPath)) {
        results.push(fullPath);
      }
    } catch {
      // ignore access errors
    }
  }
  return results;
}

/**
 * Discovers config files matching a glob or pattern.
 */
export function findConfigFiles(globOrPattern: string, rootDir: string = process.cwd()): string[] {
  // Simple glob converter
  const regexStr = globOrPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  const regex = new RegExp(`${regexStr}$`);
  return findFilesMatching(rootDir, regex);
}

/**
 * Runs validation checks across all matching configuration files.
 */
export async function runFleetChecks(
  globPattern: string,
  options: RunOptions & { cwd?: string } = {},
): Promise<FleetReport> {
  const root = options.cwd ?? process.cwd();
  const filePaths = findConfigFiles(globPattern, root);
  const fileResults: FileRunResult[] = [];

  let totalServers = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const filePath of filePaths) {
    try {
      const rawText = readFileSync(filePath, 'utf-8');
      const rawJson = JSON.parse(rawText);
      const { config, errors } = loadConfig(rawJson, filePath);

      if (errors.length > 0 || !config) {
        fileResults.push({
          filePath,
          error: `Config validation failed: ${errors.join(', ')}`,
        });
        totalErrors += errors.length;
        continue;
      }

      const checks = options.checks ?? allChecks;
      const report = await runChecks(config, { ...options, checks });

      fileResults.push({ filePath, report });
      totalServers += report.summary.servers;
      totalErrors += report.summary.errors;
      totalWarnings += report.summary.warnings;
    } catch (err) {
      fileResults.push({
        filePath,
        error: `Could not process file: ${err instanceof Error ? err.message : String(err)}`,
      });
      totalErrors += 1;
    }
  }

  return {
    totalFiles: filePaths.length,
    successfulFiles: fileResults.filter((f) => !f.error).length,
    failedFiles: fileResults.filter((f) => Boolean(f.error)).length,
    totalServers,
    totalErrors,
    totalWarnings,
    fileResults,
  };
}

/**
 * Compares two MCP configurations to identify server and attribute drift.
 */
export function diffConfigs(
  configA: MCPConfig,
  configB: MCPConfig,
): ConfigDiffResult {
  const entries: ConfigDiffEntry[] = [];
  const mapA = new Map<string, MCPServerConfig>(configA.servers.map((s) => [s.name, s]));
  const mapB = new Map<string, MCPServerConfig>(configB.servers.map((s) => [s.name, s]));

  // Check servers in A
  for (const [name, serverA] of mapA) {
    const serverB = mapB.get(name);
    if (!serverB) {
      entries.push({ serverName: name, kind: 'removed' });
    } else {
      const changes: { field: string; from: unknown; to: unknown }[] = [];
      if (serverA.transport !== serverB.transport) {
        changes.push({ field: 'transport', from: serverA.transport, to: serverB.transport });
      }
      if (serverA.command !== serverB.command) {
        changes.push({ field: 'command', from: serverA.command, to: serverB.command });
      }
      if (JSON.stringify(serverA.args) !== JSON.stringify(serverB.args)) {
        changes.push({ field: 'args', from: serverA.args, to: serverB.args });
      }
      if (serverA.url !== serverB.url) {
        changes.push({ field: 'url', from: serverA.url, to: serverB.url });
      }
      if (JSON.stringify(serverA.env) !== JSON.stringify(serverB.env)) {
        // Report that env changed and which keys, but never raw values —
        // env vars routinely carry API keys/tokens and diff output gets
        // pasted into PRs and CI logs.
        changes.push({ field: 'env', from: redactRecord(serverA.env), to: redactRecord(serverB.env) });
      }
      if (changes.length > 0) {
        entries.push({ serverName: name, kind: 'modified', changes });
      }
    }
  }

  // Check newly added servers in B
  for (const [name] of mapB) {
    if (!mapA.has(name)) {
      entries.push({ serverName: name, kind: 'added' });
    }
  }

  return {
    configAPath: configA.sourcePath,
    configBPath: configB.sourcePath,
    identical: entries.length === 0,
    entries,
  };
}

/**
 * Filters diagnostics against a baseline snapshot, reporting only newly introduced issues.
 */
export function filterDiagnosticsByBaseline(
  currentReport: RunReport,
  baselineReport: RunReport,
): RunReport {
  const baselineKey = (d: DiagnosticResult): string =>
    `${d.checkId}|${d.serverName}|${d.toolName || ''}|${d.message}`;

  const baselineSet = new Set(baselineReport.diagnostics.map(baselineKey));
  const newDiagnostics = currentReport.diagnostics.filter((d) => !baselineSet.has(baselineKey(d)));

  return {
    ...currentReport,
    diagnostics: newDiagnostics,
    summary: {
      ...currentReport.summary,
      errors: newDiagnostics.filter((d) => d.severity === 'error').length,
      warnings: newDiagnostics.filter((d) => d.severity === 'warning').length,
    },
  };
}
