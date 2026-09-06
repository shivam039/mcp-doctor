import { describe, it, expect } from 'vitest';
import { createToolSurfaceCheck, qualityToolSurfaceCheck, DEFAULT_MAX_TOOLS_WARNING_THRESHOLD } from '../../src/checks/quality-tool-surface.js';
import { validConnection, emptyToolsConnection, undefinedToolsConnection } from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (tools: MCPConnection['tools']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  tools,
});

const makeTools = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `tool_${i}`, description: `Tool number ${i}.`, inputSchema: {} }));

describe('quality.tool-surface', () => {
  it('returns no diagnostics for a small, distinct tool set', () => {
    expect(qualityToolSurfaceCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(qualityToolSurfaceCheck.run(emptyToolsConnection)).toEqual([]);
    expect(qualityToolSurfaceCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags a tool count exceeding the default threshold', () => {
    const results = qualityToolSurfaceCheck.run(conn(makeTools(DEFAULT_MAX_TOOLS_WARNING_THRESHOLD + 1)));
    const bloat = results.find((r) => r.message.includes('exceeding the'));
    expect(bloat).toMatchObject({ checkId: 'quality.tool-surface', severity: 'warning' });
  });

  it('does not flag a tool count at exactly the default threshold', () => {
    const results = qualityToolSurfaceCheck.run(conn(makeTools(DEFAULT_MAX_TOOLS_WARNING_THRESHOLD)));
    expect(results.find((r) => r.message.includes('exceeding the'))).toBeUndefined();
  });

  it('respects a configurable threshold via createToolSurfaceCheck', () => {
    const check = createToolSurfaceCheck({ maxTools: 3 });
    const results = check.run(conn(makeTools(5)));
    const bloat = results.find((r) => r.message.includes('exceeding the'));
    expect(bloat?.message).toContain('exceeding the 3-tool threshold');
  });

  it('flags near-duplicate (normalized-equal) tool names', () => {
    const results = qualityToolSurfaceCheck.run(
      conn([
        { name: 'search-flights', description: 'd1', inputSchema: {} },
        { name: 'search_flights', description: 'd2', inputSchema: {} },
      ]),
    );
    const similar = results.find((r) => r.message.includes('near-identical names'));
    expect(similar).toBeDefined();
  });

  it('flags 3+ tools sharing the exact same non-trivial description', () => {
    const results = qualityToolSurfaceCheck.run(
      conn([
        { name: 'a', description: 'Does something useful here.', inputSchema: {} },
        { name: 'b', description: 'Does something useful here.', inputSchema: {} },
        { name: 'c', description: 'Does something useful here.', inputSchema: {} },
      ]),
    );
    const shared = results.find((r) => r.message.includes('share the exact same description'));
    expect(shared).toBeDefined();
  });

  it('does not flag 2 tools sharing a description (threshold is 3+)', () => {
    const results = qualityToolSurfaceCheck.run(
      conn([
        { name: 'a', description: 'Does something useful here.', inputSchema: {} },
        { name: 'b', description: 'Does something useful here.', inputSchema: {} },
      ]),
    );
    expect(results.find((r) => r.message.includes('share the exact same description'))).toBeUndefined();
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityToolSurfaceCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-surface', severity: 'error' });
  });
});
