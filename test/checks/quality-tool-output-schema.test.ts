import { describe, it, expect } from 'vitest';
import { qualityToolOutputSchemaCheck } from '../../src/checks/quality-tool-output-schema.js';
import { validConnection, emptyToolsConnection, undefinedToolsConnection } from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (tools: MCPConnection['tools']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  tools,
});

describe('qualityToolOutputSchemaCheck (quality.output-schema)', () => {
  it('returns no diagnostics when no tool declares an outputSchema', () => {
    expect(qualityToolOutputSchemaCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(qualityToolOutputSchemaCheck.run(emptyToolsConnection)).toEqual([]);
    expect(qualityToolOutputSchemaCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('never flags a missing outputSchema (it is optional per spec)', () => {
    const results = qualityToolOutputSchemaCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: { type: 'object' } }]),
    );
    expect(results).toEqual([]);
  });

  it('accepts a well-formed outputSchema', () => {
    const results = qualityToolOutputSchemaCheck.run(
      conn([
        {
          name: 't',
          description: 'd',
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object', properties: { result: { type: 'string' } } },
        },
      ]),
    );
    expect(results).toEqual([]);
  });

  it('flags a non-object outputSchema', () => {
    const results = qualityToolOutputSchemaCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, outputSchema: 'nope' }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.output-schema', severity: 'warning' });
  });

  it('flags an outputSchema whose top-level type is not "object"', () => {
    const results = qualityToolOutputSchemaCheck.run(
      conn([{ name: 't', description: 'd', inputSchema: {}, outputSchema: { type: 'string' } }]),
    );
    expect(results).toHaveLength(1);
    expect(results[0].message).toContain('"object"');
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityToolOutputSchemaCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.output-schema', severity: 'error' });
  });
});
