import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { MCPConnection, MCPServerConfig, MCPServerInfo, MCPToolDefinition, RunOptions } from '../types.js';
import {
  KNOWN_UNSUPPORTED_PROTOCOL_VERSIONS,
  SUPPORTED_PROTOCOL_VERSIONS,
  isSupportedProtocolVersion,
  resolveRequestedProtocolVersion,
} from './versions.js';

function readOwnVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const CLIENT_INFO = { name: 'mcp-medic', version: readOwnVersion() };

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: unknown };
}

interface Transport {
  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>;
  notify(method: string, params?: Record<string, unknown>): Promise<void>;
  close(): Promise<void>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logVerbose(options: RunOptions | undefined, message: string): void {
  if (options?.onLog) {
    options.onLog(message);
  } else if (options?.verbose) {
    console.error(`[debug] ${message}`);
  }
}

function failed(
  config: MCPServerConfig,
  status: 'failed' | 'timeout',
  stage: 'spawn' | 'handshake' | 'capability-negotiation' | 'list-tools',
  message: string,
  raw?: unknown,
  extra?: Pick<MCPConnection, 'protocolVersion' | 'serverInfo' | 'latencyMs'>,
): MCPConnection {
  return {
    server: config,
    status,
    error: { stage, message, ...(raw === undefined ? {} : { raw }) },
    ...extra,
  };
}

function normalizeServerInfo(value: unknown): MCPServerInfo | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const info: MCPServerInfo = {};
  if (typeof record.name === 'string') info.name = record.name;
  if (typeof record.version === 'string') info.version = record.version;
  return info.name || info.version ? info : undefined;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function validateResponse(response: JsonRpcResponse, expectedId: number): Record<string, unknown> {
  if (!response || response.jsonrpc !== '2.0' || response.id !== expectedId) {
    throw new Error('invalid JSON-RPC response');
  }
  if (response.error) {
    throw new Error(`MCP request failed (${response.error.code}): ${response.error.message}`);
  }
  if (!response.result || typeof response.result !== 'object') {
    throw new Error('JSON-RPC response has no result');
  }
  return response.result;
}

function normalizeTools(result: Record<string, unknown>): MCPToolDefinition[] {
  if (!Array.isArray(result.tools)) throw new Error('tools/list response has no tools array');
  return result.tools.map((tool, index) => {
    if (!tool || typeof tool !== 'object' || typeof (tool as { name?: unknown }).name !== 'string') {
      throw new Error(`tools/list returned an invalid tool at index ${index}`);
    }
    const value = tool as { name: string; description?: unknown; inputSchema?: unknown };
    return {
      name: value.name,
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      inputSchema: value.inputSchema,
    };
  });
}

async function refreshTokenIfNeeded(
  config: MCPServerConfig,
  options?: RunOptions,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...(config.headers ?? {}) };
  if (!config.tokenRefreshUrl) {
    return headers;
  }

  try {
    logVerbose(options, `Refreshing OAuth token from ${config.tokenRefreshUrl}...`);
    const res = await fetch(config.tokenRefreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
      body: JSON.stringify(config.tokenRefreshBody ?? {}),
    });
    if (!res.ok) {
      throw new Error(`Token refresh failed with status ${res.status}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    const token =
      (typeof data.access_token === 'string' && data.access_token) ||
      (typeof data.token === 'string' && data.token);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      logVerbose(options, 'Token refreshed successfully');
    }
  } catch (err) {
    logVerbose(options, `Token refresh warning: ${messageOf(err)}`);
  }
  return headers;
}

class StdioTransport implements Transport {
  private readonly process: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (response: JsonRpcResponse) => void; reject: (error: Error) => void }
  >();
  private buffer = '';
  private closed = false;
  private readonly exitError: Promise<never>;

  constructor(config: MCPServerConfig, private readonly options?: RunOptions) {
    if (!config.command) throw new Error('stdio transport requires command');
    this.process = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.exitError = new Promise((_, reject) => {
      this.process.once('error', (error) =>
        reject(new Error(`failed to start MCP server: ${error.message}`)),
      );
      this.process.once('exit', (code, signal) => {
        if (!this.closed)
          reject(
            new Error(
              `MCP server exited before responding (code=${code ?? 'unknown'}, signal=${signal ?? 'none'})`,
            ),
          );
      });
    });
    this.process.stdout.setEncoding('utf8');
    this.process.stdout.on('data', (chunk: string) => this.consume(chunk));
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf('\n');
      if (!line) continue;
      try {
        logVerbose(this.options, `<-- stdio: ${line}`);
        const parsed = JSON.parse(line) as JsonRpcResponse;
        if (typeof parsed.id === 'number') {
          const waiter = this.pending.get(parsed.id);
          if (waiter) {
            this.pending.delete(parsed.id);
            waiter.resolve(parsed);
          }
        }
      } catch {
        // Ignore server log noise or malformed notifications; the request timeout reports the failure.
      }
    }
  }

  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const payload =
      JSON.stringify({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }) +
      '\n';
    logVerbose(this.options, `--> stdio: ${payload.trim()}`);
    return Promise.race([
      new Promise<JsonRpcResponse>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        this.process.stdin.write(payload, (error) => {
          if (error) {
            this.pending.delete(id);
            reject(error);
          }
        });
      }),
      this.exitError,
    ]);
  }

  notify(method: string, params?: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const payload =
        JSON.stringify({ jsonrpc: '2.0', method, ...(params === undefined ? {} : { params }) }) +
        '\n';
      logVerbose(this.options, `--> stdio (notify): ${payload.trim()}`);
      this.process.stdin.write(payload, (error) => (error ? reject(error) : resolve()));
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const waiter of this.pending.values())
      waiter.reject(new Error('MCP server connection closed'));
    this.pending.clear();
    if (!this.process.killed) {
      this.process.kill();
      await new Promise<void>((resolve) => this.process.once('close', () => resolve()));
    }
  }
}

async function httpJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options?: RunOptions,
): Promise<JsonRpcResponse> {
  const bodyText = JSON.stringify(body);
  logVerbose(options, `--> HTTP POST ${url}: ${bodyText}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: bodyText,
  });
  if (!response.ok) throw new Error(`MCP HTTP request failed with status ${response.status}`);
  const text = await response.text();
  logVerbose(options, `<-- HTTP ${response.status}: ${text}`);
  const data = text.trim().startsWith('data:')
    ? text
        .split(/\r?\n/)
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
        .trim()
    : text;
  if (!data) throw new Error('MCP HTTP response was empty');
  return JSON.parse(data) as JsonRpcResponse;
}

class HttpTransport implements Transport {
  private nextId = 1;
  private headers: Record<string, string> = {};

  constructor(
    private readonly config: MCPServerConfig,
    private readonly options?: RunOptions,
  ) {
    if (!config.url) throw new Error(`${config.transport} transport requires url`);
  }

  private async getHeaders(): Promise<Record<string, string>> {
    if (Object.keys(this.headers).length === 0) {
      this.headers = await refreshTokenIfNeeded(this.config, this.options);
    }
    return this.headers;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const headers = await this.getHeaders();
    return httpJson(
      this.config.url!,
      headers,
      { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) },
      this.options,
    );
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const headers = await this.getHeaders();
    const bodyText = JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    });
    logVerbose(this.options, `--> HTTP POST (notify) ${this.config.url!}: ${bodyText}`);
    const response = await fetch(this.config.url!, {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: bodyText,
    });
    if (!response.ok)
      throw new Error(`MCP HTTP notification failed with status ${response.status}`);
  }

  async close(): Promise<void> {}
}

class SseTransport implements Transport {
  private nextId = 1;
  private endpointPromise: Promise<string> | undefined;
  private headers: Record<string, string> = {};

  constructor(
    private readonly config: MCPServerConfig,
    private readonly options?: RunOptions,
  ) {
    if (!config.url) throw new Error('sse transport requires url');
  }

  private async getHeaders(): Promise<Record<string, string>> {
    if (Object.keys(this.headers).length === 0) {
      this.headers = await refreshTokenIfNeeded(this.config, this.options);
    }
    return this.headers;
  }

  private async endpointWithRetry(maxRetries = 2): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.fetchEndpoint();
      } catch (err) {
        lastError = err;
        logVerbose(this.options, `SSE connection attempt ${attempt} failed: ${messageOf(err)}`);
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, 100 * attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async fetchEndpoint(): Promise<string> {
    const headers = await this.getHeaders();
    logVerbose(this.options, `--> SSE connecting to ${this.config.url}...`);
    const response = await fetch(this.config.url!, {
      headers: { Accept: 'text/event-stream', ...headers },
    });
    if (!response.ok || !response.body)
      throw new Error(`MCP SSE connection failed with status ${response.status}`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        logVerbose(this.options, `<-- SSE stream chunk: ${buffer}`);
        const event = buffer.match(/(?:^|\r?\n)\r?\n([\s\S]*?)(?:\r?\n\r?\n|$)/);
        if (!event) continue;
        buffer = buffer.slice((event.index ?? 0) + event[0].length);
        const data = event[1]
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (data) {
          const endpointUrl = new URL(data, this.config.url!).toString();
          logVerbose(this.options, `SSE discovered endpoint: ${endpointUrl}`);
          return endpointUrl;
        }
      }
    } finally {
      await reader.cancel();
    }
    throw new Error('MCP SSE stream ended before endpoint event');
  }

  private async endpoint(): Promise<string> {
    if (!this.endpointPromise) {
      this.endpointPromise = this.endpointWithRetry();
    }
    return this.endpointPromise;
  }

  async request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const headers = await this.getHeaders();
    const targetEndpoint = await this.endpoint();
    return httpJson(
      targetEndpoint,
      headers,
      { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) },
      this.options,
    );
  }

  async notify(method: string, params?: Record<string, unknown>): Promise<void> {
    const headers = await this.getHeaders();
    const endpoint = await this.endpoint();
    const bodyText = JSON.stringify({
      jsonrpc: '2.0',
      method,
      ...(params === undefined ? {} : { params }),
    });
    logVerbose(this.options, `--> SSE POST (notify) ${endpoint}: ${bodyText}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: bodyText,
    });
    if (!response.ok)
      throw new Error(`MCP SSE notification failed with status ${response.status}`);
  }

  async close(): Promise<void> {}
}

export async function connect(
  config: MCPServerConfig,
  timeoutMs: number,
  options?: RunOptions,
): Promise<MCPConnection> {
  const started = Date.now();
  const requestedVersion = resolveRequestedProtocolVersion(options?.protocolVersion);

  // Some real MCP protocol versions use a wire shape this client doesn't
  // implement (e.g. 2026-07-28 drops the initialize handshake entirely).
  // Fail fast on those, before spawning a process or opening a connection,
  // rather than attempting a handshake that was never going to work.
  const unsupportedReason = KNOWN_UNSUPPORTED_PROTOCOL_VERSIONS[requestedVersion];
  if (unsupportedReason) {
    return failed(
      config,
      'failed',
      'handshake',
      `cannot request protocol version ${requestedVersion}: ${unsupportedReason}. ` +
        `This client supports: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,
    );
  }

  let transport: Transport | undefined;
  try {
    if (config.transport === 'stdio') {
      try {
        transport = new StdioTransport(config, options);
      } catch (error) {
        return failed(config, 'failed', 'spawn', messageOf(error), error);
      }
    } else if (config.transport === 'sse' || config.transport === 'http') {
      try {
        transport =
          config.transport === 'sse'
            ? new SseTransport(config, options)
            : new HttpTransport(config, options);
      } catch (error) {
        return failed(config, 'failed', 'spawn', messageOf(error), error);
      }
    } else {
      return failed(
        config,
        'failed',
        'spawn',
        `unsupported transport: ${String(config.transport)}`,
      );
    }

    let initialize: Record<string, unknown>;
    try {
      const response = await withTimeout(
        transport.request('initialize', {
          protocolVersion: requestedVersion,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        }),
        timeoutMs,
        'initialize handshake',
      );
      initialize = validateResponse(response, 1);
      if (!initialize.capabilities || typeof initialize.capabilities !== 'object') {
        throw new Error('initialize response has no capabilities object');
      }
      if (typeof initialize.protocolVersion !== 'string' || !initialize.protocolVersion) {
        throw new Error(
          'initialize response is missing a protocolVersion string (protocol violation — ' +
            'the server MUST report the version it negotiated)',
        );
      }
    } catch (error) {
      const timedOut = messageOf(error).includes('timed out');
      const message = messageOf(error);
      return failed(
        config,
        timedOut ? 'timeout' : 'failed',
        message.startsWith('failed to start') ? 'spawn' : 'handshake',
        message,
        error,
      );
    }

    const negotiatedVersion = initialize.protocolVersion as string;
    const compatible = isSupportedProtocolVersion(negotiatedVersion);
    const protocolVersion = { requested: requestedVersion, negotiated: negotiatedVersion, compatible };
    const serverInfo = normalizeServerInfo(initialize.serverInfo);
    const capabilities = initialize.capabilities as Record<string, unknown>;

    if (!compatible) {
      // Per spec: if the client doesn't support the version the server
      // negotiated, it SHOULD disconnect rather than proceed — don't send
      // notifications/initialized or tools/list against a protocol version
      // this client can't actually speak.
      return failed(
        config,
        'failed',
        'handshake',
        `protocol version mismatch: requested ${requestedVersion}, server negotiated ` +
          `${negotiatedVersion}, which this client does not support. ` +
          `This client supports: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}.`,
        undefined,
        { protocolVersion, serverInfo, latencyMs: Date.now() - started },
      );
    }

    try {
      await withTimeout(
        transport.notify('notifications/initialized'),
        timeoutMs,
        'initialized notification',
      );
    } catch (error) {
      return failed(
        config,
        messageOf(error).includes('timed out') ? 'timeout' : 'failed',
        'capability-negotiation',
        messageOf(error),
        error,
        { protocolVersion, serverInfo },
      );
    }

    try {
      const tools = normalizeTools(
        validateResponse(
          await withTimeout(transport.request('tools/list'), timeoutMs, 'tools/list'),
          2,
        ),
      );
      return {
        server: config,
        status: 'connected',
        capabilities,
        tools,
        protocolVersion,
        serverInfo,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return failed(
        config,
        messageOf(error).includes('timed out') ? 'timeout' : 'failed',
        'list-tools',
        messageOf(error),
        error,
        { protocolVersion, serverInfo },
      );
    }
  } catch (error) {
    return failed(config, 'failed', 'handshake', messageOf(error), error);
  } finally {
    await transport?.close().catch(() => undefined);
  }
}
