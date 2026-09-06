import { describe, it, expect } from 'vitest';
import { sampleCallSimulationCheck } from '../../src/checks/sample-call-simulation.js';
import {
  validConnection,
  sampleCallFailureConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('sampleCallSimulationCheck (schema.sample-call-simulation)', () => {
  it('passes cleanly on valid tool schema', () => {
    const results = sampleCallSimulationCheck.run(validConnection);
    expect(results).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(sampleCallSimulationCheck.run(emptyToolsConnection)).toEqual([]);
    expect(sampleCallSimulationCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags schemas with empty required enum as error', () => {
    const results = sampleCallSimulationCheck.run(sampleCallFailureConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.sample-call-simulation',
      severity: 'error',
      serverName: 'sample-call-failure-server',
      toolName: 'empty_enum_tool',
      message: expect.stringContaining('required enum array is empty'),
    });
  });

  it('flags missing required property definitions as error', () => {
    const conn: MCPConnection = {
      server: { name: 'missing-prop-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'missing_def_tool',
          description: 'Tool missing property def',
          inputSchema: {
            type: 'object',
            properties: {},
            required: ['mustExist'],
          },
        },
      ],
    };

    const results = sampleCallSimulationCheck.run(conn);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.sample-call-simulation',
      severity: 'error',
      serverName: 'missing-prop-server',
      toolName: 'missing_def_tool',
      message: 'Sample call generation failed for tool "missing_def_tool": required field "mustExist" has no property definition.',
    });
  });

  it('flags contradictory numerical bounds as error', () => {
    const conn: MCPConnection = {
      server: { name: 'contradictory-bounds-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'bound_tool',
          description: 'Tool with minimum > maximum',
          inputSchema: {
            type: 'object',
            properties: {
              num: {
                type: 'number',
                minimum: 100,
                maximum: 50,
              },
            },
            required: ['num'],
          },
        },
      ],
    };

    const results = sampleCallSimulationCheck.run(conn);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.sample-call-simulation',
      severity: 'error',
      serverName: 'contradictory-bounds-server',
      toolName: 'bound_tool',
      message: expect.stringContaining('contradictory bounds'),
    });
  });

  it('reports warning caveat when schema uses combinators or missing type', () => {
    const conn: MCPConnection = {
      server: { name: 'caveat-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'combinator_tool',
          description: 'Tool with oneOf',
          inputSchema: {
            type: 'object',
            properties: {
              item: {
                description: 'item without type',
              },
            },
            required: ['item'],
            oneOf: [{ required: ['item'] }],
          },
        },
      ],
    };

    const results = sampleCallSimulationCheck.run(conn);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.sample-call-simulation',
      severity: 'warning',
      serverName: 'caveat-server',
      toolName: 'combinator_tool',
      message: expect.stringContaining('Sample call simulation succeeded with caveats'),
    });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('simulation crash');
      },
    } as unknown as MCPConnection;

    const results = sampleCallSimulationCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.sample-call-simulation',
      severity: 'error',
      serverName: 'exploding-server',
      message: expect.stringContaining('simulation crash'),
    });
  });
});
