import { describe, it, expect, afterEach } from 'vitest';
import { parseArgs, main } from '../src/cli.js';
import { resolve } from 'node:path';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

  it('parses --protocol-version, defaulting to "auto"', () => {
    expect(parseArgs(['check', 'x.json']).protocolVersion).toBe('auto');
    expect(parseArgs(['check', 'x.json', '--protocol-version', '2025-06-18']).protocolVersion).toBe(
      '2025-06-18',
    );
  });

  it('rejects --protocol-version with no value', () => {
    expect(() => parseArgs(['check', 'x.json', '--protocol-version'])).toThrow(
      /--protocol-version requires a value/,
    );
  });

  it('parses the score command, implying --score', () => {
    const args = parseArgs(['score', 'x.json']);
    expect(args.command).toBe('score');
    expect(args.configPath).toBe('x.json');
    expect(args.showScore).toBe(true);
  });

  it('parses --score as a flag on the check command', () => {
    expect(parseArgs(['check', 'x.json']).showScore).toBe(false);
    expect(parseArgs(['check', 'x.json', '--score']).showScore).toBe(true);
  });

  it('omits the quality field in --json output when nothing connected', async () => {
    const { writeFileSync } = await import('node:fs');
    const configFile = join(tmpdir(), `mcp-medic-quality-unreachable-${Date.now()}.json`);
    writeFileSync(
      configFile,
      JSON.stringify({ servers: [{ name: 'unreachable', transport: 'http', url: 'http://127.0.0.1:1/mcp' }] }),
    );

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await main(['check', configFile, '--json']);
    } finally {
      console.log = originalLog;
      rmSync(configFile);
    }
    const report = JSON.parse(logs[0]);
    expect(report.quality).toBeUndefined();
    expect(report.summary.connected).toBe(0);
  });

  it('always includes a quality field in --json output for a connected server', async () => {
    const { writeFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const fixture = fileURLToPath(new URL('./fixtures/fake-mcp-server.js', import.meta.url));
    const configFile = join(tmpdir(), `mcp-medic-quality-connected-${Date.now()}.json`);
    writeFileSync(
      configFile,
      JSON.stringify({ servers: [{ name: 'fake', transport: 'stdio', command: process.execPath, args: [fixture, 'normal'] }] }),
    );

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await main(['check', configFile, '--json']);
    } finally {
      console.log = originalLog;
      rmSync(configFile);
    }
    const report = JSON.parse(logs[0]);
    expect(report.quality).toBeDefined();
    expect(report.quality.overall).toBeGreaterThanOrEqual(0);
    expect(report.quality.dimensions).toHaveProperty('protocol');
    expect(report.quality.perServer.fake).toBeDefined();
  });

  describe('quality.minimumScore policy gate', () => {
    const fixture = fileURLToPath(new URL('./fixtures/fake-mcp-server.js', import.meta.url));

    it('stays silent about coverage under normal CLI usage, where the full built-in check set always runs', async () => {
      const { writeFileSync } = await import('node:fs');
      const configFile = join(tmpdir(), `mcp-medic-partial-coverage-config-${Date.now()}.json`);
      const policyFile = join(tmpdir(), `mcp-medic-partial-coverage-policy-${Date.now()}.json`);
      writeFileSync(
        configFile,
        JSON.stringify({ servers: [{ name: 'fake', transport: 'stdio', command: process.execPath, args: [fixture, 'normal'] }] }),
      );
      writeFileSync(policyFile, JSON.stringify({ quality: { minimumScore: 50 } }));

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);
      let code: number;
      try {
        // The CLI always loads the full built-in check set (plus any
        // policy-derived checks) — there's no CLI flag to run a subset —
        // so coverage is always 100% here. The partial-coverage warning
        // itself is unit-tested directly against checkMinimumScorePolicy()
        // in test/quality-score.test.ts, since the CLI can't reach that
        // state through normal usage.
        code = await main(['check', configFile, '--json', '--policy', policyFile]);
      } finally {
        console.log = originalLog;
        rmSync(configFile);
        rmSync(policyFile);
      }
      const report = JSON.parse(logs[0]);
      expect(code).toBe(0); // score is 100, well above the 50 minimum
      expect(report.quality.coveragePercent).toBe(100);
      expect(report.diagnostics.some((d: { checkId: string }) => d.checkId === 'policy.partial-coverage-with-minimum-score')).toBe(false);
    });

    it('fails the run when the score is below the configured minimum', async () => {
      const { writeFileSync } = await import('node:fs');
      const configFile = join(tmpdir(), `mcp-medic-min-score-config-${Date.now()}.json`);
      const policyFile = join(tmpdir(), `mcp-medic-min-score-policy-${Date.now()}.json`);
      writeFileSync(
        configFile,
        JSON.stringify({ servers: [{ name: 'fake', transport: 'stdio', command: process.execPath, args: [fixture, 'normal'] }] }),
      );
      writeFileSync(policyFile, JSON.stringify({ quality: { minimumScore: 101 } })); // impossible to meet

      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);
      let code: number;
      try {
        code = await main(['check', configFile, '--json', '--policy', policyFile]);
      } finally {
        console.log = originalLog;
        rmSync(configFile);
        rmSync(policyFile);
      }
      const report = JSON.parse(logs[0]);
      expect(code).toBe(1);
      expect(report.diagnostics.some((d: { checkId: string }) => d.checkId === 'policy.minimum-quality-score')).toBe(true);
    });
  });

  describe('--export-sarif', () => {
    const outFile = join(tmpdir(), `mcp-medic-sarif-test-${Date.now()}.sarif.json`);
    // Loopback port with nothing listening: connection refused immediately,
    // no network egress and no timeout wait — just needs a report to exist.
    const configFile = join(tmpdir(), `mcp-medic-sarif-config-${Date.now()}.json`);

    afterEach(() => {
      if (existsSync(outFile)) rmSync(outFile);
      if (existsSync(configFile)) rmSync(configFile);
    });

    it('writes a well-formed SARIF file alongside the normal report', async () => {
      const { writeFileSync } = await import('node:fs');
      writeFileSync(
        configFile,
        JSON.stringify({ servers: [{ name: 'unreachable', transport: 'http', url: 'http://127.0.0.1:1/mcp' }] }),
      );

      const code = await main(['check', configFile, '--json', '--export-sarif', outFile]);
      // A connection failure alone (no diagnostics ran) doesn't fail the exit code;
      // what matters here is that the report still exists and gets exported.
      expect(code).toBe(0);
      expect(existsSync(outFile)).toBe(true);
      const sarif = JSON.parse(readFileSync(outFile, 'utf-8'));
      expect(sarif.version).toBe('2.1.0');
      expect(sarif.runs[0].tool.driver.name).toBe('mcp-medic');
    });
  });
});
