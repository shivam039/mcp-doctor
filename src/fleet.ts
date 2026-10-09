import { readdirSync, lstatSync, readFileSync, existsSync } from 'node:fs';
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

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<U>,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await worker(items[index]!);
      }
    }),
  );
  return results;
}

function findFilesMatching(dir: string, rootDir: string, pattern: RegExp, results: string[] = []): string[] {
  if (!existsSync(dir)) return results;
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const fullPath = join(dir, entry);
    try {
      const stat = lstatSync(fullPath);
      if (stat.isDirectory()) {
        findFilesMatching(fullPath, rootDir, pattern, results);
      } else if (stat.isFile()) {
        const relativePath = fullPath.slice(rootDir.length + 1).split('\\').join('/');
        if (!pattern.test(relativePath)) continue;
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
  const root = resolve(rootDir);
  const glob = globOrPattern.split('\\').join('/').replace(/^\.\//, '');
  let regexSource = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*' && glob[i + 1] === '*') {
      i += 1;
      if (glob[i + 1] === '/') {
        // A leading or interior **/ can match zero or more path segments.
        regexSource += '(?:.*/)?';
        i += 1;
      } else {
        regexSource += '.*';
      }
    } else if (char === '*') {
      regexSource += '[^/]*';
    } else {
      regexSource += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
    }
  }
  const regex = new RegExp(`${regexSource}$`);
  return findFilesMatching(root, root, regex).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Runs validation checks across all matching configuration files.
 */
export async function runFleetChecks(
  globPattern: string,
  options: RunOptions & { cwd?: string; jobs?: number } = {},
): Promise<FleetReport> {
  const root = options.cwd ?? process.cwd();
  const filePaths = findConfigFiles(globPattern, root);
  const jobs = options.jobs ?? 1;
  if (!Number.isSafeInteger(jobs) || jobs < 1) {
    throw new TypeError(`jobs must be a positive safe integer, got: ${jobs}`);
  }

  const processed = await mapWithConcurrency(filePaths, jobs, async (filePath) => {
    try {
      const rawText = readFileSync(filePath, 'utf-8');
      const rawJson = JSON.parse(rawText);
      const { config, errors } = loadConfig(rawJson, filePath);

      if (errors.length > 0 || !config) {
        return {
          fileResult: { filePath, error: `Config validation failed: ${errors.join(', ')}` },
          errorCount: errors.length,
        };
      }

      const checks = options.checks ?? allChecks;
      const report = await runChecks(config, { ...options, checks });
      return { fileResult: { filePath, report }, errorCount: report.summary.errors };
    } catch (err) {
      return {
        fileResult: { filePath, error: `Could not process file: ${err instanceof Error ? err.message : String(err)}` },
        errorCount: 1,
      };
    }
  });
  const fileResults = processed.map((item) => item.fileResult);

  const totalServers = fileResults.reduce((sum, result) => sum + (result.report?.summary.servers ?? 0), 0);
  const totalErrors = processed.reduce((sum, item) => sum + item.errorCount, 0);
  const totalWarnings = fileResults.reduce((sum, result) => sum + (result.report?.summary.warnings ?? 0), 0);

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
