import { describe, it, expect } from 'vitest';
import { missingRequiredFieldsCheck } from '../../src/checks/missing-required-fields.js';
import {
  validConnection,
  missingRequiredFieldsConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('missingRequiredFieldsCheck (schema.missing-required)', () => {
  it('returns no diagnostics for a valid tool schema', () => {
    const results = missingRequiredFieldsCheck.run(validConnection);
    expect(results).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(missingRequiredFieldsCheck.run(emptyToolsConnection)).toEqual([]);
    expect(missingRequiredFieldsCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags required fields that do not exist in properties as error', () => {
    const results = missingRequiredFieldsCheck.run(missingRequiredFieldsConnection);
    expect(results).toHaveLength(2);

    expect(results[0]).toMatchObject({
      checkId: 'schema.missing-required',
      severity: 'error',
      serverName: 'missing-required-server',
      toolName: 'broken_required_tool',
      message: 'Tool "broken_required_tool" lists required field "nonExistentField1", but it is not defined in "properties".',
    });

    expect(results[1]).toMatchObject({
      checkId: 'schema.missing-required',
      severity: 'error',
      serverName: 'missing-required-server',
      toolName: 'broken_required_tool',
      message: 'Tool "broken_required_tool" lists required field "nonExistentField2", but it is not defined in "properties".',
    });
  });

  it('handles non-object inputSchemas gracefully', () => {
    const conn: MCPConnection = {
      server: { name: 'test-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'invalid_schema_tool',
          inputSchema: 'not an object',
        },
      ],
    };
    expect(missingRequiredFieldsCheck.run(conn)).toEqual([]);
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('internal error');
      },
    } as unknown as MCPConnection;

    const results = missingRequiredFieldsCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.missing-required',
      severity: 'error',
      serverName: 'exploding-server',
      message: expect.stringContaining('internal error'),
    });
  });
});
