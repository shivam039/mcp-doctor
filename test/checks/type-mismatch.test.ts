import { describe, it, expect } from 'vitest';
import { typeMismatchCheck } from '../../src/checks/type-mismatch.js';
import {
  validConnection,
  invalidTypeConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('typeMismatchCheck (schema.type-mismatch)', () => {
  it('returns no diagnostics for valid types and enums', () => {
    const results = typeMismatchCheck.run(validConnection);
    expect(results).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(typeMismatchCheck.run(emptyToolsConnection)).toEqual([]);
    expect(typeMismatchCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags unrecognized types and mismatched enum values with warning severity', () => {
    const results = typeMismatchCheck.run(invalidTypeConnection);
    expect(results).toHaveLength(3);

    // Unrecognized type
    expect(results[0]).toMatchObject({
      checkId: 'schema.type-mismatch',
      severity: 'warning',
      serverName: 'invalid-type-server',
      toolName: 'invalid_type_tool',
      message: 'Property "badTypeField" in tool "invalid_type_tool" has invalid or unrecognized type "int_custom".',
    });

    // Enum mismatch 1: 123 in string property
    expect(results[1]).toMatchObject({
      checkId: 'schema.type-mismatch',
      severity: 'warning',
      serverName: 'invalid-type-server',
      toolName: 'invalid_type_tool',
      message: 'Enum value 123 for property "enumMismatchField" in tool "invalid_type_tool" does not match declared type ""string"".',
    });

    // Enum mismatch 2: true in string property
    expect(results[2]).toMatchObject({
      checkId: 'schema.type-mismatch',
      severity: 'warning',
      serverName: 'invalid-type-server',
      toolName: 'invalid_type_tool',
      message: 'Enum value true for property "enumMismatchField" in tool "invalid_type_tool" does not match declared type ""string"".',
    });
  });

  it('handles union type arrays correctly', () => {
    const unionConn: MCPConnection = {
      server: { name: 'union-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'union_tool',
          description: 'Tool with union types',
          inputSchema: {
            type: 'object',
            properties: {
              nullableStr: {
                type: ['string', 'null'],
                enum: ['abc', null],
              },
              badUnion: {
                type: ['string', 'invalid_entry'],
              },
            },
          },
        },
      ],
    };

    const results = typeMismatchCheck.run(unionConn);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.type-mismatch',
      severity: 'warning',
      message: 'Property "badUnion" in tool "union_tool" has invalid type union entry "invalid_entry".',
    });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('type mismatch internal error');
      },
    } as unknown as MCPConnection;

    const results = typeMismatchCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.type-mismatch',
      severity: 'error',
      serverName: 'exploding-server',
      message: expect.stringContaining('type mismatch internal error'),
    });
  });
});
