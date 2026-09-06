# DECISIONS.md — append-only log

Add a new entry at the bottom whenever you make a choice that isn't obvious
from the code alone (a timeout value, a fallback behavior, a scope cut).
Never edit or delete past entries — if a decision is reversed, add a new
entry that supersedes it and says so.

Format:
```
## YYYY-MM-DD — [owner] short title
Decision: ...
Reason: ...
Supersedes: (link to earlier entry, if any)
```

---

## 2026-09-06 — [core] v1 scope frozen to CONTRACT.md's "Scope of v1"
Decision: v1 = parse config, handshake, schema validation, sample-call
simulation, human+JSON report. No auto-fix, GUI, multi-server orchestration,
or VS Code extension in v1.
Reason: narrow scope shipped fast beats broad scope shipped never (lesson
carried over from token-budget's distribution phase).

## 2026-09-06 — [core] Check interface must never throw
Decision: `Check.run()` implementations must catch their own errors and
return an `error`-severity `DiagnosticResult` instead of throwing.
Reason: one malformed community/future check shouldn't crash the whole run;
matches the "isolate failures" pattern used elsewhere in these kinds of
diagnostic tools.

## 2026-09-06 — [codex] Protocol transport implementation
Decision: Implement the MCP JSON-RPC transport with Node primitives rather than
adding `@modelcontextprotocol/sdk`, use protocol version `2024-11-05`, and
close stdio child processes immediately after initialize and tools/list finish.
Reason: the package has no SDK dependency and the connection contract stores
negotiated data rather than a live session; this keeps the public dependency
surface unchanged and prevents leaked server processes.

## 2026-09-06 — [jules] Zero-dependency lightweight validation in sample-call simulation
Decision: Implement a built-in lightweight validator and synthetic payload generator
in `src/checks/sample-call-simulation.ts` without introducing new dependencies like `ajv`
in v1, but report caveats when complex schemas (`$ref`, `oneOf`, `anyOf`, `allOf`) are encountered.
Reason: Keeps runtime dependencies at zero per current codebase philosophy while
reliably detecting self-contradictory schemas (empty enums, conflicting min/max bounds,
missing required property definitions). Adding `ajv` as a production dependency can be
evaluated in a future iteration if deep JSON Schema draft-07/2020-12 spec compliance is needed.

## 2026-09-06 — [antigravity] picocolors for CLI color output
Decision: use `picocolors` (added to `dependencies`, not devDependencies —
it's needed at runtime by `dist/cli.js`) for red/yellow/green terminal
output in `src/cli.ts`.
Reason: no color library existed in package.json yet. picocolors is ~500
bytes, zero dependencies, and is the smallest/fastest of the common options
(chalk/kleur/colorette/ansi-colors) — a CLI this small doesn't need chalk's
API surface.

## 2026-09-06 — [antigravity] CLI imports checks/protocol via non-literal
dynamic `import()`, not the static re-export pattern from the task spec
Decision: `src/cli.ts` loads `./checks/index.js` and `./protocol/index.js`
through a shared `importOptional(specifier: string)` helper (specifier
passed as a runtime string, not a string literal in the `import()` call
itsf) and swallows module-not-found errors, falling back to an empty
check list / the orchestrator's built-in `connectStub`. Same reasoning
applies to `src/index.ts`: the `export { allChecks } from './checks/index.js'`
re-export named in the task spec is left as a comment, not live code.
Reason: as of this session, `src/checks/` and `src/protocol/` are both
still empty (`.gitkeep` only) — Codex and Jules haven't started (see
STATUS.md). A literal `import('./checks/index.js')` makes `tsc` try to
resolve that module at type-check time and fails the build for everyone
until those modules land, which breaks the "nobody blocks on another
module's implementation" rule in CONTRACT.md. This makes the CLI/library
work today (reporting a clear "protocol layer not yet implemented"
per-server error) and pick up the real implementations automatically, with
zero CLI changes required, the moment Codex/Jules land their `index.ts`
files exporting `connect`/`registerProtocol` and `allChecks` respectively.
## 2026-09-06 — [all] Phase 2 enhancements: Suggested fixes, Discovery, Watch, Exit codes
Decision: Extend `DiagnosticResult` with optional `suggestedFix: { description: string; patch?: unknown }`,
add `--show-fixes` CLI flag, implement multi-location config auto-discovery and debounced watch mode,
harden SSE/HTTP transports with token refresh and `--verbose` JSON-RPC logging, formalize exit codes
(0 clean, 1 errors/failures, 2 usage/config errors), and export community check conformance helper.
Reason: Brings mcp-doctor to production-grade usability and CI readiness while maintaining zero
heavy runtime dependencies.

## 2026-09-06 — [antigravity] Phase 3: `mcp-doctor fix` + security.* checks
Decision: Add an interactive `mcp-doctor fix <path>` command (`src/cli.ts` + new
`src/fix.ts`) and three heuristic checks — `security.untrusted-remote`,
`security.overbroad-permissions`, `security.prompt-injection-risk` — in
`src/checks/security-*.ts`. `fix` only ever acts on diagnostics whose
`suggestedFix.patch` matches the `ConfigPatch` shape defined in `src/fix.ts`
(`{ serverName, set }`, a shallow field merge into that server's raw JSON) —
of the 8 built-in checks, today only `security.untrusted-remote`'s
non-https diagnostic produces one (upgrading `http://` to `https://`); every
other diagnostic (schema.*, the IP-literal-host and overbroad/injection
security diagnostics) is about server-declared data mcp-doctor doesn't own
and stays description-only, by design — there is no safe mechanical fix for
"this third-party server's tool description is suspicious." Per each fix:
diff shown, explicit y/n prompt (never bulk-applied), `<path>.bak` written
before the first write, `--dry-run` shows every diff and prompts/writes
nothing, `--check <id>` filters to one check. Idempotency (FR3-1.4) is
enforced two ways: `security.untrusted-remote` itself stops flagging a
server once its patch is applied (unit-tested against mock connections),
and `diffConfigPatch()` returns `[]` (nothing to show or confirm) if a
patch's fields already match, so re-running `fix` against an already-fixed
config is a safe no-op even if a stale diagnostic somehow still named it.
Reason: this was requested directly by the human this session, spanning
what CONTRACT.md's original module-boundary table split between
"Antigravity" (CLI) and "Jules" (checks). Since a fixable check and the
patch shape `fix` understands are two halves of one feature, and no other
session was concurrently working `src/checks/*` at the time, implementing
## 2026-09-06 — [antigravity] Phase 4: Policy-as-code, Fleet management, CI JUnit reporting
Decision: Implement `src/policy.ts` (.mcp-medic-policy.json loader and composable check generator),
`src/fleet.ts` (`check-all` glob runner and `diff` configuration drift comparator), `src/junit.ts`
(standard JUnit XML generator for CI dashboards), `src/snapshot.ts` (baseline regression filtering),
and `src/conformance.ts` (community check plugin test harness).
Reason: Enables enterprise governance across multi-server monorepos, catches configuration drift,
and prevents breaking CI pipelines on pre-existing legacy warnings.

## 2026-09-06 — [antigravity] Phase 5: Unscoped npm release as `mcp-medic` & Zero-Touch OIDC Publishing
Decision: Publish package under available unscoped npm package name `mcp-medic` (with binary aliases
`mcp-medic`, `mcpmedic`, `mcp-doctor`, `mcpdoctor`), deliver 4-stage distribution strategy, outreach tracking
log with honesty check criteria, troubleshooting cookbook, and zero-touch automated CI release workflow
(`.github/workflows/publish.yml` + `scripts/auto-release.js`) leveraging npm Tokenless Trusted Publishing (OIDC).
Reason: The original unscoped name `mcp-doctor` was already registered on npm by a third-party author; `mcp-medic`
preserves the medical/diagnostic theme, is fully published (v1.0.0 & v1.0.1), and tokenless OIDC eliminates
static secret expiration and annual token rotation maintenance.


