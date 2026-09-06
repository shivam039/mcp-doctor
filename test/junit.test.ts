import { describe, it, expect } from 'vitest';
import { formatReportJUnit, formatFleetReportJUnit } from '../src/junit.js';
import type { RunReport } from '../src/types.js';
import type { FleetReport } from '../src/fleet.js';

describe('JUnit XML Export Formatter', () => {
  it('formats single RunReport into valid JUnit XML structure', () => {
    const report: RunReport = {
      configSource: 'test/fixtures/configs/valid-stdio.json',
      connections: [
        {
          server: { name: 'good-server', transport: 'stdio' },
          status: 'connected',
          latencyMs: 42,
        },
      ],
      diagnostics: [
        {
          checkId: 'schema.missing-description',
          severity: 'warning',
          message: 'Missing description',
          serverName: 'good-server',
        },
        {
          checkId: 'schema.missing-required',
          severity: 'error',
          message: 'Required field missing',
          serverName: 'good-server',
          suggestedFix: { description: 'Add field' },
        },
      ],
      summary: { servers: 1, connected: 1, failed: 0, errors: 1, warnings: 1 },
    };

    const xml = formatReportJUnit(report);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites name="mcp-doctor"');
    expect(xml).toContain('<testcase classname="good-server" name="connection.handshake"');
    expect(xml).toContain('<failure message="Required field missing" type="CheckError"');
    expect(xml).toContain('<system-out>[warning] Missing description</system-out>');
  });

  it('formats FleetReport into JUnit XML', () => {
    const fleetReport: FleetReport = {
      totalFiles: 1,
      successfulFiles: 1,
      failedFiles: 0,
      totalServers: 1,
      totalErrors: 0,
      totalWarnings: 0,
      fileResults: [
        {
          filePath: '/path/to/.mcp.json',
          report: {
            connections: [
              {
                server: { name: 'fleet-server', transport: 'stdio' },
                status: 'connected',
              },
            ],
            diagnostics: [],
            summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
          },
        },
      ],
    };

    const xml = formatFleetReportJUnit(fleetReport);
    expect(xml).toContain('<testsuites name="mcp-doctor-fleet"');
    expect(xml).toContain('testsuite name="/path/to/.mcp.json"');
  });
});
