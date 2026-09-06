# STATUS.md — live board

Update this file (append/edit your own row) every time you start or finish a
session. Read it before starting work. Keep entries to one line each; put
detail in your `HANDOFF/<you>.md` file instead.

Format: `[owner] area — status — last updated (UTC date)`

---

- [core] CONTRACT.md types + orchestrator skeleton — DONE — see HANDOFF/claude.md
- [codex] protocol/handshake layer — DONE — see HANDOFF/codex.md
- [jules] schema validation checks — DONE (5 checks + fixtures + test suites) — 2026-09-06
- [antigravity] CLI + fixtures + config-loader — DONE (works end-to-end against orchestrator) — see HANDOFF/antigravity.md
- [antigravity] Phase 3: `mcp-doctor fix` + security.* checks — DONE (interactive auto-apply, .bak backup, --dry-run, --check filter, idempotent; 3 heuristic security checks) — see HANDOFF/antigravity.md
- [antigravity] Phase 4: Policy-as-code, Fleet check-all, diff drift, snapshots, JUnit XML, Conformance suite — DONE — see HANDOFF/antigravity.md
- [antigravity] Phase 5: Distribution flywheel, VS Code marketplace listing, troubleshooting guide, unscoped release as `mcp-medic` on npm, and zero-touch OIDC Trusted Publishing CI pipeline — DONE — see HANDOFF/antigravity.md

---

## Blocked / needs decision

(none — all phases implemented, 118/118 tests passing, published to npm as mcp-medic, automated release pipeline active)

## Next up (in merge order)

1. Codex: protocol layer (`src/protocol/`) — implements `MCPConnection`
   production, given a `MCPServerConfig`.
2. Jules: checks (`src/checks/`) — can start against the CONTRACT.md types
   using a hand-written mock `MCPConnection`, doesn't need to wait for Codex.
3. Antigravity: CLI (`src/cli.ts`) + fixtures — needs orchestrator +
   at least one check to wire end-to-end, but fixtures (broken sample
   configs) can be written immediately, no dependency.
