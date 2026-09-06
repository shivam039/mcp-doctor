import { describe, it, expect } from 'vitest';
import { isConfigPatch, diffConfigPatch, applyConfigPatch, formatFieldDiff, isRawMcpConfig } from '../src/fix.js';

const sampleConfig = {
  servers: [
    { name: 'a', transport: 'http', url: 'http://a.example.com/mcp' },
    { name: 'b', transport: 'stdio', command: 'node' },
  ],
};

describe('isConfigPatch', () => {
  it('accepts a well-formed patch', () => {
    expect(isConfigPatch({ serverName: 'a', set: { url: 'https://a.example.com/mcp' } })).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isConfigPatch(undefined)).toBe(false);
    expect(isConfigPatch(null)).toBe(false);
    expect(isConfigPatch('not a patch')).toBe(false);
    expect(isConfigPatch({ serverName: 'a' })).toBe(false);
    expect(isConfigPatch({ set: {} })).toBe(false);
    expect(isConfigPatch({ serverName: '', set: {} })).toBe(false);
    expect(isConfigPatch({ serverName: 'a', set: null })).toBe(false);
    expect(isConfigPatch({ serverName: 'a', set: [] })).toBe(false);
  });
});

describe('isRawMcpConfig', () => {
  it('accepts a config-shaped object', () => {
    expect(isRawMcpConfig(sampleConfig)).toBe(true);
  });

  it('rejects non-config values', () => {
    expect(isRawMcpConfig(null)).toBe(false);
    expect(isRawMcpConfig({})).toBe(false);
    expect(isRawMcpConfig({ servers: 'nope' })).toBe(false);
    expect(isRawMcpConfig([])).toBe(false);
  });
});

describe('diffConfigPatch', () => {
  it('reports a diff when the field differs', () => {
    const patch = { serverName: 'a', set: { url: 'https://a.example.com/mcp' } };
    expect(diffConfigPatch(sampleConfig, patch)).toEqual([
      { field: 'url', before: 'http://a.example.com/mcp', after: 'https://a.example.com/mcp' },
    ]);
  });

  it('returns [] when every field already matches (already fixed)', () => {
    const patch = { serverName: 'a', set: { url: 'http://a.example.com/mcp' } };
    expect(diffConfigPatch(sampleConfig, patch)).toEqual([]);
  });

  it('returns [] when the target server does not exist', () => {
    const patch = { serverName: 'does-not-exist', set: { url: 'https://x/mcp' } };
    expect(diffConfigPatch(sampleConfig, patch)).toEqual([]);
  });

  it('returns [] for a non-config input instead of throwing', () => {
    expect(diffConfigPatch('not a config', { serverName: 'a', set: {} })).toEqual([]);
  });

  it('reports a diff for a field that does not exist yet on the server', () => {
    const patch = { serverName: 'b', set: { headers: { Authorization: 'Bearer x' } } };
    expect(diffConfigPatch(sampleConfig, patch)).toEqual([
      { field: 'headers', before: undefined, after: { Authorization: 'Bearer x' } },
    ]);
  });
});

describe('applyConfigPatch', () => {
  it('merges patch fields into the named server without mutating the input', () => {
    const patch = { serverName: 'a', set: { url: 'https://a.example.com/mcp' } };
    const result = applyConfigPatch(sampleConfig, patch);

    expect(result.servers[0]).toEqual({ name: 'a', transport: 'http', url: 'https://a.example.com/mcp' });
    expect(result.servers[1]).toEqual(sampleConfig.servers[1]);
    // original untouched
    expect(sampleConfig.servers[0].url).toBe('http://a.example.com/mcp');
  });

  it('leaves the config unchanged (structurally) when the target server does not exist', () => {
    const patch = { serverName: 'does-not-exist', set: { url: 'https://x/mcp' } };
    expect(applyConfigPatch(sampleConfig, patch)).toEqual(sampleConfig);
  });

  it('throws on a non-config input', () => {
    expect(() => applyConfigPatch('not a config', { serverName: 'a', set: {} })).toThrow();
  });

  it('is idempotent: applying the same patch twice yields the same result as applying it once', () => {
    const patch = { serverName: 'a', set: { url: 'https://a.example.com/mcp' } };
    const once = applyConfigPatch(sampleConfig, patch);
    const twice = applyConfigPatch(once, patch);
    expect(twice).toEqual(once);
    expect(diffConfigPatch(once, patch)).toEqual([]);
  });
});

describe('formatFieldDiff', () => {
  it('renders a before/after pair', () => {
    const text = formatFieldDiff({ field: 'url', before: 'http://a', after: 'https://a' });
    expect(text).toContain('- url: "http://a"');
    expect(text).toContain('+ url: "https://a"');
  });
});
