import { describe, it, expect } from 'vitest';
import { formatReportHuman } from '../src/report.js';
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
});
