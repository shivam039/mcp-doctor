import { describe, it, expect } from 'vitest';
import { qualityResourcesCheck } from '../../src/checks/quality-resources.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (resources: MCPConnection['resources']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  resources,
});

describe('qualityResourcesCheck (quality.resource)', () => {
  it('returns no diagnostics when resources were never declared/inspected', () => {
    expect(qualityResourcesCheck.run({ server: { name: 's', transport: 'stdio' }, status: 'connected' })).toEqual([]);
  });

  it('returns no diagnostics for a well-formed resource', () => {
    const results = qualityResourcesCheck.run(
      conn([{ uri: 'file:///notes.txt', name: 'notes', description: 'Scratch notes.', mimeType: 'text/plain' }]),
    );
    expect(results).toEqual([]);
  });

  it('flags an empty/invalid uri as an error', () => {
    const results = qualityResourcesCheck.run(conn([{ uri: '', name: 'x' }]));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.resource', severity: 'error', category: 'schema' });
  });

  it('flags a missing name as an error (required by spec)', () => {
    const results = qualityResourcesCheck.run(conn([{ uri: 'file:///x.txt' }]));
    expect(results.find((r) => r.message.includes('missing a "name"'))).toMatchObject({ severity: 'error' });
  });

  it('flags a missing description as an info note (optional per spec)', () => {
    const results = qualityResourcesCheck.run(conn([{ uri: 'file:///x.txt', name: 'x' }]));
    expect(results.find((r) => r.message.includes('no description'))).toMatchObject({
      severity: 'info',
      category: 'quality',
    });
  });

  it('flags duplicate URIs as an error', () => {
    const results = qualityResourcesCheck.run(
      conn([
        { uri: 'file:///dup.txt', name: 'a', description: 'd' },
        { uri: 'file:///dup.txt', name: 'b', description: 'd' },
      ]),
    );
    const dup = results.find((r) => r.message.includes('declared 2 times'));
    expect(dup).toMatchObject({ checkId: 'quality.resource', severity: 'error' });
  });

  it('flags an invalid negative size', () => {
    const results = qualityResourcesCheck.run(conn([{ uri: 'file:///x.txt', name: 'x', description: 'd', size: -5 }]));
    expect(results.find((r) => r.message.includes('invalid "size"'))).toMatchObject({ severity: 'warning' });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get resources() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityResourcesCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.resource', severity: 'error' });
  });
});
