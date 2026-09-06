import { describe, it, expect } from 'vitest';
import { qualityPromptsCheck } from '../../src/checks/quality-prompts.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (prompts: MCPConnection['prompts']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  prompts,
});

describe('qualityPromptsCheck (quality.prompt)', () => {
  it('returns no diagnostics when prompts were never declared/inspected', () => {
    expect(qualityPromptsCheck.run({ server: { name: 's', transport: 'stdio' }, status: 'connected' })).toEqual([]);
  });

  it('returns no diagnostics for a well-formed prompt', () => {
    const results = qualityPromptsCheck.run(
      conn([{ name: 'summarize', description: 'Summarizes the given text.', arguments: [{ name: 'text', required: true }] }]),
    );
    expect(results).toEqual([]);
  });

  it('flags an empty/invalid prompt name as an error', () => {
    const results = qualityPromptsCheck.run(conn([{ name: '', description: 'd' }]));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.prompt', severity: 'error', category: 'schema' });
  });

  it('flags a missing description as an info note', () => {
    const results = qualityPromptsCheck.run(conn([{ name: 'p' }]));
    expect(results.find((r) => r.message.includes('no description'))).toMatchObject({ severity: 'info' });
  });

  it('flags a placeholder description as a warning', () => {
    const results = qualityPromptsCheck.run(conn([{ name: 'p', description: 'TODO' }]));
    expect(results.find((r) => r.message.includes('placeholder'))).toMatchObject({ severity: 'warning' });
  });

  it('flags duplicate prompt names as an error', () => {
    const results = qualityPromptsCheck.run(
      conn([
        { name: 'p', description: 'd1' },
        { name: 'p', description: 'd2' },
      ]),
    );
    const dup = results.find((r) => r.message.includes('declared 2 times') && r.message.includes('Prompt name'));
    expect(dup).toMatchObject({ severity: 'error' });
  });

  it('flags an argument with an empty/missing name', () => {
    const results = qualityPromptsCheck.run(conn([{ name: 'p', description: 'd', arguments: [{ name: '' }] }]));
    expect(results.find((r) => r.message.includes('empty or missing "name"'))).toMatchObject({ severity: 'error' });
  });

  it('flags duplicate argument names within a prompt', () => {
    const results = qualityPromptsCheck.run(
      conn([{ name: 'p', description: 'd', arguments: [{ name: 'text' }, { name: 'text' }] }]),
    );
    expect(results.find((r) => r.message.includes('declares argument "text" 2 times'))).toMatchObject({
      severity: 'error',
    });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get prompts() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityPromptsCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.prompt', severity: 'error' });
  });
});
