import type { MCPServerConfig } from './types.js';

export interface RegistryResolveOptions {
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/**
 * Resolves a published MCP server descriptor or registry identifier into an MCPServerConfig.
 *
 * Supported formats:
 * - Direct HTTP/SSE URL: "https://mcp.example.com/sse" -> sse/http config
 * - NPM/Npx package: "npm:@modelcontextprotocol/server-memory" or "@modelcontextprotocol/server-memory" -> stdio npx
 * - PyPI/Uvx package: "pypi:mcp-server-git" or "uvx:mcp-server-git" -> stdio uvx
 * - Registry URL returning JSON server config: "https://registry.example.com/servers/my-tool.json"
 * - Smithery / Glama server ID: "smithery:username/server-name"
 */
export async function resolveRegistryServer(
  registryId: string,
  options: RegistryResolveOptions = {},
): Promise<MCPServerConfig> {
  const trimmed = registryId.trim();
  const fetchImpl = options.fetchFn ?? fetch;

  if (!trimmed) {
    throw new Error('Registry server identifier cannot be empty');
  }

  // 1. Direct URL (HTTP / SSE / JSON manifest)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const url = new URL(trimmed);
    // If URL points to a JSON manifest
    if (url.pathname.endsWith('.json')) {
      const res = await fetchImpl(trimmed, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch registry descriptor from ${trimmed}: HTTP ${res.status}`);
      }
      const data = (await res.json()) as Record<string, unknown>;
      if (typeof data.command === 'string' || typeof data.url === 'string') {
        return {
          name: (typeof data.name === 'string' && data.name) || url.pathname.split('/').pop()?.replace('.json', '') || 'registry-server',
          transport: (data.transport as MCPServerConfig['transport']) || (data.url ? (data.url.toString().includes('sse') ? 'sse' : 'http') : 'stdio'),
          command: typeof data.command === 'string' ? data.command : undefined,
          args: Array.isArray(data.args) ? (data.args as string[]) : undefined,
          env: (data.env as Record<string, string>) || undefined,
          url: typeof data.url === 'string' ? data.url : undefined,
          headers: (data.headers as Record<string, string>) || undefined,
        };
      }
    }

    // Default URL endpoint transport (SSE if contains 'sse', otherwise HTTP)
    const isSse = url.pathname.includes('sse') || url.searchParams.has('sse');
    return {
      name: url.hostname + url.pathname.replace(/\/$/, ''),
      transport: isSse ? 'sse' : 'http',
      url: trimmed,
    };
  }

  // 2. PyPI / uvx package prefix
  if (trimmed.startsWith('pypi:') || trimmed.startsWith('uvx:')) {
    const pkg = trimmed.replace(/^(pypi:|uvx:)/, '');
    return {
      name: pkg,
      transport: 'stdio',
      command: 'uvx',
      args: [pkg],
    };
  }

  // 3. NPM package prefix
  if (trimmed.startsWith('npm:')) {
    const pkg = trimmed.slice(4);
    return {
      name: pkg,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', pkg],
    };
  }

  // 4. Smithery / Glama community identifier
  if (trimmed.startsWith('smithery:')) {
    const serverName = trimmed.slice(9);
    return {
      name: `smithery/${serverName}`,
      transport: 'stdio',
      command: 'npx',
      args: ['-y', `@smithery/cli@latest`, 'run', serverName],
    };
  }

  // 5. Default scoped or standard npm package identifier (e.g. "@modelcontextprotocol/server-filesystem")
  return {
    name: trimmed,
    transport: 'stdio',
    command: 'npx',
    args: ['-y', trimmed],
  };
}
