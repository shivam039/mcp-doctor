import { describe, it, expect } from 'vitest';
import { formatReportSarif } from '../src/sarif.js';
import type { RunReport } from '../src/types.js';

describe('SARIF 2.1.0 export formatter', () => {
  const report: RunReport = {
    configSource: 'test/fixtures/configs/valid-stdio.json',
    connections: [
      { server: { name: 'good-server', transport: 'stdio' }, status: 'connected', latencyMs: 42 },
    ],
    diagnostics: [
      {
        checkId: 'schema.missing-description',
        severity: 'warning',
        message: 'Tool "echo" is missing a description.',
        serverName: 'good-server',
        toolName: 'echo',
      },
      {
        checkId: 'schema.missing-required',
        severity: 'error',
        message: 'Required field "type" is missing.',
        serverName: 'good-server',
        suggestedFix: { description: 'Add the "type" field.' },
      },
      {
        checkId: 'security.untrusted-remote',
        severity: 'info',
        message: 'Informational note.',
        serverName: 'good-server',
      },
    ],
    summary: { servers: 1, connected: 1, failed: 0, errors: 1, warnings: 1 },
  };

  it('produces well-formed SARIF 2.1.0 JSON with one run and a rule per checkId', () => {
    const sarif = JSON.parse(formatReportSarif(report));
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe('mcp-medic');

    const ruleIds = sarif.runs[0].tool.driver.rules.map((r: { id: string }) => r.id);
    expect(ruleIds).toEqual(
      expect.arrayContaining(['schema.missing-description', 'schema.missing-required', 'security.untrusted-remote']),
    );
  });

  it('maps severities to SARIF levels correctly', () => {
    const sarif = JSON.parse(formatReportSarif(report));
    const results = sarif.runs[0].results as Array<{ ruleId: string; level: string }>;
    expect(results.find((r) => r.ruleId === 'schema.missing-required')?.level).toBe('error');
    expect(results.find((r) => r.ruleId === 'schema.missing-description')?.level).toBe('warning');
    expect(results.find((r) => r.ruleId === 'security.untrusted-remote')?.level).toBe('note');
  });

  it('points each result at the config source file and names the server/tool as logical locations', () => {
    const sarif = JSON.parse(formatReportSarif(report));
    const results = sarif.runs[0].results as Array<{
      ruleId: string;
      locations: Array<{
        physicalLocation: { artifactLocation: { uri: string } };
        logicalLocations?: Array<{ name: string }>;
      }>;
    }>;
    const withTool = results.find((r) => r.ruleId === 'schema.missing-description')!;
    expect(withTool.locations[0].physicalLocation.artifactLocation.uri).toBe(
      'test/fixtures/configs/valid-stdio.json',
    );
    expect(withTool.locations[0].logicalLocations?.map((l) => l.name)).toEqual(['good-server', 'echo']);
  });

  it('includes the suggested fix description in the result message when present', () => {
    const sarif = JSON.parse(formatReportSarif(report));
    const results = sarif.runs[0].results as Array<{ ruleId: string; message: { text: string } }>;
    const withFix = results.find((r) => r.ruleId === 'schema.missing-required')!;
    expect(withFix.message.text).toContain('Required field "type" is missing.');
    expect(withFix.message.text).toContain('Suggested fix: Add the "type" field.');
  });

  it('falls back to a generic artifact name when configSource is absent', () => {
    const sarif = JSON.parse(formatReportSarif({ ...report, configSource: undefined }));
    expect(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'mcp-config.json',
    );
  });
});
