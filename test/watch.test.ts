import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { watchFileDebounced } from '../src/watch.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('watchFileDebounced', () => {
  const testFile = join(tmpdir(), `watch-test-${Date.now()}.json`);

  beforeEach(() => {
    writeFileSync(testFile, JSON.stringify({ mcpServers: {} }));
  });

  afterEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  it('debounces rapid changes and triggers callback', async () => {
    let callCount = 0;
    const watcher = watchFileDebounced(testFile, {
      debounceMs: 50,
      onTrigger: () => {
        callCount++;
      },
    });

    try {
      // Small pause to allow file system watchers to attach
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Rapid writes
      writeFileSync(testFile, JSON.stringify({ mcpServers: { a: {} } }));
      writeFileSync(testFile, JSON.stringify({ mcpServers: { b: {} } }));
      writeFileSync(testFile, JSON.stringify({ mcpServers: { c: {} } }));

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(callCount).toBeGreaterThanOrEqual(1);
    } finally {
      watcher.close();
    }
  });
});
