import { describe, it, expect } from 'vitest';
import { missingDescriptionCheck } from '../../src/checks/missing-description.js';
import {
  validConnection,
  missingDescriptionConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('missingDescriptionCheck (schema.missing-description)', () => {
  it('returns no diagnostics when all descriptions are present', () => {
    const results = missingDescriptionCheck.run(validConnection);
    expect(results).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(missingDescriptionCheck.run(emptyToolsConnection)).toEqual([]);
    expect(missingDescriptionCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags missing top-level description as warning and missing property description as info', () => {
    const results = missingDescriptionCheck.run(missingDescriptionConnection);
    expect(results).toHaveLength(2);

    // Missing tool description -> warning
    expect(results[0]).toMatchObject({
      checkId: 'schema.missing-description',
      severity: 'warning',
      serverName: 'missing-description-server',
      toolName: 'undocumented_tool',
      message: 'Tool "undocumented_tool" is missing a description.',
    });

    // Missing property description -> info
    expect(results[1]).toMatchObject({
      checkId: 'schema.missing-description',
      severity: 'info',
      serverName: 'missing-description-server',
      toolName: 'undocumented_tool',
      message: 'Property "paramOne" in tool "undocumented_tool" is missing a description.',
      details: { property: 'paramOne' },
    });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('description check failure');
      },
    } as unknown as MCPConnection;

    const results = missingDescriptionCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'schema.missing-description',
      severity: 'error',
      serverName: 'exploding-server',
      message: expect.stringContaining('description check failure'),
    });
  });
});
