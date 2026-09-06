import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  MCPConnection,
  MCPServerConfig,
  MCPServerInfo,
  MCPToolDefinition,
  MCPToolAnnotations,
  MCPResourceDefinition,
  MCPResourceTemplate,
  MCPPromptDefinition,
  MCPPromptArgument,
  RunOptions,
} from '../types.js';
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

/** JSON-RPC -32601 ("Method not found"): many servers that declare the
 * `resources` capability (for concrete resources/list) simply don't
 * implement the optional `resources/templates/list` RPC — that's spec-
 * compliant, not a capability error, so it must never be reported as one. */
function isMethodNotFound(error: unknown): boolean {
  return messageOf(error).includes('(-32601)');
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

/** Defends against a misbehaving/malicious server that never stops returning
 * a `nextCursor`, which would otherwise hang a passive `check` forever. No
 * real MCP server should need anywhere near this many pages for a single
 * `list` call. */
const MAX_PAGINATION_PAGES = 1000;

/**
 * MCP's `tools/list`/`resources/list`/`resources/templates/list`/`prompts/list`
 * all extend `PaginatedRequest`/`PaginatedResult` (optional `cursor` param,
 * optional `nextCursor` in the response) — present since the client's
 * earliest supported protocol version, not something new in 2026-07-28.
 * A server with a large catalog can legitimately split it across pages;
 * without this, mcp-medic would silently see only page 1 and under-report
 * (or mis-score) everything after it. Fetches every page with the same
 * request/response validation as a single call, then hands the merged
 * `{ [arrayKey]: allItems }` to the existing per-item `normalize*` function
 * unchanged.
 */
async function requestAllPages(
  transport: Transport,
  method: string,
  arrayKey: string,
  timeoutMs: number,
  nextId: () => number,
): Promise<Record<string, unknown>> {
  const merged: unknown[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGINATION_PAGES; page++) {
    const id = nextId();
    const params = cursor !== undefined ? { cursor } : undefined;
    const result = validateResponse(await withTimeout(transport.request(method, params), timeoutMs, method), id);
    if (!Array.isArray(result[arrayKey])) {
      throw new Error(`${method} response has no ${arrayKey} array`);
    }
    merged.push(...result[arrayKey]);
    cursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
    if (cursor === undefined) {
      return { [arrayKey]: merged };
    }
  }
  throw new Error(`${method} did not terminate pagination after ${MAX_PAGINATION_PAGES} pages`);
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

function normalizeToolAnnotations(value: unknown): MCPToolAnnotations | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const annotations: MCPToolAnnotations = {};
  if (typeof record.title === 'string') annotations.title = record.title;
  if (typeof record.readOnlyHint === 'boolean') annotations.readOnlyHint = record.readOnlyHint;
  if (typeof record.destructiveHint === 'boolean') annotations.destructiveHint = record.destructiveHint;
  if (typeof record.idempotentHint === 'boolean') annotations.idempotentHint = record.idempotentHint;
  if (typeof record.openWorldHint === 'boolean') annotations.openWorldHint = record.openWorldHint;
  return annotations;
}

function normalizeTools(result: Record<string, unknown>): MCPToolDefinition[] {
  if (!Array.isArray(result.tools)) throw new Error('tools/list response has no tools array');
  return result.tools.map((tool, index) => {
    if (!tool || typeof tool !== 'object' || typeof (tool as { name?: unknown }).name !== 'string') {
      throw new Error(`tools/list returned an invalid tool at index ${index}`);
    }
    const value = tool as {
      name: string;
      title?: unknown;
      description?: unknown;
      inputSchema?: unknown;
      outputSchema?: unknown;
      annotations?: unknown;
    };
    return {
      name: value.name,
      ...(typeof value.title === 'string' ? { title: value.title } : {}),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      inputSchema: value.inputSchema,
      ...(value.outputSchema !== undefined ? { outputSchema: value.outputSchema } : {}),
      ...(normalizeToolAnnotations(value.annotations) ? { annotations: normalizeToolAnnotations(value.annotations) } : {}),
    };
  });
}

function normalizeResources(result: Record<string, unknown>): MCPResourceDefinition[] {
  if (!Array.isArray(result.resources)) throw new Error('resources/list response has no resources array');
  return result.resources.map((resource, index) => {
    if (!resource || typeof resource !== 'object' || typeof (resource as { uri?: unknown }).uri !== 'string') {
      throw new Error(`resources/list returned an invalid resource at index ${index}`);
    }
    const value = resource as {
      uri: string;
      name?: unknown;
      title?: unknown;
      description?: unknown;
      mimeType?: unknown;
      size?: unknown;
    };
    return {
      uri: value.uri,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      ...(typeof value.title === 'string' ? { title: value.title } : {}),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      ...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
      ...(typeof value.size === 'number' ? { size: value.size } : {}),
    };
  });
}

function normalizeResourceTemplates(result: Record<string, unknown>): MCPResourceTemplate[] {
  if (!Array.isArray(result.resourceTemplates)) {
    throw new Error('resources/templates/list response has no resourceTemplates array');
  }
  return result.resourceTemplates.map((template, index) => {
    if (
      !template ||
      typeof template !== 'object' ||
      typeof (template as { uriTemplate?: unknown }).uriTemplate !== 'string'
    ) {
      throw new Error(`resources/templates/list returned an invalid template at index ${index}`);
    }
    const value = template as {
      uriTemplate: string;
      name?: unknown;
      title?: unknown;
      description?: unknown;
      mimeType?: unknown;
    };
    return {
      uriTemplate: value.uriTemplate,
      ...(typeof value.name === 'string' ? { name: value.name } : {}),
      ...(typeof value.title === 'string' ? { title: value.title } : {}),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      ...(typeof value.mimeType === 'string' ? { mimeType: value.mimeType } : {}),
    };
  });
}

function normalizePromptArgument(value: unknown): MCPPromptArgument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const arg: MCPPromptArgument = {};
  if (typeof record.name === 'string') arg.name = record.name;
  if (typeof record.title === 'string') arg.title = record.title;
  if (typeof record.description === 'string') arg.description = record.description;
  if (typeof record.required === 'boolean') arg.required = record.required;
  return arg;
}

function normalizePrompts(result: Record<string, unknown>): MCPPromptDefinition[] {
  if (!Array.isArray(result.prompts)) throw new Error('prompts/list response has no prompts array');
  return result.prompts.map((prompt, index) => {
    if (!prompt || typeof prompt !== 'object' || typeof (prompt as { name?: unknown }).name !== 'string') {
      throw new Error(`prompts/list returned an invalid prompt at index ${index}`);
    }
    const value = prompt as { name: string; title?: unknown; description?: unknown; arguments?: unknown };
    return {
      name: value.name,
      ...(typeof value.title === 'string' ? { title: value.title } : {}),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      ...(Array.isArray(value.arguments)
        ? { arguments: value.arguments.map(normalizePromptArgument) }
        : {}),
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

    // Requests are numbered sequentially in the order they're actually sent
    // (notifications don't consume an id) — tracked locally rather than
    // hardcoded, since which optional capability calls happen below depends
    // on what the server declares.
    let nextExpectedId = 1;

    let initialize: Record<string, unknown>;
    try {
      // The id must be captured *before* the request settles, not as a
      // trailing call argument evaluated after an `await` — if the awaited
      // call throws (timeout, transport error), a trailing `nextExpectedId++`
      // never runs at all, desyncing this counter from the ids the
      // transport actually assigned to later requests. See the
      // resources/templates/list addition in DECISIONS.md for how this
      // surfaced.
      const initializeId = nextExpectedId++;
      const response = await withTimeout(
        transport.request('initialize', {
          protocolVersion: requestedVersion,
          capabilities: {},
          clientInfo: CLIENT_INFO,
        }),
        timeoutMs,
        'initialize handshake',
      );
      initialize = validateResponse(response, initializeId);
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

    let tools: MCPToolDefinition[];
    try {
      tools = normalizeTools(
        await requestAllPages(transport, 'tools/list', 'tools', timeoutMs, () => nextExpectedId++),
      );
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

    // Resources and prompts are optional MCP capabilities: only inspect them
    // if the server actually declared support in its initialize response.
    // Passive enumeration only (resources/list, prompts/list) — never
    // resources/read or prompts/get, which would be real invocation.
    // A failure here is never fatal to the connection: tools is the one
    // capability mcp-medic requires, so a broken resources/prompts listing
    // is reported alongside a still-successful connection.
    let resources: MCPResourceDefinition[] | undefined;
    let resourceTemplates: MCPResourceTemplate[] | undefined;
    let prompts: MCPPromptDefinition[] | undefined;
    const capabilityErrors: NonNullable<MCPConnection['capabilityErrors']> = {};

    if (capabilities.resources && typeof capabilities.resources === 'object') {
      try {
        resources = normalizeResources(
          await requestAllPages(transport, 'resources/list', 'resources', timeoutMs, () => nextExpectedId++),
        );
      } catch (error) {
        capabilityErrors.resources = messageOf(error);
      }

      // resources/templates/list is a distinct RPC governed by the same
      // capability flag, but genuinely optional in practice — most servers
      // that only expose concrete resources never implement it, and a
      // "method not found" response for it is spec-compliant, not a defect.
      try {
        resourceTemplates = normalizeResourceTemplates(
          await requestAllPages(
            transport,
            'resources/templates/list',
            'resourceTemplates',
            timeoutMs,
            () => nextExpectedId++,
          ),
        );
      } catch (error) {
        if (!isMethodNotFound(error)) {
          capabilityErrors.resourceTemplates = messageOf(error);
        }
      }
    }

    if (capabilities.prompts && typeof capabilities.prompts === 'object') {
      try {
        prompts = normalizePrompts(
          await requestAllPages(transport, 'prompts/list', 'prompts', timeoutMs, () => nextExpectedId++),
        );
      } catch (error) {
        capabilityErrors.prompts = messageOf(error);
      }
    }

    return {
      server: config,
      status: 'connected',
      capabilities,
      tools,
      ...(resources !== undefined ? { resources } : {}),
      ...(resourceTemplates !== undefined ? { resourceTemplates } : {}),
      ...(prompts !== undefined ? { prompts } : {}),
      ...(Object.keys(capabilityErrors).length > 0 ? { capabilityErrors } : {}),
      protocolVersion,
      serverInfo,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return failed(config, 'failed', 'handshake', messageOf(error), error);
  } finally {
    await transport?.close().catch(() => undefined);
  }
}
