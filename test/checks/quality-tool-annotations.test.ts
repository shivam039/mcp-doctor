import { describe, it, expect } from 'vitest';
import { qualityToolAnnotationsCheck } from '../../src/checks/quality-tool-annotations.js';
import { validConnection, emptyToolsConnection, undefinedToolsConnection } from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (tools: MCPConnection['tools']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  tools,
});

describe('qualityToolAnnotationsCheck (quality.tool-annotations)', () => {
  it('returns no diagnostics when no tool has annotations', () => {
    expect(qualityToolAnnotationsCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(qualityToolAnnotationsCheck.run(emptyToolsConnection)).toEqual([]);
    expect(qualityToolAnnotationsCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('accepts consistent annotations', () => {
    const results = qualityToolAnnotationsCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false } }]),
    );
    expect(results).toEqual([]);
  });

  it('flags readOnlyHint + destructiveHint both true as contradictory', () => {
    const results = qualityToolAnnotationsCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: true } }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-annotations', severity: 'warning' });
  });

  it('flags readOnlyHint true + idempotentHint false as a low-confidence info note', () => {
    const results = qualityToolAnnotationsCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, annotations: { readOnlyHint: true, idempotentHint: false } }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-annotations', severity: 'info', confidence: 'low' });
  });

  it('does not infer danger merely from destructiveHint alone', () => {
    const results = qualityToolAnnotationsCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, annotations: { destructiveHint: true } }]),
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

    const results = qualityToolAnnotationsCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-annotations', severity: 'error' });
  });
});
