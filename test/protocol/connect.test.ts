import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { connect } from '../../src/protocol/connect.js';
import { LATEST_SUPPORTED_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '../../src/protocol/versions.js';

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

describe('protocol version negotiation', () => {
  it('defaults to "auto" and requests the latest supported version', async () => {
    const result = await connect(config('normal'), 1000);
    expect(result.status).toBe('connected');
    expect(result.protocolVersion).toEqual({
      requested: LATEST_SUPPORTED_PROTOCOL_VERSION,
      negotiated: LATEST_SUPPORTED_PROTOCOL_VERSION,
      compatible: true,
    });
    expect(result.serverInfo).toEqual({ name: 'fake', version: '1.0.0' });
  });

  it('requests an explicit supported version and reports it as compatible', async () => {
    const result = await connect(config('normal'), 1000, { protocolVersion: '2024-11-05' });
    expect(result.status).toBe('connected');
    expect(result.protocolVersion).toEqual({
      requested: '2024-11-05',
      negotiated: '2024-11-05',
      compatible: true,
    });
  });

  it('treats "auto" (case-sensitive keyword) the same as an unset preference', async () => {
    const withAuto = await connect(config('normal'), 1000, { protocolVersion: 'auto' });
    const withUnset = await connect(config('normal'), 1000, {});
    expect(withAuto.protocolVersion?.requested).toBe(LATEST_SUPPORTED_PROTOCOL_VERSION);
    expect(withUnset.protocolVersion?.requested).toBe(LATEST_SUPPORTED_PROTOCOL_VERSION);
  });

  it('accepts a compatible downgrade negotiated by the server', async () => {
    const result = await connect(config('downgrade'), 1000);
    expect(result.status).toBe('connected');
    expect(result.protocolVersion).toEqual({
      requested: LATEST_SUPPORTED_PROTOCOL_VERSION,
      negotiated: '2024-11-05',
      compatible: true,
    });
    // tools/list must still have been attempted for a compatible negotiation.
    expect(result.tools?.[0]?.name).toBe('echo');
  });

  it('fails cleanly (without listing tools) when the server negotiates an unsupported version', async () => {
    const result = await connect(config('incompatible-version'), 1000);
    expect(result.status).toBe('failed');
    expect(result.error?.stage).toBe('handshake');
    expect(result.protocolVersion).toEqual({
      requested: LATEST_SUPPORTED_PROTOCOL_VERSION,
      negotiated: '1999-01-01',
      compatible: false,
    });
    expect(result.tools).toBeUndefined();
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      expect(result.error?.message).toContain(v);
    }
  });

  it('reports a handshake failure when the server omits protocolVersion (protocol violation)', async () => {
    const result = await connect(config('no-protocol-version'), 1000);
    expect(result.status).toBe('failed');
    expect(result.error?.stage).toBe('handshake');
    expect(result.protocolVersion).toBeUndefined();
  });

  it('refuses a known-unsupported protocol version without spawning a process', async () => {
    // Deliberately bogus command: if this ever attempted to spawn, the
    // failure would be a 'spawn' stage error instead of 'handshake'.
    const result = await connect(
      { ...config('normal'), command: '/definitely/not/a-command' },
      1000,
      { protocolVersion: '2026-07-28' },
    );
    expect(result.status).toBe('failed');
    expect(result.error?.stage).toBe('handshake');
    expect(result.error?.message).toContain('2026-07-28');
    expect(result.error?.message.toLowerCase()).toContain('initialize');
  });
});

describe('resources/prompts capability inspection', () => {
  it('does not call resources/list or prompts/list when the server does not declare those capabilities', async () => {
    const result = await connect(config('normal'), 1000);
    expect(result.status).toBe('connected');
    expect(result.resources).toBeUndefined();
    expect(result.prompts).toBeUndefined();
    expect(result.capabilityErrors).toBeUndefined();
  });

  it('lists resources and prompts when the server declares both capabilities', async () => {
    const result = await connect(config('with-resources-prompts'), 1000);
    expect(result.status).toBe('connected');
    expect(result.capabilities).toEqual({ tools: {}, resources: {}, prompts: {} });
    expect(result.resources).toEqual([
      { uri: 'file:///tmp/notes.txt', name: 'notes', description: 'Scratch notes', mimeType: 'text/plain' },
    ]);
    expect(result.prompts).toEqual([
      { name: 'summarize', description: 'Summarize the input', arguments: [{ name: 'text', required: true }] },
    ]);
    expect(result.capabilityErrors).toBeUndefined();
    // tools/list must still have succeeded independently.
    expect(result.tools?.[0]?.name).toBe('echo');
  });

  it('reports a capability error but still connects when resources/list is malformed', async () => {
    const result = await connect(config('broken-resources'), 1000);
    expect(result.status).toBe('connected');
    expect(result.resources).toBeUndefined();
    expect(result.capabilityErrors?.resources).toMatch(/resources array/);
    // prompts capability was also declared and still listed successfully.
    expect(result.prompts?.[0]?.name).toBe('summarize');
    expect(result.capabilityErrors?.prompts).toBeUndefined();
  });

  it('reports a capability error but still connects when prompts/list is malformed', async () => {
    const result = await connect(config('broken-prompts'), 1000);
    expect(result.status).toBe('connected');
    expect(result.prompts).toBeUndefined();
    expect(result.capabilityErrors?.prompts).toMatch(/prompts array/);
    expect(result.resources?.[0]?.uri).toBe('file:///tmp/notes.txt');
  });
});
