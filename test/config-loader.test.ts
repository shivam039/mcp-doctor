import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config-loader.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/configs');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

describe('loadConfig', () => {
  it('accepts a valid single-server stdio config', () => {
    const result = loadConfig(loadFixture('valid-stdio.json'));
    expect(result.errors).toEqual([]);
    expect(result.config?.servers).toHaveLength(1);
  });

  it('rejects a stdio server missing command', () => {
    const result = loadConfig(loadFixture('missing-command.json'));
    expect(result.config).toBeUndefined();
    expect(result.errors).toContain("server[0] (\"broken-stdio\"): missing 'command' for stdio transport");
  });

  it('rejects an invalid transport value', () => {
    const result = loadConfig(loadFixture('wrong-transport-value.json'));
    expect(result.config).toBeUndefined();
    expect(result.errors[0]).toMatch(/invalid transport/);
  });

  it('accepts a multi-server config with mixed transports', () => {
    const result = loadConfig(loadFixture('multi-server.json'));
    expect(result.errors).toEqual([]);
    expect(result.config?.servers).toHaveLength(3);
  });

  it('accepts an http config with headers', () => {
    const result = loadConfig(loadFixture('auth-header-http.json'));
    expect(result.errors).toEqual([]);
    expect(result.config?.servers[0].headers).toBeDefined();
  });

  it('accepts an empty servers list without crashing', () => {
    const result = loadConfig(loadFixture('empty-servers.json'));
    expect(result.errors).toEqual([]);
    expect(result.config?.servers).toEqual([]);
  });

  it('rejects non-object input', () => {
    const result = loadConfig(null);
    expect(result.config).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects a config where servers is not an array', () => {
    const result = loadConfig({ servers: 'nope' });
    expect(result.config).toBeUndefined();
    expect(result.errors[0]).toMatch(/"servers" must be an array/);
  });
});
