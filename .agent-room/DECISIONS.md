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

## 2026-09-06 — [codex] Real protocol version negotiation, replacing the hardcoded `2024-11-05`
Decision: Add `src/protocol/versions.ts` as the single source of truth for protocol
versions: `SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']`
(newest first), `LATEST_SUPPORTED_PROTOCOL_VERSION`, `resolveRequestedProtocolVersion()`
(maps `undefined`/`"auto"` → latest, else passes an explicit string through unchanged),
and `KNOWN_UNSUPPORTED_PROTOCOL_VERSIONS`, currently just `{ '2026-07-28': <reason> }`.
`connect()` (`src/protocol/connect.ts`) now: (1) fast-fails before spawning any process
if the requested version is in `KNOWN_UNSUPPORTED_PROTOCOL_VERSIONS`; (2) sends the
resolved version in the `initialize` request instead of a hardcoded constant; (3) reads
back whatever `protocolVersion` the server's `initialize` response actually reports,
erroring at `handshake` stage if it's missing entirely (a protocol violation — the spec
requires the server to report the version it negotiated); (4) compares that negotiated
version against `SUPPORTED_PROTOCOL_VERSIONS` and, if incompatible, fails cleanly at
`handshake` stage *without* sending `notifications/initialized` or calling `tools/list`
(matches the spec's "client SHOULD disconnect if it doesn't support the server's
negotiated version" guidance). `MCPConnection` gained `protocolVersion: ProtocolVersionInfo`
(`{ requested, negotiated?, compatible }`) and `serverInfo: MCPServerInfo` (`{ name?, version? }`,
read from the server's `initialize` response instead of being silently discarded).
`RunOptions` gained `protocolVersion?: string`, threaded through the CLI's new
`--protocol-version <v>` flag (default `"auto"`) into `runChecks`/`runFleetChecks`.
`src/report.ts` prints a `Protocol: requested X, server negotiated Y — ✓/✗ compatible`
line per connection; `src/cli.ts` colorizes the ✗ case red.
Reason: the previous implementation hardcoded `protocolVersion: '2024-11-05'` in both
the outgoing `initialize` request and implicitly assumed whatever the server sent back
was fine — it never read or validated the server's actual negotiated version, so a
server silently downgrading, omitting the field, or negotiating a version this client
can't speak would go completely undetected and mcp-medic would proceed to call
`tools/list` anyway. Versions were confirmed against the real upstream MCP spec
(`github.com/modelcontextprotocol/modelcontextprotocol`): `2024-11-05`, `2025-03-26`,
`2025-06-18`, `2025-11-25`, and `2026-07-28` all exist; `2025-11-25` is additive-only
over `2025-06-18` (safe to add to the supported list), but `2026-07-28` removes the
`initialize`/`notifications/initialized` handshake entirely in favor of a stateless
per-request model (version + capabilities carried per-request in `_meta`, plus a new
`server/discover` RPC) — a different wire protocol this client's stdio/SSE/HTTP
transport code does not implement. Rather than silently mis-negotiating that version or
simply rejecting it as an invalid CLI argument, `--protocol-version 2026-07-28` is
accepted as valid input but `connect()` fails fast with a specific, honest diagnostic
naming what's unimplemented and which versions are actually supported — before spawning
any process, so a bad version choice never wastes a real connection attempt or leaks a
child process. New fixture modes for this in `test/fixtures/fake-mcp-server.js`:
`no-protocol-version`, `downgrade`, `incompatible-version`; `normal` mode now echoes
back whatever `protocolVersion` the client requested instead of a hardcoded value.
Covered by 7 new tests in `test/protocol/connect.test.ts` (`describe('protocol version
negotiation', ...)`, 127 total tests passing, up from 120).

## 2026-09-06 — [core] Secret redaction (src/redact.ts) + SARIF export (src/sarif.ts)
Decision: Add `src/redact.ts` (`isSecretKey`, `redactRecord`, `redactDeep`,
`sanitizeServerConfig`) and call `sanitizeServerConfig(server)` in
`orchestrator.ts`'s `runChecks()` before a connection is pushed into
`RunReport.connections`, and `redactRecord()` on `env` values in
`fleet.ts`'s `diffConfigs()`. Separately, add `src/sarif.ts`
(`formatReportSarif`) and a `--export-sarif <file>` CLI flag.
Reason (redaction): audited every place `MCPServerConfig` data reaches
output. Confirmed no built-in check reads `.headers`/`.env`/`.tokenRefreshBody`
*values* (only `.name`/`.transport`/`.url`), but `--json`/`--export-json`
(`formatReportJSON` → `JSON.stringify(report)`) and `diff`'s `env` change
entries serialized those raw values verbatim — a config with
`headers: { Authorization: "Bearer sk-..." }` or `env: { API_KEY: "..." }`
would leak the literal secret into report/export/diff output, which
routinely gets pasted into CI logs, PRs, and issue trackers. This directly
violates the standing constraint (never log auth headers, bearer tokens,
API keys, cookies, or secret env vars). Since checks don't need the real
values, redacting at the point a connection enters the report is safe and
changes no diagnostic behavior — verified by a new test asserting a report
containing a live secret string never appears in `JSON.stringify(report)`
after redaction, plus unit tests for `redact.ts` itself and a `diff`-level
test for the `env` redaction. Non-secret keys (`Content-Type`, `NODE_ENV`)
are left visible so output stays debuggable. `--verbose` JSON-RPC wire
logging in `src/protocol/connect.ts` was audited too — it already only
logs request/response bodies, never the `headers` object itself, so no
change was needed there.
Reason (SARIF): `--export-sarif` was on the explicit acceptance-criteria
list for CI integration alongside the existing JUnit/JSON exports (see
`src/junit.ts`, same report-formatter pattern). mcp-medic diagnoses a
*running server's* declared tools/capabilities, not source code, so there
are no line/column positions to report; each SARIF result instead points
its `physicalLocation` at the config file the server was declared in and
names the server (and tool, if tool-scoped) as `logicalLocations`. Scoped
to the single-config `check`/`fix` path only in this pass — `check-all`'s
`FleetReport` has no SARIF formatter yet (same gap JUnit had until fleet
support was added later); left as a follow-up rather than rushed in
alongside everything else.

## 2026-09-06 — [codex] Resources/prompts capability inspection
Decision: after a successful `tools/list`, `connect()` (`src/protocol/connect.ts`)
inspects the server's declared `capabilities` object from `initialize` and, only
if `capabilities.resources` / `capabilities.prompts` is present, makes one
additional passive call — `resources/list` / `prompts/list` respectively — and
normalizes the result into `MCPConnection.resources` / `.prompts`. A failure at
this stage (timeout, malformed response, missing array) is captured in
`MCPConnection.capabilityErrors` (`{ resources?: string; prompts?: string }`)
rather than failing the whole connection — `tools` remains the one capability
mcp-medic requires; resources/prompts are optional per the MCP spec, and a
server can legitimately support only one or the other, or neither. Never calls
`resources/read` or `prompts/get` (those retrieve/execute rather than
enumerate) — this stays passive inspection, consistent with the standing
constraint that mcp-medic's normal `check` never invokes real tool/resource/
prompt behavior. `MCPConnection.resources`/`.prompts` are `undefined` (not `[]`)
when the capability wasn't declared, so a report can distinguish "declared but
empty" from "not supported."
Also fixed, incidentally: the two existing JSON-RPC request/response id checks
(`validateResponse(response, 1)` for `initialize`, `..., 2)` for `tools/list`)
were hardcoded literals coupled to the transport's internal id counter — adding
two more conditional requests made that fragile, so replaced with a local
`nextExpectedId` counter incremented once per actual `.request()` call, in the
order calls are made. Behavior for existing calls is unchanged (still 1, then 2).
Reason: this was the next explicit protocol-correctness item from the standing
engineering-upgrade backlog ("capability handling, tools/resources/prompts").
`report.ts`'s human formatter gained a `Capabilities: N tool(s)[, N resource(s)]
[, N prompt(s)]` line (resource/prompt counts only shown when declared) and
surfaces `capabilityErrors` inline without marking the connection failed.
New fixture modes in `test/fixtures/fake-mcp-server.js`: `with-resources-prompts`,
`broken-resources`, `broken-prompts`. 151/151 tests passing (up from 144), with
new coverage in `test/protocol/connect.test.ts` and a new `test/report.test.ts`.
Deferred: pagination (`nextCursor`) is not handled for `resources/list`/
`prompts/list` — matches the existing, equally unpaginated `tools/list`
handling, not a regression, but a real gap for servers with large catalogs.
No new `Check` was added to validate resource URIs or prompt argument
schemas — this pass is inspection/exposure only, not a new quality check.

