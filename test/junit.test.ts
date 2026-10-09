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
    expect(xml).toContain('<testsuites name="mcp-medic"');
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
    expect(xml).toContain('<testsuites name="mcp-medic-fleet"');
    expect(xml).toContain('testsuite name="/path/to/.mcp.json"');
    expect(xml).toContain('tests="1" failures="0"');
    expect((xml.match(/<testcase\b/g) ?? [])).toHaveLength(1);
  });

  it('counts emitted fleet cases and failures, including invalid files and warnings', () => {
    const fleetReport: FleetReport = {
      totalFiles: 2,
      successfulFiles: 1,
      failedFiles: 1,
      totalServers: 2,
      totalErrors: 2,
      totalWarnings: 1,
      fileResults: [
        {
          filePath: '/path/a\u0001&.json',
          report: {
            connections: [
              { server: { name: 'ok<&', transport: 'stdio' }, status: 'connected' },
              {
                server: { name: 'broken', transport: 'http', url: 'https://example.test' },
                status: 'failed',
                error: { stage: 'handshake', message: 'bad <handshake> & "retry"' },
              },
            ],
            diagnostics: [
              { checkId: 'schema.bad<&', severity: 'error', message: 'missing <field> & value', serverName: 'broken' },
              { checkId: 'schema.warning', severity: 'warning', message: 'warning & safe', serverName: 'ok<&' },
              { checkId: 'schema.info', severity: 'info', message: 'info <note>', serverName: 'ok<&' },
            ],
            summary: { servers: 2, connected: 1, failed: 1, errors: 1, warnings: 1 },
          },
        },
        { filePath: '/path/bad<&\u0001.json', error: 'Config <invalid> & unreadable' },
      ],
    };

    const xml = formatFleetReportJUnit(fleetReport);
    expect(xml).toContain('<testsuites name="mcp-medic-fleet" tests="6" failures="3">');
    expect(xml).toContain('tests="5" failures="2"');
    expect(xml).toContain('testsuite name="/path/bad&lt;&amp;.json" tests="1" failures="1"');
    expect(xml).toContain('[warning] warning &amp; safe');
    expect(xml).toContain('[info] info &lt;note&gt;');
    expect(xml).toContain('bad &lt;handshake&gt; &amp; &quot;retry&quot;');
    expect(xml).not.toContain('\u0001');
    expect((xml.match(/<testcase\b/g) ?? [])).toHaveLength(6);
    expect((xml.match(/<failure\b/g) ?? [])).toHaveLength(3);
  });

  it('reports a zero-case empty fleet accurately', () => {
    const xml = formatFleetReportJUnit({
      totalFiles: 0,
      successfulFiles: 0,
      failedFiles: 0,
      totalServers: 0,
      totalErrors: 0,
      totalWarnings: 0,
      fileResults: [],
    });
    expect(xml).toContain('<testsuites name="mcp-medic-fleet" tests="0" failures="0">');
    expect((xml.match(/<testcase\b/g) ?? [])).toHaveLength(0);
  });
});
