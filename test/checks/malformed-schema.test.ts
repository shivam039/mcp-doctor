import { describe, it, expect } from 'vitest';
import { malformedSchemaCheck } from '../../src/checks/malformed-schema.js';
import {
  validConnection,
  malformedSchemaConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('malformedSchemaCheck (schema.malformed)', () => {
  it('returns no diagnostics for a valid tool schema', () => {
    const results = malformedSchemaCheck.run(validConnection);
    expect(results).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(malformedSchemaCheck.run(emptyToolsConnection)).toEqual([]);
    expect(malformedSchemaCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags non-object schemas as errors and missing type schemas as warnings', () => {
    const results = malformedSchemaCheck.run(malformedSchemaConnection);
    expect(results).toHaveLength(5);

    // string schema
    expect(results[0]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'error',
      serverName: 'malformed-schema-server',
      toolName: 'string_schema_tool',
    });

    // null schema
    expect(results[1]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'error',
      serverName: 'malformed-schema-server',
      toolName: 'null_schema_tool',
    });

    // array schema
    expect(results[2]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'error',
      serverName: 'malformed-schema-server',
      toolName: 'array_schema_tool',
    });

    // missing type but has properties
    expect(results[3]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'warning',
      serverName: 'malformed-schema-server',
      toolName: 'missing_type_schema_tool',
    });

    // empty object
    expect(results[4]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'warning',
      serverName: 'malformed-schema-server',
      toolName: 'empty_object_schema_tool',
    });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = malformedSchemaCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.malformed',
      severity: 'error',
      serverName: 'exploding-server',
      message: expect.stringContaining('boom'),
    });
  });
});
