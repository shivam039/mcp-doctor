# Changelog

All notable changes to `mcp-medic` are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); versioning follows [Semantic Versioning](https://semver.org/) — see [docs/STABILITY_POLICY.md](./docs/STABILITY_POLICY.md) for what's frozen at 1.0.

## [Unreleased]

- Documentation: added repository metadata guidance, Quick Start invocation clarity, and Marketplace readiness roadmap for the VS Code extension.

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
