# Changelog

All notable changes to `mcp-medic` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/) — see [docs/STABILITY_POLICY.md](./docs/STABILITY_POLICY.md) for what's frozen at 1.0.

## [Unreleased]

- **MCP Quality Engine**: mcp-medic now computes a deterministic 0–100 MCP Quality Score (`mcp-medic score <config>` or `check --score`) across five weighted dimensions — Protocol (25%), Schema (20%), Agent usability (20%), Security (20%), Reliability (15%) — derived entirely from the same diagnostics shown in the report (no LLM, no randomness, no extra network calls). Every point deducted is explained and capped per-checkId so no single noisy check can dominate a dimension. `--json`/`--export-json` always include the score under `quality`.
  - 7 new checks: `quality.tool-name`, `quality.vague-description`, `quality.output-schema`, `quality.tool-annotations`, `quality.tool-surface` (configurable tool-count threshold, default 100), `quality.resource`, `quality.prompt` — all passive, inspecting only what `tools/list`/`resources/list`/`prompts/list` already returned.
  - `DiagnosticResult` gains optional `category`, `confidence`, and `documentationUrl` fields (fully backward compatible); every diagnostic — old and new — now has a stable category, inferred from its `checkId` prefix when not set explicitly.
  - `MCPToolDefinition` gains `title`/`outputSchema`/`annotations`; `MCPResourceDefinition` gains `title`/`size`; `MCPPromptDefinition.arguments` is now properly typed and validated (`MCPPromptArgument[]`) instead of passed through as `unknown[]`. All new fields sourced from the official MCP TypeScript schema, not memory.
  - Policy (`.mcp-medic-policy.json`) gains `quality.minimumScore` (fail if the score is below a threshold), `quality.maxTools` (org-enforced hard limit, distinct from the default warning), and `quality.requireToolDescriptions` (wires up a previously declared-but-unused top-level field).
- Protocol: passive resources/prompts capability inspection. When a server's `initialize` response declares `capabilities.resources` and/or `capabilities.prompts`, `connect()` now also calls `resources/list`/`prompts/list` (never `resources/read`/`prompts/get` — enumeration only, matching the existing passive `tools/list` behavior) and exposes the results as `MCPConnection.resources`/`.prompts`. A malformed or failing capability listing is captured in `MCPConnection.capabilityErrors` without failing the overall connection (`tools` remains the one capability mcp-medic requires). Reports show a `Capabilities: N tool(s), N resource(s), N prompt(s)` line.
- Safety: secret redaction. `--json`/`--export-json` report output and `diff` drift output no longer leak raw HTTP header, env var, or OAuth token-refresh-body values that look like secrets (`Authorization`, `*_API_KEY`, `client_secret`, `Cookie`, etc.) — they're replaced with `[REDACTED]` before ever reaching a report or export. New `src/redact.ts` (`isSecretKey`, `redactRecord`, `redactDeep`, `sanitizeServerConfig`), exported from the library entrypoint. Non-secret fields (`Content-Type`, `NODE_ENV`, ...) are left untouched so output stays useful for debugging. No check ever read these values, so this changes no diagnostic behavior.
- CI: `--export-sarif <file>` produces SARIF 2.1.0 output for GitHub Code Scanning and other SARIF viewers (`src/sarif.ts`, `formatReportSarif`), with one rule per `checkId` and each result located at the config file + server/tool as logical locations (mcp-medic diagnoses a running server's declared capabilities, not source lines, so there's no line/column to report).
- Protocol: real protocol version negotiation, replacing the previously hardcoded `2024-11-05`. New `--protocol-version <v>` CLI flag (`auto` by default, or an explicit version such as `2025-06-18`); `connect()` now reads back and validates what the server actually negotiated instead of assuming the request was honored, and disconnects cleanly (no `tools/list`) if the server negotiates a version this client doesn't support. Adds `src/protocol/versions.ts` (`SUPPORTED_PROTOCOL_VERSIONS`, currently `2025-11-25`/`2025-06-18`/`2025-03-26`/`2024-11-05`) and surfaces `Protocol: requested X, server negotiated Y` in reports. `2026-07-28` is a real, newer MCP spec version but changes the wire protocol itself (removes the `initialize` handshake); requesting it fails fast with an explicit, honest error rather than attempting a broken connection.
- Benchmarks & Validation: added live MCP reference server fleet validation suite and published dynamic stress test benchmarks in [`docs/BENCHMARKS.md`](./docs/BENCHMARKS.md).
- GitHub Action: hardened `action.yml` with complete input mappings, composite runner configuration, and comprehensive Marketplace documentation in `README.md`.

## [1.0.2] — 2026-09-06

- Repo hygiene: `CONTRIBUTING.md`, this changelog, issue templates, `engines` field in `package.json`.
- CLI: `--version`/`-V` flag.
- README: clearer scope on the VS Code extension (experimental, not yet on the Marketplace) and community check packages (planned, not yet published); "Known Limitations" section.

## [1.0.1] — 2026-09-06

- Published to npm as `mcp-medic` (unscoped), with `mcp-doctor`, `mcpmedic`, and `mcpdoctor` as additional `bin` aliases.
- CI/release pipeline hardening: automated version bump + git tag + GitHub Release on push to `main` (`scripts/auto-release.js`), npm publish via OIDC Trusted Publishing (no long-lived npm token), multi-OS/multi-Node (18/20/22 × Linux/macOS/Windows) test matrix.
- No functional changes to the CLI or library surface versus 1.0.0 — this release is CI/publishing infrastructure and documentation.

## [1.0.0] — 2026-09-06

Initial stable release. Consolidates everything built in the pre-1.0 phases:

- **Core**: config loading/validation (`loadConfig`), the check-plugin `Check` interface, `runChecks` orchestrator, human/JSON report formatting.
- **Protocol layer**: real `initialize` handshake and `tools/list` discovery over stdio, SSE, and HTTP transports, with per-server timeouts and OAuth token refresh for HTTP.
- **Built-in checks**: `schema.malformed`, `schema.missing-required`, `schema.type-mismatch`, `schema.missing-description`, `schema.sample-call-simulation`, and three heuristic security checks — `security.untrusted-remote`, `security.overbroad-permissions`, `security.prompt-injection-risk`.
- **CLI**: `check` (with auto-discovery across Claude Desktop / `.mcp.json` / VS Code / Cursor config locations), `watch`, `check-all` (fleet scan), `diff` (config drift), `fix` (interactive auto-apply of mechanical suggested fixes, with `.bak` backup and `--dry-run`), `--registry` (validate a published registry entry directly).
- **CI integration**: `--export-junit`, `--export-json`, `--snapshot`/`--update-snapshot` baseline regression gating, strict exit code taxonomy (`0`/`1`/`2`), a GitHub Action (`action.yml`).
- **Extensibility**: policy-as-code (`.mcp-medic-policy.json`), a conformance test suite for community check authors (`runCheckConformanceSuite`), and a reusable diagnostics library intended for editor integrations (`src/extension/`).
