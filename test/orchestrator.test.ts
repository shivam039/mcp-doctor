import { describe, it, expect } from 'vitest';
import { runChecks, registerConnectImpl } from '../src/orchestrator.js';
import {
  allChecks,
  malformedSchemaCheck,
  securityUntrustedRemoteCheck,
  securityOverbroadPermissionsCheck,
  securityPromptInjectionRiskCheck,
  securityHiddenUnicodeTagsCheck,
  qualityToolNamesCheck,
  qualityToolDescriptionsCheck,
  qualityToolOutputSchemaCheck,
  qualityToolAnnotationsCheck,
  qualityToolSurfaceCheck,
  qualityResourcesCheck,
  qualityPromptsCheck,
} from '../src/checks/index.js';
import { validConnection, malformedSchemaConnection } from './fixtures/mock-connections.js';
import type { MCPConfig, MCPConnection, Check } from '../src/types.js';

describe('orchestrator with allChecks', () => {
  it('runs all checks against connected servers and aggregates diagnostics', async () => {
    registerConnectImpl(async (server): Promise<MCPConnection> => {
      if (server.name === 'valid-server') {
        return validConnection;
      }
      return malformedSchemaConnection;
    });

    const config: MCPConfig = {
      servers: [
        { name: 'valid-server', transport: 'stdio' },
        { name: 'malformed-schema-server', transport: 'stdio' },
      ],
    };

    const report = await runChecks(config, { checks: allChecks });
    expect(report.summary.servers).toBe(2);
    expect(report.summary.connected).toBe(2);
    expect(report.summary.failed).toBe(0);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.summary.errors).toBeGreaterThan(0);
  });

  it('redacts secret-looking header/env values before they reach the report', async () => {
    registerConnectImpl(async (server): Promise<MCPConnection> => ({
      ...validConnection,
      server,
    }));

    const config: MCPConfig = {
      servers: [
        {
          name: 'remote',
          transport: 'http',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer sk-live-secret', Accept: 'application/json' },
          env: { API_KEY: 'sk-live-secret', NODE_ENV: 'production' },
        },
      ],
    };

    const report = await runChecks(config, {});
    const reportedServer = report.connections[0]?.server;
    const serialized = JSON.stringify(report);

    expect(reportedServer?.headers).toEqual({
      Authorization: '[REDACTED]',
      Accept: 'application/json',
    });
    expect(reportedServer?.env).toEqual({ API_KEY: '[REDACTED]', NODE_ENV: 'production' });
    expect(serialized).not.toContain('sk-live-secret');
  });
});

describe('quality score coverage under custom check sets (end-to-end via runChecks)', () => {
  const singleServerConfig: MCPConfig = { servers: [{ name: 'valid-server', transport: 'stdio' }] };

  it('reports full coverage with the standard full check set', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, { checks: allChecks });
    expect(report.quality?.coveragePercent).toBe(100);
    expect(report.quality?.coverage.usability).toBe('covered');
  });

  it('reports schema coverage as partial and other dimensions as not-covered with a schema-only check set', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, { checks: [malformedSchemaCheck] });
    expect(report.quality?.coverage.schema).toBe('partial');
    expect(report.quality?.coverage.security).toBe('not-covered');
    expect(report.quality?.coverage.usability).toBe('not-covered');
    expect(report.quality?.coverage.reliability).toBe('covered');
  });

  it('reports security coverage as covered with the full security-only check set', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, {
      checks: [
        securityUntrustedRemoteCheck,
        securityOverbroadPermissionsCheck,
        securityPromptInjectionRiskCheck,
        securityHiddenUnicodeTagsCheck,
      ],
    });
    expect(report.quality?.coverage.security).toBe('covered');
    expect(report.quality?.coverage.schema).toBe('not-covered');
  });

  it('reports security coverage as partial when only some of the security checks run', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, {
      checks: [securityUntrustedRemoteCheck, securityOverbroadPermissionsCheck, securityPromptInjectionRiskCheck],
    });
    expect(report.quality?.coverage.security).toBe('partial');
  });

  it('reports usability coverage as covered with the full quality-only check set', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, {
      checks: [
        qualityToolNamesCheck,
        qualityToolDescriptionsCheck,
        qualityToolOutputSchemaCheck,
        qualityToolAnnotationsCheck,
        qualityToolSurfaceCheck,
        qualityResourcesCheck,
        qualityPromptsCheck,
      ],
    });
    expect(report.quality?.coverage.usability).toBe('covered');
    expect(report.quality?.coverage.security).toBe('not-covered');
  });

  it('still computes a (perfect, no-diagnostics) score with an empty check set, but every diagnostic-driven dimension is not-covered', async () => {
    registerConnectImpl(async () => validConnection);
    const report = await runChecks(singleServerConfig, { checks: [] });
    expect(report.diagnostics).toEqual([]);
    expect(report.quality?.overall).toBe(100);
    expect(report.quality?.coveragePercent).toBeLessThan(100);
    expect(report.quality?.coverage.reliability).toBe('covered');
    expect(report.quality?.coverage.schema).toBe('not-covered');
  });

  it('a custom third-party check contributes diagnostics and partial usability coverage', async () => {
    registerConnectImpl(async () => validConnection);
    const customCheck: Check = {
      id: 'acme.custom-tool-check',
      description: 'A hypothetical third-party check.',
      run: () => [{ checkId: 'acme.custom-tool-check', severity: 'warning', message: 'custom finding', serverName: 'valid-server' }],
    };
    const report = await runChecks(singleServerConfig, { checks: [customCheck] });
    expect(report.diagnostics).toHaveLength(1);
    expect(report.quality?.coverage.usability).toBe('partial'); // unmapped checkId falls back to 'quality' -> usability
    expect(report.quality?.dimensions.usability).toBeLessThan(100);
  });

  it('a check that throws still produces a visible error diagnostic that affects the score, without crashing the run', async () => {
    registerConnectImpl(async () => validConnection);
    const throwingCheck: Check = {
      id: 'schema.throws',
      description: 'Always throws.',
      run: () => {
        throw new Error('boom');
      },
    };
    const report = await runChecks(singleServerConfig, { checks: [throwingCheck] });
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0]).toMatchObject({ checkId: 'schema.throws', severity: 'error' });
    expect(report.quality?.dimensions.schema).toBeLessThan(100);
  });

  it('a failed connection produces no quality score at all for that server, and it is never silently included in an aggregate', async () => {
    registerConnectImpl(async (server) => {
      if (server.name === 'broken') {
        return { server, status: 'failed', error: { stage: 'spawn', message: 'ENOENT' } };
      }
      return validConnection;
    });
    const report = await runChecks(
      { servers: [{ name: 'valid-server', transport: 'stdio' }, { name: 'broken', transport: 'stdio' }] },
      { checks: allChecks },
    );
    expect(report.quality?.scoredServers).toEqual(['valid-server']);
    expect(report.quality?.unscoredServers).toEqual(['broken']);
  });

  it('produces no quality score at all when every connection fails', async () => {
    registerConnectImpl(async (server) => ({ server, status: 'failed', error: { stage: 'spawn', message: 'ENOENT' } }));
    const report = await runChecks(singleServerConfig, { checks: allChecks });
    expect(report.quality).toBeUndefined();
  });
});
