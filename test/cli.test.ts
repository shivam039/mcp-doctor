import { describe, it, expect } from 'vitest';
import { parseArgs, main } from '../src/cli.js';
import { resolve } from 'node:path';

describe('CLI argument parsing and execution', () => {
  it('parses options correctly', () => {
    const args = parseArgs([
      'check',
      'test/fixtures/configs/valid-stdio.json',
      '--json',
      '--show-fixes',
      '--verbose',
      '--fail-on',
      'warning',
      '--timeout',
      '3000',
    ]);

    expect(args.command).toBe('check');
    expect(args.configPath).toBe('test/fixtures/configs/valid-stdio.json');
    expect(args.json).toBe(true);
    expect(args.showFixes).toBe(true);
    expect(args.verbose).toBe(true);
    expect(args.failOn).toBe('warning');
    expect(args.timeoutMs).toBe(3000);
  });

  it('handles help command', async () => {
    const code = await main(['--help']);
    expect(code).toBe(0);
  });

  it('returns exit code 2 on invalid config path', async () => {
    const code = await main(['check', 'non-existent-config-file.json']);
    expect(code).toBe(2);
  });

  it('returns exit code 2 on invalid arguments', async () => {
    const code = await main(['check', '--fail-on', 'invalid-severity']);
    expect(code).toBe(2);
  });

  it('returns exit code 2 on malformed JSON config', async () => {
    const code = await main(['check', 'test/fixtures/configs/wrong-transport-value.json']);
    expect(code).toBe(2);
  });

  it('parses --registry argument correctly', () => {
    const args = parseArgs(['check', '--registry', '@modelcontextprotocol/server-memory']);
    expect(args.command).toBe('check');
    expect(args.registryServer).toBe('@modelcontextprotocol/server-memory');
  });
});
