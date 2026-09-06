import { describe, it, expect } from 'vitest';
import { parseArgs, main } from '../src/cli.js';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

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

  it('handles --version and -V by printing the installed package version', async () => {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')) as { version: string };

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      expect(await main(['--version'])).toBe(0);
      expect(await main(['-V'])).toBe(0);
    } finally {
      console.log = originalLog;
    }

    expect(logs).toEqual([pkg.version, pkg.version]);
  });

  it('parses --version and -V as the version command', () => {
    expect(parseArgs(['--version']).command).toBe('version');
    expect(parseArgs(['-V']).command).toBe('version');
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

  it('parses check-all and diff commands correctly', () => {
    const argsAll = parseArgs(['check-all', 'configs/**/*.json', '--policy', 'my-policy.json', '--junit', 'results.xml']);
    expect(argsAll.command).toBe('check-all');
    expect(argsAll.globPattern).toBe('configs/**/*.json');
    expect(argsAll.policyPath).toBe('my-policy.json');
    expect(argsAll.exportJunit).toBe('results.xml');

    const argsDiff = parseArgs(['diff', 'staging.json', 'prod.json', '--json']);
    expect(argsDiff.command).toBe('diff');
    expect(argsDiff.configPath).toBe('staging.json');
    expect(argsDiff.configPathB).toBe('prod.json');
    expect(argsDiff.json).toBe(true);
  });

  it('executes diff command comparing two identical configs', async () => {
    const code = await main([
      'diff',
      'test/fixtures/configs/valid-stdio.json',
      'test/fixtures/configs/valid-stdio.json',
      '--json',
    ]);
    expect(code).toBe(0);
  });
});
