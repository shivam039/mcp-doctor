// Mirrors .agent-room/CONTRACT.md exactly. If these ever diverge,
// CONTRACT.md is the source of truth — update both in the same commit
// and log the change in .agent-room/DECISIONS.md.

export type TransportType = 'stdio' | 'sse' | 'http';

export interface MCPServerConfig {
  name: string;
  transport: TransportType;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  tokenRefreshUrl?: string;
  tokenRefreshBody?: Record<string, unknown>;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
  sourcePath?: string;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface ProtocolVersionInfo {
  /** The protocolVersion this client sent in `initialize`. */
  requested: string;
  /** The protocolVersion the server returned in its `initialize` response, if valid. */
  negotiated?: string;
  /** Whether `negotiated` is a version this client's transport can actually speak. */
  compatible: boolean;
}

export interface MCPServerInfo {
  name?: string;
  version?: string;
}

export interface MCPConnection {
  server: MCPServerConfig;
  status: 'connected' | 'failed' | 'timeout';
  capabilities?: Record<string, unknown>;
  tools?: MCPToolDefinition[];
  /** Set once an `initialize` response was received, even if negotiation was incompatible or a later stage failed. */
  protocolVersion?: ProtocolVersionInfo;
  serverInfo?: MCPServerInfo;
  error?: {
    stage: 'spawn' | 'handshake' | 'capability-negotiation' | 'list-tools';
    message: string;
    raw?: unknown;
  };
  latencyMs?: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface SuggestedFix {
  description: string;
  patch?: unknown;
}

export interface DiagnosticResult {
  checkId: string;
  severity: Severity;
  message: string;
  serverName: string;
  toolName?: string;
  details?: unknown;
  suggestedFix?: SuggestedFix;
}

export interface Check {
  id: string;
  description: string;
  run(connection: MCPConnection): Promise<DiagnosticResult[]> | DiagnosticResult[];
}

export interface RunOptions {
  timeoutMs?: number;
  checks?: Check[];
  verbose?: boolean;
  onLog?: (message: string) => void;
  /** "auto" (default) requests the newest protocol version this client supports; an explicit version string requests that version instead. */
  protocolVersion?: string;
}

export interface RunReport {
  configSource?: string;
  connections: MCPConnection[];
  diagnostics: DiagnosticResult[];
  summary: {
    servers: number;
    connected: number;
    failed: number;
    errors: number;
    warnings: number;
  };
}
