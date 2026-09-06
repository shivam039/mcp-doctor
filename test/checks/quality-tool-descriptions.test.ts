import { describe, it, expect } from 'vitest';
import { qualityToolDescriptionsCheck } from '../../src/checks/quality-tool-descriptions.js';
import { validConnection, emptyToolsConnection, undefinedToolsConnection } from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (tools: MCPConnection['tools']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  tools,
});

describe('qualityToolDescriptionsCheck (quality.vague-description)', () => {
  it('returns no diagnostics for a real, meaningful description', () => {
    expect(qualityToolDescriptionsCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(qualityToolDescriptionsCheck.run(emptyToolsConnection)).toEqual([]);
    expect(qualityToolDescriptionsCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('ignores missing/empty descriptions (that is schema.missing-description territory)', () => {
    expect(qualityToolDescriptionsCheck.run(conn([{ name: 't', inputSchema: {} }]))).toEqual([]);
    expect(qualityToolDescriptionsCheck.run(conn([{ name: 't', description: '   ', inputSchema: {} }]))).toEqual([]);
  });

  it('flags curated placeholder text, case-insensitively', () => {
    for (const placeholder of ['TODO', 'test', 'Foo', 'description', 'n/a']) {
      const results = qualityToolDescriptionsCheck.run(
        conn([{ name: 'my_tool', description: placeholder, inputSchema: {} }]),
      );
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ checkId: 'quality.vague-description', severity: 'warning' });
    }
  });

  it('flags a description that just repeats the tool name', () => {
    const results = qualityToolDescriptionsCheck.run(
      conn([{ name: 'search_flights', description: 'search_flights', inputSchema: {} }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain("just the tool's own name");
  });

  it('flags a single-word description as too short', () => {
    const results = qualityToolDescriptionsCheck.run(
      conn([{ name: 'my_tool', description: 'Searches.', inputSchema: {} }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('too short');
  });

  it('does not flag a legitimately short but multi-word description', () => {
    const results = qualityToolDescriptionsCheck.run(
      conn([{ name: 'get_time', description: 'Returns the current time.', inputSchema: {} }]),
    );
    expect(results).toEqual([]);
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityToolDescriptionsCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.vague-description', severity: 'error' });
  });
});
