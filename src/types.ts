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

export interface MCPConnection {
  server: MCPServerConfig;
  status: 'connected' | 'failed' | 'timeout';
  capabilities?: Record<string, unknown>;
  tools?: MCPToolDefinition[];
  error?: {
    stage: 'spawn' | 'handshake' | 'capability-negotiation' | 'list-tools';
    message: string;
    raw?: unknown;
  };
  latencyMs?: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticResult {
  checkId: string;
  severity: Severity;
  message: string;
  serverName: string;
  toolName?: string;
  details?: unknown;
}

export interface Check {
  id: string;
  description: string;
  run(connection: MCPConnection): Promise<DiagnosticResult[]> | DiagnosticResult[];
}

export interface RunOptions {
  timeoutMs?: number;
  checks?: Check[];
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
