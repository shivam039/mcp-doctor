import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { connect } from '../../src/protocol/connect.js';

const fixture = fileURLToPath(new URL('../fixtures/fake-mcp-server.js', import.meta.url));
const config = (mode = 'normal') => ({
  name: 'fake',
  transport: 'stdio' as const,
  command: execPath,
  args: [fixture, mode],
});

describe('stdio MCP protocol', () => {
  it('performs initialize and lists tools', async () => {
    const result = await connect(config(), 1000);
    expect(result.status).toBe('connected');
    expect(result.capabilities).toEqual({ tools: {} });
    expect(result.tools?.[0]).toMatchObject({ name: 'echo', description: 'Echoes input' });
  });

  it('reports a handshake timeout', async () => {
    const result = await connect(config('hang'), 50);
    expect(result.status).toBe('timeout');
    expect(result.error?.stage).toBe('handshake');
  });

  it('reports process spawn failures without throwing', async () => {
    const result = await connect({ ...config(), command: '/definitely/not/a-command' }, 1000);
    expect(result.status).toBe('failed');
    expect(result.error?.stage).toBe('spawn');
  });

  it('reports malformed initialize responses', async () => {
    const result = await connect(config('malformed'), 1000);
    expect(result.status).toBe('failed');
    expect(result.error?.stage).toBe('handshake');
  });
});
