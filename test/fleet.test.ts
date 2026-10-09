import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runFleetChecks, diffConfigs, filterDiagnosticsByBaseline, findConfigFiles } from '../src/fleet.js';
import { writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MCPConfig, RunReport } from '../src/types.js';
import { registerConnectImpl } from '../src/orchestrator.js';

describe('Fleet Management & Drift Detection', () => {
  const testFleetDir = join(tmpdir(), `fleet-test-${Date.now()}`);

  beforeEach(() => {
    mkdirSync(testFleetDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testFleetDir)) {
      rmSync(testFleetDir, { recursive: true, force: true });
    }
    rmSync(`${testFleetDir}-outside`, { recursive: true, force: true });
  });

  it('matches root and nested glob paths and sorts matches deterministically', () => {
    const nested = join(testFleetDir, 'team b', 'nested');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(testFleetDir, 'z.mcp.json'), '{}');
    writeFileSync(join(testFleetDir, 'a.mcp.json'), '{}');
    writeFileSync(join(testFleetDir, 'team b', 'b.mcp.json'), '{}');
    writeFileSync(join(nested, 'c.mcp.json'), '{}');
    mkdirSync(join(testFleetDir, 'node_modules', 'deps'), { recursive: true });
    writeFileSync(join(testFleetDir, 'node_modules', 'deps', 'ignored.mcp.json'), '{}');

    const matches = findConfigFiles('**/*.mcp.json', testFleetDir);
    expect(matches.map((path) => path.slice(testFleetDir.length + 1).split('\\').join('/'))).toEqual([
      'a.mcp.json',
      'team b/b.mcp.json',
      'team b/nested/c.mcp.json',
      'z.mcp.json',
    ]);
    expect(findConfigFiles('*.mcp.json', testFleetDir).map((path) => path.split(/[\\/]/).pop())).toEqual([
      'a.mcp.json',
      'z.mcp.json',
    ]);
    expect(findConfigFiles('team b/*.mcp.json', testFleetDir)).toHaveLength(1);
  });

  it.skipIf(process.platform === 'win32')('does not recurse through symlinked directories', () => {
    const outside = `${testFleetDir}-outside`;
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, 'secret.mcp.json'), '{}');
    symlinkSync(outside, join(testFleetDir, 'linked'), 'dir');

    expect(findConfigFiles('**/*.mcp.json', testFleetDir)).toEqual([]);
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

  it('detects auth and transport drift without leaking credential values', () => {
    const configA: MCPConfig = {
      servers: [{
        name: 'auth-server',
        transport: 'http',
        command: 'node --token=old-command-secret',
        url: 'https://api.example/mcp?token=old-url-secret&key=old-query-key&region=us#access_token=old-fragment',
        headers: { Authorization: 'Bearer old-header-secret', 'X-Access-Token': 'old-access-secret', Accept: 'application/json' },
        env: { API_KEY: 'old-env-secret', MODE: 'prod' },
        args: ['--api-key', 'old-arg-secret'],
        tokenRefreshUrl: 'https://user:old-password@auth.example/refresh?client_secret=old-query-secret',
        tokenRefreshBody: {
          client_secret: 'old-body-secret',
          grant_type: 'refresh_token',
          nested: { api_key: 'old-nested-secret', scope: 'read' },
        },
      }],
    };
    const configB: MCPConfig = {
      servers: [{
        name: 'auth-server',
        transport: 'http',
        command: 'node --token=new-command-secret',
        url: 'https://api.example/mcp?token=new-url-secret&key=new-query-key&region=eu#access_token=new-fragment',
        headers: { Accept: 'application/json', Authorization: 'Bearer new-header-secret', 'X-Access-Token': 'new-access-secret' },
        env: { MODE: 'prod', API_KEY: 'new-env-secret' },
        args: ['--api-key', 'new-arg-secret'],
        tokenRefreshUrl: 'https://user:new-password@auth.example/refresh?client_secret=new-query-secret',
        tokenRefreshBody: {
          nested: { scope: 'write', api_key: 'new-nested-secret' },
          grant_type: 'refresh_token',
          client_secret: 'new-body-secret',
        },
      }],
    };

    const diff = diffConfigs(configA, configB);
    const fields = diff.entries[0]?.changes?.map((change) => change.field);
    expect(fields).toEqual(expect.arrayContaining(['command', 'url', 'headers', 'args', 'tokenRefreshUrl', 'tokenRefreshBody']));
    expect(fields).toContain('env');
    const serialized = JSON.stringify(diff);
    for (const secret of [
      'old-url-secret', 'new-url-secret', 'old-fragment', 'new-fragment',
      'old-query-key', 'new-query-key', 'old-access-secret', 'new-access-secret',
      'old-header-secret', 'new-header-secret', 'old-env-secret', 'new-env-secret',
      'old-arg-secret', 'new-arg-secret', 'old-password', 'new-password',
      'old-command-secret', 'new-command-secret',
      'old-query-secret', 'new-query-secret', 'old-body-secret', 'new-body-secret',
      'old-nested-secret', 'new-nested-secret',
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).toContain('[REDACTED]');

    const insertionOrderA: MCPConfig = {
      servers: [{
        name: 'order-only',
        transport: 'http',
        env: { API_KEY: 'same-secret', MODE: 'prod' },
        tokenRefreshBody: { nested: { first: 1, second: 2 }, grant_type: 'refresh_token' },
      }],
    };
    const insertionOrderB: MCPConfig = {
      servers: [{
        name: 'order-only',
        transport: 'http',
        env: { MODE: 'prod', API_KEY: 'same-secret' },
        tokenRefreshBody: { grant_type: 'refresh_token', nested: { second: 2, first: 1 } },
      }],
    };
    expect(diffConfigs(insertionOrderA, insertionOrderB).identical).toBe(true);
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

  it('bounds concurrent file checks and retains sorted result order', async () => {
    for (const name of ['d', 'b', 'c', 'a']) {
      writeFileSync(
        join(testFleetDir, `${name}.json`),
        JSON.stringify({ mcpServers: { [`server-${name}`]: { command: 'node' } } }),
      );
    }
    writeFileSync(join(testFleetDir, 'bad.json'), '{not json');

    registerConnectImpl(async (server) => {
      if (server.name === 'server-c') throw new Error('synthetic connector rejection');
      return { server, status: 'connected' };
    });
    let activeChecks = 0;
    let peakChecks = 0;
    const checks = [{
      id: 'test.delay',
      description: 'Test that file-level concurrency is bounded.',
      async run(connection: { server: { name: string } }) {
        activeChecks += 1;
        peakChecks = Math.max(peakChecks, activeChecks);
        const delayMs = connection.server.name === 'server-a' ? 20 : 1;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        activeChecks -= 1;
        return [];
      },
    }];

    try {
      const report = await runFleetChecks('*.json', { cwd: testFleetDir, jobs: 2, checks });
      expect(peakChecks).toBe(2);
      expect(report.fileResults.map((result) => result.filePath.split(/[\\/]/).pop())).toEqual([
        'a.json', 'b.json', 'bad.json', 'c.json', 'd.json',
      ]);
      expect(report.successfulFiles).toBe(3);
      expect(report.failedFiles).toBe(2);
      expect(report.totalErrors).toBe(2);
      expect(report.fileResults.at(-1)?.report?.summary.servers).toBe(1);
    } finally {
      registerConnectImpl(async (server) => ({
        server,
        status: 'failed',
        error: { stage: 'spawn', message: 'test connector reset' },
      }));
    }
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
