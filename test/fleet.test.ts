import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runFleetChecks, diffConfigs, filterDiagnosticsByBaseline } from '../src/fleet.js';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MCPConfig, RunReport } from '../src/types.js';

describe('Fleet Management & Drift Detection', () => {
  const testFleetDir = join(tmpdir(), `fleet-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testFleetDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testFleetDir)) {
      rmSync(testFleetDir, { recursive: true, force: true });
    }
  });

  it('detects added, removed, and modified server drift between configs', () => {
    const configA: MCPConfig = {
      servers: [
        { name: 'server-one', transport: 'stdio', command: 'node', args: ['one.js'] },
        { name: 'server-two', transport: 'stdio', command: 'node', args: ['two.js'] },
      ],
      sourcePath: 'staging.json',
    };

    const configB: MCPConfig = {
      servers: [
        { name: 'server-one', transport: 'sse', url: 'https://mcp.prod.com/sse' }, // modified
        { name: 'server-three', transport: 'stdio', command: 'node', args: ['three.js'] }, // added
        // server-two removed
      ],
      sourcePath: 'prod.json',
    };

    const diff = diffConfigs(configA, configB);
    expect(diff.identical).toBe(false);
    expect(diff.entries).toHaveLength(3);

    const modified = diff.entries.find((e) => e.serverName === 'server-one');
    expect(modified?.kind).toBe('modified');

    const removed = diff.entries.find((e) => e.serverName === 'server-two');
    expect(removed?.kind).toBe('removed');

    const added = diff.entries.find((e) => e.serverName === 'server-three');
    expect(added?.kind).toBe('added');
  });

  it('redacts secret-looking env values in drift output instead of exposing them raw', () => {
    const configA: MCPConfig = {
      servers: [{ name: 'srv', transport: 'stdio', env: { API_KEY: 'sk-old-secret', STAGE: 'dev' } }],
    };
    const configB: MCPConfig = {
      servers: [{ name: 'srv', transport: 'stdio', env: { API_KEY: 'sk-new-secret', STAGE: 'prod' } }],
    };

    const diff = diffConfigs(configA, configB);
    const modified = diff.entries.find((e) => e.serverName === 'srv');
    const envChange = modified?.changes?.find((c) => c.field === 'env');

    expect(envChange?.from).toEqual({ API_KEY: '[REDACTED]', STAGE: 'dev' });
    expect(envChange?.to).toEqual({ API_KEY: '[REDACTED]', STAGE: 'prod' });
    expect(JSON.stringify(diff)).not.toContain('sk-old-secret');
    expect(JSON.stringify(diff)).not.toContain('sk-new-secret');
  });

  it('runs fleet checks across multiple config files in a directory', async () => {
    const config1 = join(testFleetDir, 'team-a.mcp.json');
    const config2 = join(testFleetDir, 'team-b.mcp.json');

    writeFileSync(
      config1,
      JSON.stringify({
        mcpServers: {
          'server-a': { command: 'node', args: ['a.js'] },
        },
      }),
    );
    writeFileSync(
      config2,
      JSON.stringify({
        mcpServers: {
          'server-b': { command: 'node', args: ['b.js'] },
        },
      }),
    );

    const fleetReport = await runFleetChecks('*.mcp.json', { cwd: testFleetDir });
    expect(fleetReport.totalFiles).toBe(2);
    expect(fleetReport.successfulFiles).toBe(2);
    expect(fleetReport.totalServers).toBe(2);
  });

  it('filters out existing baseline diagnostics to report regressions only', () => {
    const baselineReport: RunReport = {
      connections: [],
      diagnostics: [
        {
          checkId: 'schema.missing-description',
          severity: 'warning',
          message: 'Tool "legacy_tool" is missing a description.',
          serverName: 'legacy-server',
        },
      ],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 1 },
    };

    const currentReport: RunReport = {
      connections: [],
      diagnostics: [
        {
          checkId: 'schema.missing-description',
          severity: 'warning',
          message: 'Tool "legacy_tool" is missing a description.',
          serverName: 'legacy-server',
        },
        {
          checkId: 'schema.missing-required',
          severity: 'error',
          message: 'New required field missing.',
          serverName: 'legacy-server',
        },
      ],
      summary: { servers: 1, connected: 1, failed: 0, errors: 1, warnings: 1 },
    };

    const filtered = filterDiagnosticsByBaseline(currentReport, baselineReport);
    expect(filtered.diagnostics).toHaveLength(1);
    expect(filtered.diagnostics[0].checkId).toBe('schema.missing-required');
    expect(filtered.summary.errors).toBe(1);
    expect(filtered.summary.warnings).toBe(0);
  });
});
