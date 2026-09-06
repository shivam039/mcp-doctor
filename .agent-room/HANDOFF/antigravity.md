# Handoff — antigravity

(Earlier sessions' notes on the original CLI/fixtures/config-loader work
are superseded by this file and by git history — see the "Add CLI,
config-loader, fixtures, and library entrypoint" commit. This entry covers
the Phase 3 session: `mcp-doctor fix` + security checks.)

## Done this session (Phase 3: FR3-1 auto-apply, FR3-2 security checks)

- **`src/fix.ts`** (new) — pure logic, no I/O: `ConfigPatch` type
  (`{ serverName, set }`), `isConfigPatch`, `diffConfigPatch` (what a patch
  would change, `[]` if already applied or server not found),
  `applyConfigPatch` (returns a new raw config, never mutates), and
  `formatFieldDiff`. 14 unit tests in `test/fix.test.ts`.
- **`mcp-doctor fix <path> [--check <id>] [--dry-run]`** in `src/cli.ts`:
  runs the same checks as `check`, filters diagnostics down to ones whose
  `suggestedFix.patch` matches `ConfigPatch`, de-dupes identical patches,
  then per fix: prints the diagnostic + a field-level diff, and (unless
  `--dry-run`) prompts `y/N` via `node:readline/promises` before applying
  — never bulk-applies. On the first actual write, copies the original
  file to `<path>.bak` (non-negotiable, no flag disables it — FR3-1.2).
  `--dry-run` shows every diff (plain text or `--json`) and prompts/writes
  nothing (FR3-1.3). `main()` now takes an optional second `deps: { confirm }`
  parameter so tests can inject a fake confirm function instead of dealing
  with real stdin — see `test/fix-cli.test.ts`.
- **Three new checks** in `src/checks/security-*.ts`, registered in
  `src/checks/index.ts` (now 8 checks total):
  - `security.untrusted-remote` — for sse/http servers, flags `http://`
    URLs (warning, **with** a fixable patch upgrading to `https://`) and
    raw IP-address hosts instead of domain names (warning, **no** patch —
    there's no way to safely guess the intended domain). Loopback
    (`127.0.0.1`/`::1`) is excluded from the IP-literal check specifically,
    since flagging local dev as "untrusted remote" is misleading — the
    non-https warning still applies to loopback over plain http.
  - `security.overbroad-permissions` — flags inputSchema string properties
    named like `command`/`path`/`url` etc. with no `enum`/`pattern`
    constraining them, and tool descriptions claiming unrestricted
    shell/filesystem/network access. No patch (server-owned schema).
  - `security.prompt-injection-risk` — flags tool/parameter descriptions
    containing instruction-like language aimed at the model rather than a
    human (e.g. "always call this first", "ignore previous instructions").
    No patch.
  - All three: every diagnostic message and each check's `description`
    field explicitly says "heuristic flag, not a guarantee — review this
    server's source before trusting it" (FR3-2.4) — enforced by a test in
    `test/checks/index.test.ts`.
- **Fixtures**: `test/fixtures/configs/insecure-remote.json` (single
  fixable http server, for demoing `fix`) and
  `untrusted-remote-mixed.json` (5 servers covering every
  `security.untrusted-remote` branch), each with a `.expect.md`. Plus new
  mock `MCPConnection` fixtures in `test/fixtures/mock-connections.ts` for
  all three new checks' unit tests.
- **Idempotency (FR3-1.4)**, verified two ways:
  1. `test/checks/security-untrusted-remote.test.ts` has a dedicated
     `describe('idempotency', ...)` block: applies the suggested patch,
     confirms the check reports nothing against the fixed connection, and
     confirms re-applying the same patch is a no-op (`diffConfigPatch`
     returns `[]`).
  2. `test/fix-cli.test.ts` has a dedicated `describe('idempotency
     (FR3-1.4)', ...)` block: runs `mcp-doctor fix` twice end-to-end
     against a real local MCP-over-HTTP server (`node:http`, no network) —
     the second run neither prompts nor writes anything.
- **`test/fix-cli.test.ts`** also exercises the full real pipeline (real
  `src/protocol/` HTTP transport + real `security.untrusted-remote` +
  real diff/confirm/write) end-to-end: confirm → applies + writes `.bak`;
  decline → writes nothing; `--dry-run` → never prompts, never writes;
  `--check <id>` → filters correctly.
- Manually smoke-tested the built `dist/cli.js` as a real subprocess with
  piped stdin (`y\n`) against a real local HTTP server, confirming the
  interactive `readline`-based prompt (not just the test's injected
  `confirm`) actually works.

## What's NOT auto-fixable, on purpose

Of the 8 built-in checks, only `security.untrusted-remote`'s non-https
diagnostic produces a `patch` today. Everything else (`schema.*`, the
IP-literal-host and overbroad-permissions/prompt-injection diagnostics) is
about data a third-party MCP server declares, not the local config file —
mcp-doctor has no safe mechanical fix for "this server's tool description
looks suspicious." Those stay description-only by design; `fix` correctly
reports "No auto-fixable diagnostics found" for a config with only those.

## CONTRACT.md / DECISIONS.md changes

- Added a "Scope of Phase 3" section to CONTRACT.md (auto-fix was
  explicitly out of v1 scope) and documented the `ConfigPatch` shape there.
- Added a row to the module-boundaries table: I implemented the
  `security.*` checks this session (normally Jules' `src/checks/*` area)
  because the human asked for `fix` and the checks that produce fixable
  patches together, and no other session was concurrently touching
  `src/checks/*`. Full reasoning logged in DECISIONS.md.

## Notes for whoever picks this up

- `npm run build`, `npm run typecheck`, and `npx vitest run` all pass
  (107 tests across 20 files) as of this commit.
- Did not touch `src/types.ts`, `src/orchestrator.ts`, `src/report.ts`, or
  `src/protocol/*`. Did touch `src/checks/*` this session only — see
  DECISIONS.md for why that's a deliberate, logged exception.

## Done this session (Phase 4: Enterprise Governance & Phase 5: Distribution / NPM Release)

- **Policy-as-Code (`src/policy.ts`)**: Auto-loads `.mcp-medic-policy.json` (fallback `.mcp-doctor-policy.json`) and generates composable `Check` objects enforcing transport bans, domain allowlists, and description lengths.
- **Fleet & Drift Detection (`src/fleet.ts`)**: Multi-config runner (`mcp-medic check-all "<glob>"`) and structural drift detector (`mcp-medic diff <a.json> <b.json>`).
- **CI / Team Reporting (`src/junit.ts`, `src/snapshot.ts`)**: Standard JUnit XML export (`--export-junit <file.xml>`) and baseline regression snapshotting (`--snapshot <file.json>`).
- **Community Conformance Suite (`src/conformance.ts`)**: Exported test harness for third-party `mcp-medic-check-*` plugins.
- **NPM Package Release**: Published unscoped package `mcp-medic@1.0.0` and `v1.0.1` on npm registry ([https://www.npmjs.com/package/mcp-medic](https://www.npmjs.com/package/mcp-medic)) with binary aliases for `mcp-medic`, `mcpmedic`, `mcp-doctor`, and `mcpdoctor`.
- **Zero-Touch CI/CD Automation**:
  - [.github/workflows/publish.yml](file:///Users/shivamdixit/Desktop/mcp-doctor/.github/workflows/publish.yml): Automated OIDC Trusted Publishing workflow on push to `main`.
  - [scripts/auto-release.js](file:///Users/shivamdixit/Desktop/mcp-doctor/scripts/auto-release.js): Automatic semver bumping, git tag creation, and release generation.
  - [.github/workflows/ci.yml](file:///Users/shivamdixit/Desktop/mcp-doctor/.github/workflows/ci.yml): Optimized multi-platform test matrix with path filtering and auto-cancellation concurrency.
- **Documentation & Growth Strategy**: Delivered `docs/DISTRIBUTION.md`, `docs/OUTREACH_LOG.md`, `docs/MARKETPLACE_LISTING.md`, `docs/TROUBLESHOOTING.md`, `docs/CI_INTEGRATION.md`, `docs/AUTHORING_CHECKS.md`, `docs/RFC_PROCESS.md`, `docs/STABILITY_POLICY.md`, `GOVERNANCE.md`, and `SECURITY.md`.

## Test & Build Verification

- `npm run typecheck`: **0 errors**
- `npm test`: **23 test files, 118/118 tests passing (100%)**
- `npm run build`: Clean TypeScript compilation to `dist/`
