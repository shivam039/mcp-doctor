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

## Scope of Phase 3

Phase 3 adds, on top of v1 (see DECISIONS.md for the full rationale):
1. `mcp-doctor fix <path>` — interactive, per-diagnostic auto-apply of
   `suggestedFix.patch`es to the local config file (diff + y/n confirm,
   `.bak` backup, `--dry-run`, `--check <id>` filter). Only diagnostics
   that carry a `patch` are fixable; most diagnostics remain description-only.
2. Three new heuristic `security.*` checks: `security.overbroad-permissions`,
   `security.prompt-injection-risk`, `security.untrusted-remote`. All are
   explicitly documented (in their `description` and every diagnostic
   `message`) as heuristics, not guarantees — never a substitute for
   reviewing a third-party MCP server's source.

### `SuggestedFix.patch` shape (as produced/consumed by mcp-doctor's own code)

`SuggestedFix.patch` stays typed `unknown` in `DiagnosticResult` (any check
or community package may put anything there, or nothing). The `fix` command
and `security.untrusted-remote` agree on one concrete shape for it, defined
and validated in `src/fix.ts`:

```ts
interface ConfigPatch {
  serverName: string;        // matches MCPConfig.servers[i].name
  set: Record<string, unknown>; // shallow fields to merge into that server's raw JSON
}
```

`fix` only offers diagnostics whose `patch` matches this shape (via
`isConfigPatch`); anything else is left as a description-only suggestion.

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
  tokenRefreshUrl?: string;
  tokenRefreshBody?: Record<string, unknown>;
}

export interface MCPConfig {
  servers: MCPServerConfig[];
  sourcePath?: string; // where this config was loaded from, for reporting
}

// ---- Connection (produced by the protocol/handshake layer) ----

export interface ProtocolVersionInfo {
  requested: string;         // what this client asked for in `initialize` (after resolving "auto")
  negotiated?: string;       // what the server's initialize response actually reported; absent if the
                              // handshake failed before a response, or the response omitted it (protocol violation)
  compatible: boolean;       // whether `negotiated` is one of this client's SUPPORTED_PROTOCOL_VERSIONS
}

export interface MCPServerInfo {
  name?: string;
  version?: string;
}

export interface MCPConnection {
  server: MCPServerConfig;
  status: 'connected' | 'failed' | 'timeout';
  capabilities?: Record<string, unknown>; // raw capabilities from initialize response
  tools?: MCPToolDefinition[];
  protocolVersion?: ProtocolVersionInfo;
  serverInfo?: MCPServerInfo;
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

export interface SuggestedFix {
  description: string;
  patch?: unknown;
}

export interface DiagnosticResult {
  checkId: string;        // e.g. "schema.required-fields"
  severity: Severity;
  message: string;         // human-readable, one line
  serverName: string;
  toolName?: string;        // present if the diagnostic is tool-scoped
  details?: unknown;        // structured extra info for JSON output
  suggestedFix?: SuggestedFix;
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
  verbose?: boolean;
  onLog?: (message: string) => void;
  protocolVersion?: string; // MCP protocolVersion to request: "auto" (default) or an explicit
                              // version string, e.g. "2025-06-18". See src/protocol/versions.ts
                              // for SUPPORTED_PROTOCOL_VERSIONS and negotiation rules.
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
| Interactive auto-fix command + config-patch logic (Phase 3) | **Antigravity** | `src/fix.ts`, `fix` command in `src/cli.ts` |
| Security heuristic checks (Phase 3 — normally Jules' `src/checks/*` area; implemented by Antigravity this session per direct human request, since `fix` and the checks that produce fixable patches are tightly coupled) | **Antigravity** | `src/checks/security-*.ts` |
| Secret redaction (headers/env/token-body values scrubbed before reaching any report, export, or diff) | **core** | `src/redact.ts` |
| SARIF 2.1.0 export (`--export-sarif`, single-config `check`/`fix` path only — fleet/`check-all` has no SARIF formatter yet) | **core** | `src/sarif.ts` |

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
