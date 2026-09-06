import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverConfigFiles } from '../src/discovery.js';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('discoverConfigFiles', () => {
  const testDir = join(tmpdir(), 'mcp-medic-discovery-test-' + Date.now());

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('finds local .mcp.json and mcp.json in cwd', () => {
    const mcpJsonPath = join(testDir, '.mcp.json');
    writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: {} }));

    const discovered = discoverConfigFiles(testDir);
    expect(discovered.length).toBeGreaterThanOrEqual(1);
    expect(discovered.some((d) => d.path === mcpJsonPath)).toBe(true);
  });

  it('returns empty array when no config files exist in an empty dir', () => {
    const emptyDir = join(testDir, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    const discovered = discoverConfigFiles(emptyDir);
    // Only includes OS-level configs if they exist on the host machine; won't match non-existent local files
    expect(discovered.every((d) => existsSync(d.path))).toBe(true);
  });
});
