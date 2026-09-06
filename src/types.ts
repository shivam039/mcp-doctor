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

/** Per the MCP spec's `ToolAnnotations`: optional client *hints*, not
 * authoritative security guarantees — a server can lie about any of these. */
export interface MCPToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface MCPToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  /** Optional per spec; same shape as `inputSchema` when present. */
  outputSchema?: unknown;
  annotations?: MCPToolAnnotations;
}

export interface MCPResourceDefinition {
  uri: string;
  /** Required by the MCP spec's `Resource` (extends `BaseMetadata`) — kept
   * optional here because mcp-medic reports a missing name as a diagnostic
   * rather than failing the whole `resources/list` response over it. */
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  size?: number;
}

/** MCP's `ResourceTemplate` (spec 2025-06-18+): a URI template (RFC 6570) a
 * client can fill in to construct concrete resource URIs — a distinct RPC
 * (`resources/templates/list`) from `resources/list`'s concrete instances,
 * but governed by the same `capabilities.resources` flag. Common for
 * servers that expose parameterized resources (e.g. `file://{path}`)
 * rather than (or in addition to) a fixed list. */
export interface MCPResourceTemplate {
  uriTemplate: string;
  /** Required by the spec's `BaseMetadata` — kept optional here for the
   * same reason as `MCPResourceDefinition.name`. */
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPromptArgument {
  /** Required by the MCP spec's `PromptArgument` (extends `BaseMetadata`) —
   * kept optional here for the same reason as `MCPResourceDefinition.name`. */
  name?: string;
  title?: string;
  description?: string;
  required?: boolean;
}

export interface MCPPromptDefinition {
  name: string;
  title?: string;
  description?: string;
  arguments?: MCPPromptArgument[];
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
  /** Populated only if the server's `initialize` response declared a `resources` capability. */
  resources?: MCPResourceDefinition[];
  /** Populated only if the server's `initialize` response declared a `resources` capability
   * (same flag as `resources` — the spec has no separate templates sub-capability) AND the
   * server actually returned any templates. `resources/templates/list` is optional in
   * practice: many servers only expose concrete resources, so an empty/absent result here
   * is normal, not an error. */
  resourceTemplates?: MCPResourceTemplate[];
  /** Populated only if the server's `initialize` response declared a `prompts` capability. */
  prompts?: MCPPromptDefinition[];
  /** Best-effort failures from optional capability inspection (resources/prompts/resource
   * templates) — these never fail the overall connection, since `tools` is the one
   * capability mcp-medic requires. */
  capabilityErrors?: { resources?: string; resourceTemplates?: string; prompts?: string };
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

/** Stable diagnostic taxonomy. Optional and additive — existing checks that
 * don't set this are categorized by `inferDiagnosticCategory()` (src/diagnostics.ts)
 * from their `checkId` prefix, so nothing that already works needs to change. */
export type DiagnosticCategory =
  | 'protocol'
  | 'schema'
  | 'quality'
  | 'security'
  | 'reliability'
  | 'usability'
  | 'configuration';

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
  /** Optional; see `DiagnosticCategory`. */
  category?: DiagnosticCategory;
  /** Optional: how confident the check is that this is a real problem (vs. a heuristic guess). */
  confidence?: 'low' | 'medium' | 'high';
  /** Optional: link to a doc explaining the rule this diagnostic enforces. */
  documentationUrl?: string;
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

/** The five scored dimensions of MCP quality (see src/quality-score.ts for the scoring model). */
export type QualityDimension = 'protocol' | 'schema' | 'usability' | 'security' | 'reliability';

export interface QualityDeduction {
  dimension: QualityDimension;
  checkId: string;
  severity: Severity;
  /** How many diagnostics from this checkId (at this severity) contributed. */
  count: number;
  /** Points actually deducted, after the per-checkId cap. */
  points: number;
  description: string;
}

export interface QualityScoreBreakdown {
  overall: number;
  dimensions: Record<QualityDimension, number>;
  /** Only deductions with points > 0, most-costly first — every deduction here explains itself. */
  deductions: QualityDeduction[];
}

/** Whether the checks that feed a dimension actually ran this time.
 * 'covered': every built-in check for this dimension ran.
 * 'partial': at least one check contributing to this dimension ran, but not all of them.
 * 'not-covered': no check contributing to this dimension ran — a 100 in
 * that dimension means "nothing flagged it," not "nothing wrong exists." */
export type CoverageStatus = 'covered' | 'partial' | 'not-covered';

export type QualityCoverage = Record<QualityDimension, CoverageStatus>;

export interface ReportQualityScore extends QualityScoreBreakdown {
  /** Per-connected-server breakdown; a server that never connected has no entry (nothing to score). */
  perServer: Record<string, QualityScoreBreakdown>;
  /** Per-dimension coverage, derived from which checks actually ran (`RunOptions.checks`) —
   * never assume a dimension was fully evaluated just because it scored 100. */
  coverage: QualityCoverage;
  /** 0-100: 'covered' dimensions count as 1, 'partial' as 0.5, 'not-covered' as 0, averaged across all 5. */
  coveragePercent: number;
  /** Names of servers actually included in this score (connected + scored). */
  scoredServers: string[];
  /** Names of servers that could NOT be scored (failed to connect) — never silently dropped from view. */
  unscoredServers: string[];
  /** A short, load-bearing reminder of what this number does and doesn't mean — see src/quality-score.ts. */
  disclaimer: string;
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
  /** Deterministic quality score derived from `diagnostics`/`connections` — see src/quality-score.ts.
   * `undefined` when no server connected (nothing to score). */
  quality?: ReportQualityScore;
}
