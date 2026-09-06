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
- [core] MCP Quality Engine v1.0: 7 new tool/resource/prompt quality checks, diagnostic category taxonomy, deterministic 5-dimension MCP Quality Score (protocol/schema/usability/security/reliability) — DONE — see DECISIONS.md
- [core] MCP Quality Engine v1.1 (trust & coverage hardening): protocol-version-aware quality rules, visible `protocol.connection-health` diagnostics, score coverage/disclaimer/unscored-servers, coverage-aware `quality.minimumScore` policy gate — DONE — see DECISIONS.md
- [core] Real-world validation & productization milestone: `resources/templates/list` support + a request-id desync bugfix it exposed, cursor-based pagination for all four `list` RPCs (previously silently truncated to page 1), `security.hidden-unicode-tags` (deterministic Unicode Tags-block steganography detection), `quality.resource` extended to resource templates, report.ts capability line updated — DONE — see DECISIONS.md (2026-09-06 entry) for score-calibration/FP-FN/CLI/competitive review and the MCP 2026-07-28 compatibility plan (not implemented — different wire protocol, needs a dedicated milestone)

---

## Blocked / needs decision

(none — 306/306 tests passing, typecheck/build clean, published to npm as mcp-medic)

## Known limitations (see DECISIONS.md 2026-09-06 entry for full detail)

- MCP 2026-07-28 is a different wire protocol (no `initialize` handshake,
  per-request `_meta`, `server/discover` negotiation) — correctly rejected
  as unsupported rather than faked; real support needs a `Transport`
  interface redesign, its own fixture, and is not scheduled.
- No check yet validates *content* quality of resource template URIs
  beyond structural fields (e.g. whether `{placeholders}` in `uriTemplate`
  are documented anywhere).
- Real-world validation this milestone was done by reading the actual MCP
  spec schema and public reference-server source, not by executing
  arbitrary third-party servers (out of scope for a passive-inspection
  tool's own trust model).

## Next recommended milestone

MCP 2026-07-28 compatibility, as a dedicated design + implementation
effort (see the Phase 6 plan in DECISIONS.md's 2026-09-06 entry): a
`Transport` abstraction that can speak either the handshake-based wire
protocol (current) or the `server/discover`/per-request-`_meta` protocol
(2026-07-28+), plus a fixture server for the new shape.
