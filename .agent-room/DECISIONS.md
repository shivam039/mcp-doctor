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

## 2026-09-06 — [core] MCP Quality Engine: types, 7 new checks, diagnostic taxonomy, deterministic score
Decision: Implement the "MCP Quality Engine" milestone as scoped, deliberately
skipping items the milestone brief itself flagged as overengineering risks
(no LLM, no policy DSL, no dashboard). Concretely:

**Types** (`src/types.ts`): added `MCPToolAnnotations`, extended
`MCPToolDefinition` with `title`/`outputSchema`/`annotations`, extended
`MCPResourceDefinition` with `title`/`size`, added `MCPPromptArgument` and
changed `MCPPromptDefinition.arguments` from `unknown[]` to
`MCPPromptArgument[]` (previously a `Array.isArray` narrowing of `unknown`
silently widened to `any[]` and was never actually validated per-element —
`src/protocol/connect.ts`'s `normalizePromptArgument()` now extracts each
field defensively). All new Tool/Resource/Prompt fields were read from the
actual MCP TypeScript schema (`schema/2025-06-18/schema.ts` in
`github.com/modelcontextprotocol/modelcontextprotocol`), not memory —
notably: `Resource.name` and `PromptArgument.name` are REQUIRED in the spec
(both extend `BaseMetadata`), but kept optional in mcp-medic's types because
a missing one is reported as a diagnostic, not a thrown parse error.

**Diagnostic taxonomy** (`src/diagnostics.ts`): added optional
`DiagnosticResult.category`/`confidence`/`documentationUrl`. Existing checks
were NOT touched to set `category` — `inferDiagnosticCategory(checkId)` maps
`schema.*`→schema, `security.*`→security, `policy.*`/`configuration.*`→
configuration, etc., by prefix, so every pre-existing diagnostic participates
in category-aware scoring without any risk of breaking its own tests.

**7 new checks** (`src/checks/quality-*.ts`, all category `'quality'`
unless noted): `quality.tool-name` (empty/duplicate names = error, since the
spec sets no length/pattern constraint on `Tool.name` but an empty or
duplicate name is functionally unusable, not merely unstylish; overly-long/
ambiguous/placeholder names = warning), `quality.vague-description`
(complements `schema.missing-description`, which only catches *absence* —
this catches placeholder text, single-word, or name-as-description, and
never touches an absent description), `quality.output-schema` (never flags
absence — optional per spec — only structural malformedness),
`quality.tool-annotations` (flags only internally-contradictory hint
combinations, e.g. `readOnlyHint && destructiveHint`; never infers danger
from a single hint, per the spec's own "hints, not guarantees" framing),
`quality.tool-surface` (a factory, `createToolSurfaceCheck({maxTools})`, so
policy can override the default 100-tool warning threshold without a second
parallel check — mirrors `createPolicyChecks`'s existing pattern; also
flags near-duplicate names and 3+ tools sharing one description),
`quality.resource` and `quality.prompt` (inspect only what `resources/list`/
`prompts/list` already returned — never call `resources/read`/`prompts/get`).
`malformed-schema.ts` also gained one new error case: `inputSchema` with an
explicit top-level `type` other than `"object"` is now flagged, since the
spec requires tool inputSchema to describe an object — previously any
present `type` string was accepted.

**MCP Quality Score** (`src/quality-score.ts`, types in `types.ts` alongside
`RunReport` since `RunReport.quality` is one of them): 5 dimensions per the
brief's suggested weights (protocol 25%, schema 20%, usability 20%, security
20%, reliability 15% — sum to 1, tested). Deductions are computed FROM
diagnostics (`categoryOf(d)` → dimension, via a `configuration`/`quality`→
`usability` fold since only 5 dimensions exist but 7 categories do), never
as an independent judgment — directly implementing the brief's "avoid: check
A says warning, score engine independently invents a second interpretation."
Anti-double-counting: diagnostics are grouped by `(checkId, severity)`, and
each group's contribution is capped (errors ≤25pts/checkId, warnings
≤15pts/checkId, info ≤5pts/checkId) BEFORE being summed into a dimension —
so 20 tools sharing one description problem cost at most 15 points, not 60;
tested explicitly (`test/quality-score.test.ts`, "caps repeated diagnostics").
Protocol dimension also reads connection-level facts diagnostics don't cover
(capability-inspection failures, a version downgrade, missing `serverInfo`)
since those aren't produced by a `Check`. Deterministic and pure: same
report in → same score out, no I/O, no randomness (tested). `RunReport.quality`
is computed once in `orchestrator.ts`'s `runChecks()`; `cli.ts` recomputes it
after `--snapshot` baseline filtering so the score reflects what's actually
shown, not the pre-filter diagnostics.
JSON field naming note: the milestone brief's example used `quality.score`;
this implementation uses `quality.overall` for consistency with the internal
`QualityScoreBreakdown.overall` field used throughout `quality-score.ts` and
`report.ts`. This is a new field with no backward-compatibility constraint,
so the rename was a one-time naming choice, not a breaking change — documented
here per the brief's "if changing the JSON schema, document the change."

**CLI**: new `score` command (alias for `check` with `--score` forced on)
and `--score` flag (opt-in — a plain `check` report stays short, matching
"avoid turning it into an enormous wall of text"). `--json`/`--export-json`
always include `quality` when available (no opt-in needed there — it's
inert extra data for consumers who don't look at it).

**Policy** (`src/policy.ts`): added `quality.minimumScore` (enforced in
`cli.ts` after scoring — can't be a `Check`, since it needs the final score,
not one connection), `quality.maxTools` (a new `policy.max-tools` check,
error severity — distinct from `quality.tool-surface`'s default warning),
and `quality.requireToolDescriptions` (implements the previously-declared-
but-completely-unused top-level `requireToolDescriptions` field — a real,
pre-existing dead field in the interface, now wired to a `policy.require-
tool-descriptions` check; the nested `quality.*` form takes precedence if
both are set, top-level kept for backward compatibility).

Reason for scope cuts (things NOT done, on purpose): no `outputSchema`
"missing where the server appears to rely on structured output" heuristic
(the brief allowed this as informational/warning, but pattern-matching
descriptions for "returns structured data" is speculative and low-confidence
— skipped rather than guessed); no fleet-level (`check-all`) SARIF or
quality-score aggregation beyond what `runFleetChecks`'s reuse of
`runChecks` already gives for free per-file; no `resources/list`/
`prompts/list` pagination; Reliability dimension is currently binary
(connected vs not) since no `reliability.*` diagnostics exist yet — real
signals (latency trend, retry/flake rate across runs) are a future
milestone, not invented here to pad out the dimension.
233/233+ tests passing (see PR for exact before/after counts); typecheck/
build/`npm pack --dry-run` all clean; manually smoke-tested `score`,
`check --json` (quality field), and the `quality.minimumScore` policy gate
end-to-end against a real local stdio fixture server.

## 2026-09-06 — [core] MCP Quality Engine v1.1 — trust & coverage hardening
Decision: audited the v1.0 Quality Engine against 12 explicit correctness
requirements and made 5 targeted, additive changes — no revert, no wholesale
rewrite of the scoring model or dimension weights.

**1. Protocol-version-aware tool-name rules** (`src/protocol/quality-rules.ts`,
new): `getProtocolQualityRules(version)` returns `{ toolName: { maxLength?,
pattern? } }`. Every currently-supported MCP version (2024-11-05 through
2025-11-25) defines no hard length/pattern constraint on `Tool.name` — this
module exists for the abstraction, not because any two supported versions
differ today. `quality-tool-names.ts`'s `evaluateToolName(name, rules)` is
now a pure, exported function consulting these rules: if `rules.maxLength`/
`.pattern` is defined AND violated, the finding is `category: 'protocol'`,
`severity: 'error'` (a real spec violation for that version); otherwise the
existing style/quality warnings apply unchanged. Since no supported version
defines a constraint today, existing behavior for all 9 pre-existing tests
was verified unchanged; new tests inject a synthetic `ToolNameProtocolRules`
directly (bypassing the need for a real future protocol version to exist)
to prove the branching logic. Reason: the milestone explicitly required
never mislabeling a style preference as a protocol violation, and building
this so a *future* version that does add a constraint needs one new rules
entry, not a rewrite of every quality check.

**2. Removed hidden score deductions** (`src/checks/protocol-connection-
health.ts`, new; `src/quality-score.ts`, `protocolConnectionDeductions()`
deleted): previously `quality-score.ts` deducted points directly from
`MCPConnection.capabilityErrors`/`.protocolVersion`/`.serverInfo` with NO
corresponding `DiagnosticResult` — a developer looking at "why did my
protocol score drop" found nothing in `diagnostics` or `--json` explaining
it. `protocolConnectionHealthCheck` (id `protocol.connection-health`) now
emits real diagnostics for the same three conditions
(`protocol.version-downgrade`, `protocol.missing-server-info`,
`protocol.capability-error`) and is added to `allChecks` (now 16 checks,
was 15). `computeConnectionQualityScore` no longer reads `MCPConnection`
metadata directly at all — purely `diagnostics -> dimension -> score`.
Consequence (intentional, documented, not a bug): exact point values
changed, since these now flow through the same generic per-severity/
per-checkId-cap formula as every other diagnostic instead of ad-hoc
hardcoded amounts. `protocol.capability-error` was reclassified from an
implicit flat -15 to severity `'error'` (8pts, cap 25) — a server declaring
a capability it can't actually serve is a real conformance defect, more
severe than a style nit. `protocol.version-downgrade` and `.missing-server-
info` are `'info'` (1pt, cap 5, was an implicit flat -5 each) — informational
findings should cost little, per requirement 6 below.

**3. Score coverage** (`ReportQualityScore.coverage`/`coveragePercent`/
`scoredServers`/`unscoredServers`, additive to `types.ts`;
`computeQualityCoverage()` in `quality-score.ts`): coverage is derived from
comparing the *executed* check list (`RunOptions.checks`, now threaded from
`orchestrator.ts` and `cli.ts`'s post-snapshot recompute into
`computeReportQualityScore(report, executedChecks)`) against `allChecks`
grouped by dimension (via the same `inferDiagnosticCategory` used for
scoring — no new per-check metadata field needed). Per dimension:
`'covered'` if every built-in check for it ran, `'partial'` if some ran (or
only an unmapped custom check contributed), `'not-covered'` if none ran.
`reliability` is unconditionally `'covered'` — its signal (did the
connection succeed) isn't produced by any optional `Check`, it's inherent
to attempting a connection at all. `QualityScoreBreakdown` (the per-server
shape) is UNCHANGED — coverage is a report-level concept (the same checks
ran for every server in one `runChecks()` call), so nothing that destructures
`perServer[name]` needed to change. Reason: the milestone's core complaint —
"security: 100/100 looks like a full audit even if the caller only ran
schema checks" — is now impossible to misread; `coveragePercent < 100`
or any `not-covered`/`partial` entry says exactly which dimensions weren't
actually evaluated. An unrecognized/custom check's checkId still falls back
to `'quality'`→usability (unchanged existing behavior from v1.0's
`inferDiagnosticCategory`, deliberately NOT changed to "ignore unmapped
checks" — see `DiagnosticResult.category` fallback rationale in the
original Quality Engine entry above); coverage now correctly reflects that
as `'partial'` usability coverage rather than pretending it's `'covered'`.

**4. Semantic honesty**: `QUALITY_SCORE_DISCLAIMER` (a single exported
string constant) is now part of `ReportQualityScore` and printed once
(never per-server, to stay concise) in the human report's quality section:
"This score reflects issues detectable by mcp-medic's passive inspection
(see \"coverage\") — it is not a certification of the server's actual
security, correctness, or behavior." `formatReportHuman()` also prints a
`Coverage: N% (...)` line naming any non-`'covered'` dimensions, and a
`Note: N server(s) could not be scored...` line when `unscoredServers` is
non-empty — connection failures are report.connections-visible today, but
this makes the omission from a fleet's aggregate score visible too, not
just inferable from summary counts.

**5. Coverage-aware `quality.minimumScore` gate** (`checkMinimumScorePolicy()`,
new, exported from `quality-score.ts` as a pure function so it's unit-
testable without a real CLI invocation or a restricted check set — `cli.ts`
just calls it and pushes whatever it returns): a `minimumScore` policy now
ALSO produces a `policy.partial-coverage-with-minimum-score` **warning**
(never an error — doesn't change `--fail-on error`'s default exit code)
whenever `coveragePercent < 100` or any server is unscored, alongside the
existing `policy.minimum-quality-score` error when the score itself is too
low. Reason: "a minimum-score check must not silently pass because only a
subset of checks executed" — chose a warning over a hard failure because
hard-failing an already-passing CI pipeline the moment coverage tracking
shipped would be a surprising, disproportionate breaking change; a visible
warning satisfies "never silent" without that risk. Note the CLI itself
can't currently reach a `<100%` coverage state through normal usage (there's
no `--only-checks` flag; `loadChecks()` always loads the full built-in set
plus policy-derived checks) — the coverage-aware behavior is real and
tested (`test/quality-score.test.ts`'s `checkMinimumScorePolicy` suite,
plus `runChecks({ checks: [...] })` integration tests in
`test/orchestrator.test.ts`), but is currently reachable only via the
library API, not the CLI. Documented as a known limitation rather than
adding a CLI flag not requested by this milestone.

**Audited, found already-correct, NOT changed**: the 5 dimension weights
(protocol 25/schema 20/usability 20/security 20/reliability 15 — unchanged
per the explicit "do not arbitrarily change these weights" instruction);
the per-checkId deduction caps (already prevent any single noisy checkId
from dominating a dimension — verified with an explicit order-independence
test and a 20-identical-warnings-capped-at-15 test, both passing
unchanged); a single error's impact relative to a single info finding
(verified strictly less via a new test, satisfying "informational findings
should not unnecessarily reduce score" and "protocol errors should have
stronger impact than stylistic recommendations" without changing constants).

Test count: 239 → 283 (+44) in this pass. All pre-existing tests continue
passing; typecheck/build/`npm pack --dry-run` clean.

## 2026-09-06 — [core] Real-world validation milestone: protocol gaps, one deterministic security check, score/CLI review
Decision (what changed): four scoped changes, each traced to a specific
real-world gap, not speculative coverage-padding.

**1. `resources/templates/list` support** (`MCPResourceTemplate` in
`types.ts`, `MCPConnection.resourceTemplates`,
`capabilityErrors.resourceTemplates`; `normalizeResourceTemplates()` +
the request in `connect.ts`): verified against the MCP spec
(`ResourceTemplate` extends `BaseMetadata`, governed by the same
`capabilities.resources` flag — there is no separate templates
sub-capability) that this RPC exists and is legitimately optional. Most
real servers that expose only concrete resources never implement it; a
JSON-RPC `-32601` ("Method not found") response to it is spec-compliant,
not a defect, so `isMethodNotFound()` swallows it silently instead of
setting `capabilityErrors.resourceTemplates`. A genuine failure (any other
error) still surfaces as a capability error without failing the connection,
same as `resources`/`prompts`.

**2. Request-id desync bug, found by implementing (1), fixed everywhere**:
`connect()`'s per-request expected-id tracking used
`validateResponse(await withTimeout(...), nextExpectedId++)` — a trailing
argument evaluated *after* an `await` that can throw. If a request timed
out or failed (exactly what most servers' response to the new
`resources/templates/list` call does), the `++` never ran, desyncing the
local counter from the transport's real, unconditionally-incrementing id.
Every subsequent request in the same connection would then fail response
validation (`response.id !== expectedId`) even though the server answered
correctly — in practice this meant adding *any* optional capability probe
that commonly fails/times out (which is exactly what (1) is) would silently
break `prompts/list` for every server that also declares `prompts`. Fixed
at all four `list` call sites (now centralized in `requestAllPages()`, see
(3)) and at `initialize` by capturing the expected id in a `const`
*before* the `await`, never as a trailing call argument. Regression-tested
in `test/protocol/connect.test.ts` (`with-resources-prompts` mode, which
now returns `-32601` for `resources/templates/list` by default, exercising
exactly the sequence that exposed the bug).

**3. Cursor-based pagination for all four `list` RPCs** (`requestAllPages()`
in `connect.ts`, used by `tools/list`, `resources/list`,
`resources/templates/list`, `prompts/list`): verified against the spec
schema that `ListToolsRequest`/`ListResourcesRequest`/`ListPromptsRequest`/
`ListResourceTemplatesRequest` all extend `PaginatedRequest` (optional
`cursor` param, optional `nextCursor` in the response) — present since the
client's earliest supported protocol version, not new in any recent
revision. mcp-medic previously sent every `list` request with no `cursor`
and used only the first page's array, meaning a server with a large-enough
catalog to paginate would have tools/resources/prompts past page 1 silently
invisible to every check and to the quality score — a real false-negative
class, not a hypothetical one, since pagination is spec-legal at any
catalog size a server chooses. `requestAllPages()` follows `nextCursor`
until absent, capped at `MAX_PAGINATION_PAGES = 1000` (a defensive guard
against a misbehaving/malicious server that never stops paginating, which
would otherwise hang a passive `check` indefinitely); exceeding the cap is
reported as a connection failure, not a silent truncation. This is a
non-cosmetic protocol-accuracy fix that happened to surface only while
investigating (6) below, not something (6) itself required.

**4. `security.hidden-unicode-tags`** (new check, `src/checks/`): the
Unicode "Tags" block (U+E0000–U+E007F) is documented
(arXiv:2607.05744) as a real MCP tool-metadata steganography technique —
invisible in any UI, but present in the string many LLM tokenizers see.
Deliberately given `severity: 'error'` and no "heuristic" language in its
description, unlike the three existing `security.*` checks: detecting the
presence of these codepoints is a deterministic fact, not a pattern-match
guess, so it shouldn't be hedged the same way `untrusted-remote` or
`prompt-injection-risk` are. The check reports which field was affected
and a visible-text preview with tag characters stripped; it never echoes
the raw hidden payload into a diagnostic message.

**5. `quality.resource` extended to `resourceTemplates`**: same
missing-name/missing-description/duplicate-URI/empty-URI checks now also
run against `MCPResourceTemplate[]`, independently of whether `resources`
was present (the two arrays are checked in independent branches, not
gated on each other being populated).

**6. `report.ts`'s "Capabilities:" line and `capabilityErrors` block**
now surface resource-template counts/errors alongside tools/resources/
prompts, so (1) isn't invisible in the human report.

**Phase 2 (score calibration) — audited, changed nothing**: reviewed
`SEVERITY_POINTS`/`SEVERITY_CAP_PER_CHECK`/dimension weights against the
new real-world findings above; none of them motivate a weight or cap
change (the new check and the templates/pagination fixes all plug into the
existing dimension/severity model without needing new scoring rules).
Order-independence and per-checkId capping (audited in the v1.1 pass) are
unaffected — grouping in `deductionsFromDiagnostics()` is by
`checkId|severity` via a `Map`, not by diagnostic order or insertion time.
Deliberately did NOT add a "coverage" bump for the templates/pagination
work — `computeQualityCoverage()` already derives coverage from
`allChecks`/`checkId` prefixes, which pagination doesn't touch (it's a
connection-layer fix, not a new check) and `security.hidden-unicode-tags`
is automatically picked up since it's registered in `allChecks`.

**Phase 3 (false-positive/false-negative review) — one FN fixed, one
FN newly closed, no new FPs found**: the pagination gap (3) and the
`resources/templates/list` gap (1) were both false negatives (real,
spec-legal server behavior mcp-medic didn't inspect at all) rather than
incorrect diagnostics on data it did see. No existing check was found to
produce a false positive against the real tool/resource/prompt shapes
checked against the public MCP spec examples and reference server source.
Two patterns were noted from real servers but deliberately NOT turned into
new checks, for lack of more than one observed instance: a
"DEPRECATED: use X instead" description convention, and a same-server
cluster of tools sharing a naming prefix — both are plausible future
`quality.*` rules but would be speculative on this evidence alone.

**Phase 4 (CLI/CI) — one real gap fixed**: the human report's
"Capabilities:" line silently dropped resource-template counts even after
(1) shipped, which would have made the new data invisible outside `--json`
output; fixed in (6). No other CLI/CI friction was found to justify a
change this pass — exit codes, `--json`/SARIF/JUnit shapes, and the
`quality.minimumScore` policy gate's partial-coverage warning (from the
v1.1 pass) were re-checked against the new `resourceTemplates` field and
require no changes, since they're keyed off diagnostics/score, not raw
connection fields.

**Phase 5 (competitive gap check) — no action**: mcp-medic's
differentiation (deterministic scoring + coverage + CI policy enforcement,
vs. inspector-style manual exploration tools) is unaffected by anything
found this pass; no competitor capability gap was judged large enough to
justify implementation here.

**Phase 6 (MCP 2026-07-28) — plan only, confirmed via the actual spec
schema, no implementation this milestone**: fetched
`schema/2026-07-28/schema.ts` directly (previously only reasoned about
secondhand). Confirmed: `InitializeRequest`/`InitializeResult` and the
`notifications/initialized` notification are removed entirely; every
request instead carries required per-request `_meta` fields
(`io.modelcontextprotocol/protocolVersion`,
`io.modelcontextprotocol/clientCapabilities`), and version/capability
negotiation moves to a new `server/discover` RPC. This is a different wire
protocol, not an additive revision — `connect()`'s entire model (one
handshake produces `capabilities`/`protocolVersion`, then plain
`list`/pagination calls reuse them) does not apply. `KNOWN_UNSUPPORTED_
PROTOCOL_VERSIONS['2026-07-28']` (already in `versions.ts` from an earlier
session) correctly fails fast with this reason instead of attempting or
faking a handshake — left unchanged, now confirmed accurate rather than
assumed. Architectural implications for a real implementation (future
milestone, not this one): (a) `Transport` would need a `server/discover`-
based negotiation path entirely separate from `initialize`, selected by
which protocol version is requested, since a single client may need to
speak either wire shape; (b) every per-request call site would need to
attach `_meta` fields once capabilities/version are known, which changes
`Transport.request()`'s signature or adds a wrapping layer — not a small
diff given `StdioTransport`/`HttpTransport`/`SseTransport` all implement
`request()` today; (c) passive inspection is still possible in principle
(the RPCs being inspected — `tools/list` etc. — still exist, just
addressed differently), so this is a compatibility/adapter problem, not a
reason to add active calls; (d) new fixtures would need a
`2026-07-28`-shaped fake server (`server/discover` + `_meta`-per-request)
entirely distinct from the existing `initialize`-based fixture. Not
implemented this milestone: the change touches the `Transport` interface
shared by all three transports, is not "small," and no server in active
use today speaks only this wire shape (it postdates every version any
real deployed server currently negotiates) — so there is no real-world
validation evidence yet that justifies it, only the spec's existence.

Test count for this milestone overall (`security.hidden-unicode-tags` +
`resources/templates/list` + the id-desync fix + pagination + the
`quality.resource`/`report.ts` template coverage): 283 → 306 (+23).
All pre-existing tests continue passing; typecheck/build clean; see the
PR description for the exact per-file breakdown.

