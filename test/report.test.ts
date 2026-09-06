import { describe, it, expect } from 'vitest';
import { formatReportHuman } from '../src/report.js';
import { computeReportQualityScore } from '../src/quality-score.js';
import type { RunReport } from '../src/types.js';

describe('formatReportHuman', () => {
  it('shows tool/resource/prompt counts when capabilities were inspected', () => {
    const report: RunReport = {
      connections: [
        {
          server: { name: 'srv', transport: 'stdio' },
          status: 'connected',
          tools: [{ name: 'echo', inputSchema: {} }],
          resources: [{ uri: 'file:///notes.txt' }],
          prompts: [{ name: 'summarize' }],
        },
      ],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };

    const output = formatReportHuman(report);
    expect(output).toContain('Capabilities: 1 tool(s), 1 resource(s), 1 prompt(s)');
  });

  it('omits the resource/prompt counts when those capabilities were never declared', () => {
    const report: RunReport = {
      connections: [
        {
          server: { name: 'srv', transport: 'stdio' },
          status: 'connected',
          tools: [{ name: 'echo', inputSchema: {} }],
        },
      ],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };

    const output = formatReportHuman(report);
    expect(output).toContain('Capabilities: 1 tool(s)');
    expect(output).not.toContain('resource(s)');
    expect(output).not.toContain('prompt(s)');
  });

  it('surfaces a capability inspection error without treating the connection as failed', () => {
    const report: RunReport = {
      connections: [
        {
          server: { name: 'srv', transport: 'stdio' },
          status: 'connected',
          tools: [{ name: 'echo', inputSchema: {} }],
          capabilityErrors: { resources: 'resources/list response has no resources array' },
        },
      ],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };

    const output = formatReportHuman(report);
    expect(output).toContain('[OK] srv');
    expect(output).toContain('resources/list: resources/list response has no resources array');
  });

  it('omits the QUALITY section by default (showScore is off)', () => {
    const report: RunReport = {
      connections: [{ server: { name: 'srv', transport: 'stdio' }, status: 'connected', tools: [{ name: 'echo', inputSchema: {} }] }],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    report.quality = computeReportQualityScore(report);

    const output = formatReportHuman(report);
    expect(output).not.toContain('QUALITY');
    expect(output).not.toContain('MCP QUALITY SCORE');
  });

  it('shows a per-server QUALITY block with dimensions and the overall score when showScore is on', () => {
    const report: RunReport = {
      connections: [{
        server: { name: 'srv', transport: 'stdio' },
        status: 'connected',
        tools: [{ name: 'echo', description: 'Echoes input.', inputSchema: { type: 'object' } }],
        serverInfo: { name: 'srv', version: '1.0.0' },
      }],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    report.quality = computeReportQualityScore(report);

    const output = formatReportHuman(report, { showScore: true });
    expect(output).toContain('QUALITY');
    expect(output).toContain('Protocol');
    expect(output).toContain('Agent usability');
    expect(output).toContain('MCP QUALITY SCORE 100/100');
  });

  it('lists deductions under the QUALITY block, explaining each point lost', () => {
    const report: RunReport = {
      connections: [{ server: { name: 'srv', transport: 'stdio' }, status: 'connected', tools: [] }],
      diagnostics: [
        { checkId: 'schema.malformed', severity: 'error', message: 'bad schema', serverName: 'srv' },
      ],
      summary: { servers: 1, connected: 1, failed: 0, errors: 1, warnings: 0 },
    };
    report.quality = computeReportQualityScore(report);

    const output = formatReportHuman(report, { showScore: true });
    expect(output).toContain('Deductions:');
    expect(output).toContain('-8 1 error from "schema.malformed"');
  });

  it('shows an aggregate OVERALL QUALITY block only when more than one server connected', () => {
    const single: RunReport = {
      connections: [{ server: { name: 'a', transport: 'stdio' }, status: 'connected', tools: [] }],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    single.quality = computeReportQualityScore(single);
    expect(formatReportHuman(single, { showScore: true })).not.toContain('OVERALL QUALITY');

    const multi: RunReport = {
      connections: [
        { server: { name: 'a', transport: 'stdio' }, status: 'connected', tools: [] },
        { server: { name: 'b', transport: 'stdio' }, status: 'connected', tools: [] },
      ],
      diagnostics: [],
      summary: { servers: 2, connected: 2, failed: 0, errors: 0, warnings: 0 },
    };
    multi.quality = computeReportQualityScore(multi);
    expect(formatReportHuman(multi, { showScore: true })).toContain('OVERALL QUALITY');
  });
});
