import { describe, it, expect } from 'vitest';
import { resolveRegistryServer } from '../src/registry.js';

describe('resolveRegistryServer', () => {
  it('resolves direct npm package identifier to stdio npx command', async () => {
    const config = await resolveRegistryServer('@modelcontextprotocol/server-memory');
    expect(config).toEqual({
      name: '@modelcontextprotocol/server-memory',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    });
  });

  it('resolves npm: prefix identifier', async () => {
    const config = await resolveRegistryServer('npm:mcp-server-sqlite');
    expect(config).toEqual({
      name: 'mcp-server-sqlite',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'mcp-server-sqlite'],
    });
  });

  it('resolves pypi: / uvx: prefix identifier', async () => {
    const config = await resolveRegistryServer('uvx:mcp-server-git');
    expect(config).toEqual({
      name: 'mcp-server-git',
      transport: 'stdio',
      command: 'uvx',
      args: ['mcp-server-git'],
    });
  });

  it('resolves smithery community identifier', async () => {
    const config = await resolveRegistryServer('smithery:author/test-server');
    expect(config).toEqual({
      name: 'smithery/author/test-server',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@smithery/cli@latest', 'run', 'author/test-server'],
    });
  });

  it('resolves direct SSE URL endpoint', async () => {
    const config = await resolveRegistryServer('https://api.example.com/mcp/sse');
    expect(config).toEqual({
      name: 'api.example.com/mcp/sse',
      transport: 'sse',
      url: 'https://api.example.com/mcp/sse',
    });
  });

  it('resolves remote JSON descriptor with custom fetch', async () => {
    const mockFetch = async () =>
      ({
        ok: true,
        json: async () => ({
          name: 'remote-weather',
          command: 'node',
          args: ['weather.js'],
        }),
      }) as unknown as Response;

    const config = await resolveRegistryServer('https://registry.example.com/servers/weather.json', {
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(config).toEqual({
      name: 'remote-weather',
      transport: 'stdio',
      command: 'node',
      args: ['weather.js'],
      env: undefined,
      headers: undefined,
      url: undefined,
    });
  });

  it('throws on empty string', async () => {
    await expect(resolveRegistryServer('   ')).rejects.toThrow('empty');
  });
});
