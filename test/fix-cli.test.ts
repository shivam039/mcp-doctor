import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { main } from '../src/cli.js';

/**
 * A minimal MCP-over-HTTP server, just enough for src/protocol/connect.ts's
 * HttpTransport to complete initialize + tools/list. Used to exercise
 * `mcp-doctor fix` end-to-end (real protocol layer, real security check,
 * real diff/prompt/write) without any network access.
 */
function startFakeMcpHttpServer(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        let request: { id?: number; method?: string } = {};
        try {
          request = JSON.parse(body || '{}');
        } catch {
          // ignore
        }

        if (request.method === 'initialize') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: '2024-11-05',
                capabilities: { tools: {} },
                serverInfo: { name: 'fake-http', version: '1.0.0' },
              },
            }),
          );
        } else if (request.method === 'notifications/initialized') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        } else if (request.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { tools: [{ name: 'echo', description: 'Echoes input.', inputSchema: { type: 'object' } }] },
            }),
          );
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'unknown method' } }));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

describe('mcp-doctor fix (end-to-end against a real, local MCP-over-HTTP server)', () => {
  let server: Server;
  let dir: string;

  afterEach(async () => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  async function setup() {
    const started = await startFakeMcpHttpServer();
    server = started.server;
    dir = mkdtempSync(path.join(tmpdir(), 'mcp-doctor-fix-'));
    const configPath = path.join(dir, 'config.json');
    const rawConfig = {
      servers: [
        {
          name: 'insecure-remote',
          transport: 'http',
          url: `http://127.0.0.1:${started.port}/mcp`,
        },
      ],
    };
    writeFileSync(configPath, JSON.stringify(rawConfig, null, 2));
    return { configPath, rawConfig };
  }

  it('shows the diff and applies the fix on confirmation, writing a .bak first', async () => {
    const { configPath } = await setup();

    const code = await main(['fix', configPath], { confirm: async () => true });

    expect(code).toBe(0);
    expect(existsSync(`${configPath}.bak`)).toBe(true);

    const backup = JSON.parse(readFileSync(`${configPath}.bak`, 'utf-8'));
    expect(backup.servers[0].url).toMatch(/^http:\/\//);

    const fixed = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(fixed.servers[0].url).toMatch(/^https:\/\//);
  });

  it('does not write anything when the user declines the fix', async () => {
    const { configPath, rawConfig } = await setup();

    const code = await main(['fix', configPath], { confirm: async () => false });

    expect(code).toBe(0);
    expect(existsSync(`${configPath}.bak`)).toBe(false);
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(rawConfig);
  });

  it('--dry-run shows fixes without prompting or writing anything', async () => {
    const { configPath, rawConfig } = await setup();

    let promptCalled = false;
    const code = await main(['fix', configPath, '--dry-run'], {
      confirm: async () => {
        promptCalled = true;
        return true;
      },
    });

    expect(code).toBe(0);
    expect(promptCalled).toBe(false);
    expect(existsSync(`${configPath}.bak`)).toBe(false);
    expect(JSON.parse(readFileSync(configPath, 'utf-8'))).toEqual(rawConfig);
  });

  it('--check <id> filters fixes to a single check id', async () => {
    const { configPath } = await setup();

    const noMatch = await main(['fix', configPath, '--check', 'schema.malformed'], {
      confirm: async () => true,
    });
    expect(noMatch).toBe(0);
    expect(existsSync(`${configPath}.bak`)).toBe(false); // filtered out, nothing applied

    const match = await main(['fix', configPath, '--check', 'security.untrusted-remote'], {
      confirm: async () => true,
    });
    expect(match).toBe(0);
    expect(existsSync(`${configPath}.bak`)).toBe(true);
  });

  describe('idempotency (FR3-1.4)', () => {
    // The check-level guarantee (re-running security.untrusted-remote against
    // an already-fixed connection reports zero diagnostics) is unit-tested
    // directly in test/checks/security-untrusted-remote.test.ts. This test
    // covers the CLI-level guarantee: running `fix` twice never re-prompts
    // or re-writes. (The fake server here only listens on http, so the
    // second run's https recheck fails to connect rather than reporting a
    // clean security check — either way, nothing fixable is found.)
    it('running fix twice: the second run finds nothing left to fix', async () => {
      const { configPath } = await setup();

      const first = await main(['fix', configPath], { confirm: async () => true });
      expect(first).toBe(0);
      const afterFirst = readFileSync(configPath, 'utf-8');

      let promptCalledOnSecondRun = false;
      const second = await main(['fix', configPath], {
        confirm: async () => {
          promptCalledOnSecondRun = true;
          return true;
        },
      });

      expect(second).toBe(0);
      expect(promptCalledOnSecondRun).toBe(false); // nothing fixable was found — never even asked
      expect(readFileSync(configPath, 'utf-8')).toBe(afterFirst); // file unchanged by the second run
    });
  });
});
