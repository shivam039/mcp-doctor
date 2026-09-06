import type { MCPConfig, MCPServerConfig, TransportType } from './types.js';

export interface ConfigLoadResult {
  config?: MCPConfig;
  errors: string[]; // human-readable, e.g. "server[0]: missing 'command' for stdio transport"
}

const VALID_TRANSPORTS: TransportType[] = ['stdio', 'sse', 'http'];

function label(raw: unknown, index: number): string {
  const name =
    typeof raw === 'object' && raw !== null && 'name' in raw && typeof (raw as { name: unknown }).name === 'string'
      ? (raw as { name: string }).name
      : undefined;
  return name ? `server[${index}] ("${name}")` : `server[${index}]`;
}

function validateServer(raw: unknown, index: number, errors: string[]): raw is MCPServerConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    errors.push(`${label(raw, index)}: expected an object`);
    return false;
  }

  const server = raw as Record<string, unknown>;
  let valid = true;

  if (typeof server.name !== 'string' || server.name.length === 0) {
    errors.push(`${label(raw, index)}: missing or invalid 'name'`);
    valid = false;
  }

  if (typeof server.transport !== 'string' || !VALID_TRANSPORTS.includes(server.transport as TransportType)) {
    errors.push(
      `${label(raw, index)}: invalid transport ${JSON.stringify(server.transport)} (expected 'stdio', 'sse', or 'http')`,
    );
    valid = false;
    return valid;
  }

  if (server.transport === 'stdio') {
    if (typeof server.command !== 'string' || server.command.length === 0) {
      errors.push(`${label(raw, index)}: missing 'command' for stdio transport`);
      valid = false;
    }
  } else {
    if (typeof server.url !== 'string' || server.url.length === 0) {
      errors.push(`${label(raw, index)}: missing 'url' for ${server.transport} transport`);
      valid = false;
    }
  }

  return valid;
}

export function loadConfig(rawJson: unknown, sourcePath?: string): ConfigLoadResult {
  const errors: string[] = [];

  if (typeof rawJson !== 'object' || rawJson === null || Array.isArray(rawJson)) {
    return { errors: ['config: expected a top-level object with a "servers" array'] };
  }

  const raw = rawJson as Record<string, unknown>;

  if (!Array.isArray(raw.servers)) {
    return { errors: ['config: "servers" must be an array'] };
  }

  const servers: MCPServerConfig[] = [];
  raw.servers.forEach((rawServer, index) => {
    if (validateServer(rawServer, index, errors)) {
      servers.push(rawServer);
    }
  });

  if (errors.length > 0) {
    return { errors };
  }

  return { config: { servers, sourcePath }, errors };
}
