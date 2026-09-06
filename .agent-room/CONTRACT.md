# CONTRACT.md — frozen interfaces

**Rule: nobody edits this file unilaterally.** If you need a change, propose it in
`DECISIONS.md` with a reason, then update this file in the same commit.

Everyone (Codex, Jules, Antigravity, human) implements against these types.
This is the one shared source of truth across sessions/tools that have no
memory of each other.

---

## Scope of v1

`mcp-doctor` validates an MCP server config and connection:
1. Parse config (stdio/SSE/HTTP transport)
2. Perform real `initialize` handshake
3. Validate every exposed tool's JSON schema
4. Simulate a sample tool call against declared schemas
5. Output a human-readable + JSON report

Not in v1: auto-fix, GUI, multi-server orchestration, VS Code extension.

---

## Core Types (TypeScript)

```ts
// ---- Config ----

export type TransportType = 'stdio' | 'sse' | 'http';

export interface MCPServerConfig {
  name: string;
  transport: TransportType;
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse / http
  url?: string;
  headers?: Record<string, string>;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
  sourcePath?: string; // where this config was loaded from, for reporting
}

// ---- Connection (produced by the protocol/handshake layer) ----

export interface MCPConnection {
  server: MCPServerConfig;
  status: 'connected' | 'failed' | 'timeout';
  capabilities?: Record<string, unknown>; // raw capabilities from initialize response
  tools?: MCPToolDefinition[];
  error?: {
    stage: 'spawn' | 'handshake' | 'capability-negotiation' | 'list-tools';
    message: string;
    raw?: unknown;
  };
  latencyMs?: number;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: unknown; // raw JSON schema as returned by the server
}

// ---- Diagnostics ----

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticResult {
  checkId: string;        // e.g. "schema.required-fields"
  severity: Severity;
  message: string;         // human-readable, one line
  serverName: string;
  toolName?: string;        // present if the diagnostic is tool-scoped
  details?: unknown;        // structured extra info for JSON output
}

// ---- Check plugin interface ----
// Every validator (schema well-formedness, required fields, type mismatch,
// sample-call simulation, etc.) implements this. Checks are independent and
// must not depend on each other's output.

export interface Check {
  id: string;               // unique, namespaced, e.g. "schema.malformed"
  description: string;
  // Runs against a single successfully-established connection.
  // Must not throw — catch internally and return an 'error' diagnostic
  // with details, so one bad check can't crash the whole run.
  run(connection: MCPConnection): Promise<DiagnosticResult[]> | DiagnosticResult[];
}

// ---- Orchestration ----

export interface RunOptions {
  timeoutMs?: number;       // per-server handshake timeout, default 5000
  checks?: Check[];         // defaults to all registered built-in checks
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

export function runChecks(config: MCPConfig, options?: RunOptions): Promise<RunReport>;
```

---

## Module boundaries (who owns what)

| Area | Owner | Files |
|---|---|---|
| Core types + orchestrator (`runChecks`, report formatter) | Core session (this repo's `.agent-room` author) | `src/types.ts`, `src/orchestrator.ts`, `src/report.ts` |
| Protocol/handshake layer (spawn process, `initialize`, capability negotiation, `list-tools`) | **Codex** | `src/protocol/*.ts` |
| Schema validation checks (malformed schema, missing required fields, type mismatch, sample-call simulation) | **Jules** | `src/checks/*.ts` |
| CLI entry point + fixtures (broken sample configs) + colored output | **Antigravity** | `src/cli.ts`, `test/fixtures/*.json` |

**Merge order:** core types → protocol layer → checks → CLI. Checks need a
real or mocked `MCPConnection`; CLI needs checks; nobody should block on
another module's *implementation*, only on this file's *types*.

## Non-negotiables

- `Check.run()` must never throw uncaught — orchestrator assumes this.
- No shared mutable module-level state between checks (they may run in
  parallel later).
- All new exported functions/types get added here first, in the same PR
  that implements them — this file must always reflect what's actually
  merged, not an aspiration.
