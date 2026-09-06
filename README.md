# mcp-medic

[![CI](https://github.com/shivam039/mcp-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/shivam039/mcp-doctor/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mcp-medic.svg)](https://www.npmjs.com/package/mcp-medic)
[![license](https://img.shields.io/npm/l/mcp-medic.svg)](./LICENSE)

An MCP quality gate for developers and CI — not just "does my config parse," but "is this MCP server high-quality, safe, well-described, and usable by an AI agent."

`mcp-medic` validates MCP server configurations, executes full protocol initialization handshakes across stdio/SSE/HTTP transports (with real protocol version negotiation), passively inspects every declared tool/resource/prompt, checks JSON schemas against the MCP spec, and computes a deterministic 0–100 **MCP Quality Score** — providing actionable diagnostics, a stable diagnostic taxonomy, and CI-ready exit codes.

> [!NOTE]
> **Naming & Installation**: The npm package for this tool is **`mcp-medic`** (`npx mcp-medic` / `npm i -g mcp-medic`). While this GitHub repository is named `mcp-doctor`, an unrelated older package already occupies the npm name `mcp-doctor` (different author). Users who want this tool must install **`mcp-medic`**, not `mcp-doctor`.

## Why this exists

A broken MCP server config usually doesn't fail loudly — it fails as your agent silently missing a tool, retrying a handshake forever, or getting a malformed schema it can't reason about. Those bugs are miserable to track down after the fact. `mcp-medic` catches them at the config level, before an agent ever touches the server: it actually connects (real `initialize` handshake, real `tools/list`), so "the config parses" and "the server actually works" are checked together, in CI, with a real exit code.

## ⚠️ How this works — please read before pointing it at a config

`mcp-medic` validates a config by **actually connecting to the servers in it**:
- `stdio` transport → it **spawns the configured `command`** as a real child process on your machine.
- `sse`/`http` transport → it **makes real network requests** to the configured `url`, including any `headers` you've set (e.g. auth tokens).

This is the whole point (a real handshake, not a schema guess) — but it means you should only run it against configs you trust, the same way you'd only `npm install` a `package.json` you trust. See [SECURITY.md](./SECURITY.md) for the full threat model.

---

## Features

- 🏆 **MCP Quality Score**: a deterministic 0–100 score across five weighted dimensions (Protocol, Schema, Agent usability, Security, Reliability) via `mcp-medic score <config>` or `check --score`. No LLM, no randomness — every point is traced back to a real diagnostic.
- 🧠 **Tool/Resource/Prompt Quality Checks**: flags empty/duplicate/placeholder tool names, vague or placeholder descriptions, malformed input/output schemas, contradictory tool annotations, excessive tool surface (bloat), and duplicate/malformed resources and prompts.
- 🔍 **Auto-Discovery**: Run `mcp-medic check` with no arguments to auto-discover Claude Desktop, `.mcp.json`, and VS Code/Cursor MCP configuration paths across macOS, Windows, and Linux.
- 💡 **Auto-Fix Suggestions**: Diagnose issues with clear, actionable fix suggestions using `--show-fixes`.
- 🌐 **Registry Validation**: Validate published registry entries directly using `mcp-medic check --registry <server-id>`.
- 🧪 **Fleet Validation** (experimental): Scan and validate monorepos or multi-team configurations with `mcp-medic check-all "<glob>"`.
- 🧪 **Drift Detection** (experimental): Catch environment divergence between staging and production configs with `mcp-medic diff <configA> <configB>`.
- 📜 **Policy-as-Code**: Enforce organizational constraints (banned transports, domain allowlists, minimum description lengths, a minimum quality score, a max tool count, required tool descriptions) via `.mcp-medic-policy.json` / `--policy`.
- 📸 **Snapshot Baseline Mode**: Filter out legacy diagnostics with `--snapshot <baseline.json>` to gate only on newly introduced regressions.
- 📊 **CI Reporting**: Export JUnit XML (`--export-junit`), JSON (`--export-json`, always includes the quality score), and SARIF 2.1.0 (`--export-sarif`, for GitHub Code Scanning).
- 👀 **Watch Mode**: Re-run validation on save using `mcp-medic watch <path>`.
- ⚡ **Protocol Correctness**: real protocol version negotiation (client requests a version, server's actual negotiated version is validated — not assumed), full handshake validation across stdio, HTTP (with OAuth token refresh), and SSE (with automatic retry resilience), plus passive `resources/list`/`prompts/list` capability inspection.
- 🧪 **VS Code Extension** (experimental, not yet on the Marketplace): in-editor squiggles and hover tooltips — runnable from source today, see [vscode-extension/](./vscode-extension/).
- 🚦 **CI Usability & Exit Codes**: Strict exit code taxonomy (`0` clean, `1` diagnostic failures, `2` usage/syntax errors) and `--fail-on <error|warning>`.
- 🤖 **GitHub Action**: Drop-in CI integration via `shivam039/mcp-doctor@main` (or `mcp-medic-action`).
- 🧩 **Community Checks** (framework ready, no packages published yet): a conformance test helper (`runCheckConformanceSuite`) so anyone can build and publish their own `mcp-medic-check-*` plugin.

---

## MCP Quality Engine

`mcp-medic` computes a deterministic **MCP Quality Score** (0–100) from the same diagnostics shown in the report — there's no separate, opaque scoring model guessing independently. Every point deducted traces back to one or more real diagnostics, and the same input always produces the same score (no LLM, no randomness, no extra network calls beyond the MCP inspection already performed).

```bash
mcp-medic score path/to/config.json
# or, alongside the normal report:
mcp-medic check path/to/config.json --score
```

### Dimensions

| Dimension | Weight | What it reflects |
|---|---|---|
| Protocol | 25% | Version negotiation compatibility, capability-inspection health (`resources/list`/`prompts/list` succeeding), `serverInfo` presence |
| Schema | 20% | `schema.*` diagnostics — malformed/missing input schemas, type mismatches, missing required fields |
| Agent usability | 20% | Tool/resource/prompt naming, description quality, output schemas, annotations, tool-surface bloat |
| Security | 20% | `security.*` heuristic diagnostics (untrusted remotes, overbroad permissions, prompt-injection-risk patterns) |
| Reliability | 15% | Whether the server connects at all (currently binary — see [Known Limitations](#known-limitations)) |

### How deductions work

Each dimension starts at 100. Diagnostics are grouped by `checkId` and severity (`error`/`warning`/`info`), each contributing capped points (errors up to 25/checkId, warnings up to 15/checkId, info up to 5/checkId) — so **one noisy check can never dominate a dimension**: 20 tools sharing the same description problem cost at most 15 points, not 300. The report's "Deductions" list names exactly which checks cost how many points.

### Diagnostic categories

Every diagnostic has a stable category (`protocol`, `schema`, `quality`, `security`, `reliability`, `usability`, `configuration`) — set explicitly by newer checks, or inferred from the `checkId` prefix for older ones, so nothing that already worked had to change.

---

## Quick Start

> **Preferred invocation**: Run `npx mcp-medic` (the npm package is `mcp-medic`, not `mcp-doctor`).

```bash
# Run against auto-discovered configs in current project / Claude Desktop
npx mcp-medic

# Run check on a specific configuration file
npx mcp-medic check path/to/config.json

# Validate all configs across a monorepo
npx mcp-medic check-all "configs/**/*.json"

# Compare two configs to detect drift
npx mcp-medic diff staging.mcp.json prod.mcp.json

# Validate a published registry server directly without a local config
npx mcp-medic check --registry @modelcontextprotocol/server-memory
npx mcp-medic check --registry smithery:username/my-server

# Apply organizational policy rules and export to JUnit XML
npx mcp-medic check path/to/config.json --policy .mcp-medic-policy.json --export-junit results.xml

# Display suggested fixes for flagged diagnostics
npx mcp-medic check path/to/config.json --show-fixes

# Compute the deterministic MCP quality score
npx mcp-medic score path/to/config.json

# Watch mode (re-runs checks on save)
npx mcp-medic watch path/to/config.json
```

---

## CLI Options

| Command / Flag | Description |
|---|---|
| `[check] [path]` | Check target configuration (or auto-discover if path is omitted) |
| `check-all "<glob>"` | Validate all matching configuration files in fleet |
| `diff <configA> <configB>` | Detect drift between two configuration files |
| `check --registry <id>` | Validate a published registry server directly |
| `watch <path>` | Watch configuration file and re-run checks on file save |
| `fix <path>` | Interactively apply mechanical suggested fixes (see [Auto-Fix](#auto-fix-mcp-medic-fix) below) |
| `score <path>` | Print the report with the MCP quality score section (same as `check --score`) |
| `--config <path>` | Explicit configuration path |
| `--policy <path>` | Apply organizational policy rules (`.mcp-medic-policy.json`) |
| `--snapshot <path>` | Compare against baseline snapshot, reporting regressions only |
| `--update-snapshot <path>` | Save diagnostic report as new baseline snapshot |
| `--export-junit <file>` | Export report in JUnit XML format |
| `--export-json <file>` | Export report in JSON format (always includes `quality`) |
| `--export-sarif <file>` | Export report in SARIF 2.1.0 format (GitHub Code Scanning, etc.) |
| `--score` | Include the MCP quality score section in the human report |
| `--protocol-version <v>` | MCP protocolVersion to request: `auto` (default) or an explicit version |
| `--show-fixes` | Show suggested fixes inline under diagnostics |
| `--fail-on <severity>` | Fail with exit code 1 on `error` (default) or `warning` |
| `--verbose`, `-v` | Output raw JSON-RPC traffic and debug messages |
| `--json` | Output full diagnostic report in JSON |
| `--timeout <ms>` | Per-server handshake timeout in milliseconds (default: `5000`) |
| `--help`, `-h` | Show usage help |
| `--version`, `-V` | Print the installed version |

### Exit Codes

- **`0`**: All checks passed cleanly.
- **`1`**: Diagnostic failure (one or more errors, or warnings if `--fail-on warning` is set).
- **`2`**: Configuration or usage error (missing file, JSON parse error, invalid options).

---

## Auto-Fix (`mcp-medic fix`)

For the small subset of diagnostics that carry a mechanical fix (today: upgrading a `security.untrusted-remote` server's `http://` URL to `https://`), `mcp-medic fix` will show you a diff and ask for confirmation before touching your config file:

```bash
mcp-medic fix path/to/config.json

# Preview every available fix without prompting or writing anything
mcp-medic fix path/to/config.json --dry-run

# Only offer fixes from one specific check
mcp-medic fix path/to/config.json --check security.untrusted-remote
```

- Fixes are **never bulk-applied** — each one is shown as a diff and requires an explicit `y`/`N`.
- A `.bak` copy of the original file is written before any change, unconditionally.
- Most diagnostics (schema issues, the two other security checks) don't have a mechanical fix — `fix` reports "No auto-fixable diagnostics found" for those rather than guessing.

---

## Policy-as-Code (`.mcp-medic-policy.json`)

Define organization-wide policies that compose with built-in checks:

```json
{
  "bannedTransports": ["stdio"],
  "allowedDomains": ["corp.internal", "mcp.example.com"],
  "minDescriptionLength": 20,
  "quality": {
    "minimumScore": 80,
    "maxTools": 100,
    "requireToolDescriptions": true
  }
}
```

`quality.minimumScore` fails the run (adds an error diagnostic) if the computed MCP Quality Score falls below the threshold. `quality.maxTools` is an org-enforced hard limit — distinct from the built-in `quality.tool-surface` check's default 100-tool *warning*, which stays a recommendation. `quality.requireToolDescriptions` (or the equivalent top-level `requireToolDescriptions`) turns every missing tool description into a policy error rather than the default warning.

---

## VS Code Extension (experimental)

**Not published on the VS Code Marketplace yet.** The diagnostics logic (inline squiggles + hover tooltips on `.mcp.json`, `mcp.json`, and `claude_desktop_config.json` files) is real and working, but it's currently only runnable from source as an Extension Development Host, or packaged locally as a `.vsix`. See [vscode-extension/README.md](./vscode-extension/README.md) for setup — it takes about five minutes.

---

## GitHub Action

The `mcp-medic-action` (`shivam039/mcp-doctor@v1`) enables automated MCP configuration validation directly in your CI pipelines. It executes protocol handshakes, validates tool schemas, runs security heuristics, applies organizational policy rules, and gates pull requests against broken MCP setups before they affect downstream AI agents.

> **Naming Note**: This GitHub repository (`shivam039/mcp-doctor`) powers the GitHub Action; for local terminal usage or npm scripts, the CLI package is published as **`mcp-medic`** (`npx mcp-medic`).

### Example Workflow

```yaml
name: Validate MCP Configs
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate-mcp:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Validate MCP Configuration
        uses: shivam039/mcp-doctor@v1.0.4  # or @v1
        with:
          config-path: './.mcp.json'
          fail-on: 'error'
          show-fixes: 'true'
          export-junit: 'junit-mcp-report.xml'
```

### Action Inputs

| Input | Description | Required | Default |
|---|---|---|---|
| `config-path` | Path to the target MCP configuration file (defaults to auto-discovery across `.mcp.json` / Claude Desktop) | No | `''` |
| `fail-on` | Failure threshold: `'error'` (fails on errors only) or `'warning'` (fails on any error or warning) | No | `'error'` |
| `show-fixes` | Output actionable fix suggestions under flagged diagnostics (`'true'` / `'false'`) | No | `'true'` |
| `policy-path` | Path to organizational policy JSON (`.mcp-medic-policy.json`) | No | `''` |
| `export-junit` | Path to export JUnit XML report for CI test dashboards | No | `''` |
| `export-json` | Path to export JSON diagnostics report | No | `''` |
| `snapshot` | Path to baseline snapshot JSON to gate on regressions only | No | `''` |
| `timeout` | Per-server handshake timeout in milliseconds | No | `'5000'` |
| `verbose` | Output raw JSON-RPC traffic and debug logs (`'true'` / `'false'`) | No | `'false'` |

### Exit & Failure Behavior

The action adheres to strict exit code taxonomy:
- **`0` (Success)**: All configured MCP servers passed handshake and schema validations cleanly (or warnings were found with `fail-on: 'error'`).
- **`1` (Diagnostic Failure)**: One or more validation checks failed at or above the configured `fail-on` threshold.
- **`2` (Usage / Configuration Error)**: Invalid config syntax, unreadable files, or malformed CLI arguments.

> [!WARNING]
> **Execution Security**: In order to perform authentic protocol handshakes, the action spawns stdio processes and establishes real HTTP/SSE network connections specified in your configuration. Only run against configurations and repositories you trust. See [SECURITY.md](./SECURITY.md) for full threat model details.

---

## Check Ecosystem Directory

| Check ID | Package | Scope | Description |
|---|---|---|---|
| `schema.malformed` | `mcp-medic` | **Official** | Verifies inputSchema is a valid JSON schema object |
| `schema.missing-required` | `mcp-medic` | **Official** | Flags required fields missing from properties |
| `schema.type-mismatch` | `mcp-medic` | **Official** | Flags invalid JSON schema types and enum mismatches |
| `schema.missing-description` | `mcp-medic` | **Official** | Flags tools and properties missing documentation |
| `schema.sample-call-simulation` | `mcp-medic` | **Official** | Simulates and validates synthetic call payloads |
| `security.untrusted-remote` | `mcp-medic` | **Official** (heuristic) | Flags non-HTTPS or raw-IP SSE/HTTP server URLs |
| `security.overbroad-permissions` | `mcp-medic` | **Official** (heuristic) | Flags tools with unscoped shell/filesystem/network parameters |
| `security.prompt-injection-risk` | `mcp-medic` | **Official** (heuristic) | Flags instruction-like language in tool descriptions aimed at the model |
| `quality.tool-name` | `mcp-medic` | **Official** | Flags empty/duplicate (error) and overly-long/ambiguous/placeholder (warning) tool names |
| `quality.vague-description` | `mcp-medic` | **Official** | Flags present-but-vague tool descriptions (placeholder text, single words, name repeated as description) |
| `quality.output-schema` | `mcp-medic` | **Official** | Flags a malformed `outputSchema` — never flags its absence, which is optional per spec |
| `quality.tool-annotations` | `mcp-medic` | **Official** | Flags internally contradictory `ToolAnnotations` hints (e.g. both read-only and destructive) |
| `quality.tool-surface` | `mcp-medic` | **Official** | Flags excessive tool counts (default 100) and near-duplicate names/descriptions |
| `quality.resource` | `mcp-medic` | **Official** | Flags duplicate/empty resource URIs and missing required `name` from passive `resources/list` results |
| `quality.prompt` | `mcp-medic` | **Official** | Flags duplicate/empty prompt or argument names and placeholder descriptions from passive `prompts/list` results |
| `policy.*` | `mcp-medic` | **Official** | Evaluates policy-as-code rules (transports, domains, length, quality thresholds) |
| `community.strict-typing` | `mcp-medic-check-strict-typing` | *Planned / example* | Would enforce strict property type annotations |
| `community.no-empty-enums` | `mcp-medic-check-no-empty-enums` | *Planned / example* | Would ensure non-empty enum option lists |

The two `community.*` rows above are examples of what a check plugin could look like — **those packages aren't published yet**. `runCheckConformanceSuite()` (used by the official checks' own tests) is the tool for validating a plugin conforms to the `Check` interface; see [Authoring Custom Checks](./docs/AUTHORING_CHECKS.md) if you want to build and publish one.

The `security.*` checks are heuristic — they pattern-match on what a server *declares* (URLs, tool descriptions, schemas), not what it actually does at runtime. Every diagnostic they produce says so explicitly; they're a signal to investigate, not proof of a problem.

---

## Known Limitations

- **Handshake timeout defaults to 5000ms** per server (`--timeout <ms>` to change it). A slow-starting stdio server or a server behind a slow network path can fail with `status: 'timeout'` even though it would eventually respond.
- **`schema.sample-call-simulation`** builds synthetic payloads from a tool's declared JSON Schema and checks the schema is internally consistent (e.g. catches an empty `enum`, or conflicting `minimum`/`maximum`) — it does **not** actually invoke the tool, and it does not validate business logic, side effects, or whether the tool's real output matches its declared schema.
- **`security.*` checks are heuristic pattern-matching**, not a security audit — see the note above. They can both miss real issues and flag benign configs (e.g. a legitimate local dev server on plain `http://`).
- **Fleet commands (`check-all`, `diff`) are newer and less battle-tested** than `check`/`watch` — the core check pipeline they're built on is the same, but edge cases in glob matching or drift diffing are more likely.
- **The VS Code extension and community check packages are not shipped/published** — see the sections above.
- **The Reliability quality dimension is currently binary**: 100 if the server connected, 0 if it didn't (plus any future `reliability.*` diagnostics — none exist yet). Signals like latency trends, retry behavior, or flakiness across repeated runs aren't scored yet.
- **`resources/list`/`prompts/list` pagination (`nextCursor`) is not followed** — mcp-medic inspects only the first page a server returns, matching the existing (also unpaginated) `tools/list` handling. A server with a very large resource/prompt catalog behind pagination will be under-inspected.
- **The quality score never calls `resources/read`, `prompts/get`, or any tool** — it's entirely derived from the passive `initialize`/`tools/list`/`resources/list`/`prompts/list` responses already gathered during a normal `check`. See [SECURITY.md](./SECURITY.md) for the full passive-only guarantee.
- **npm README sync**: Latest docs live on GitHub main; npm README updates on the next publish.
- **First run via `npx`** pays a one-time cost to resolve and download the package; once installed (or on a warm npx cache), `--help`/`--version` return in well under 100ms.

---

## Contributing & Support

- 🐛 [Report a bug](https://github.com/shivam039/mcp-doctor/issues/new?template=bug_report.md) / 💡 [Request a feature](https://github.com/shivam039/mcp-doctor/issues/new?template=feature_request.md)
- 📋 See [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR
- 📝 [CHANGELOG](./CHANGELOG.md)

> [!NOTE]
> **Repository Metadata (GitHub Settings)**: The GitHub repository About description and topics must be configured directly in repository settings (cannot be set from repository files):
> - **Description**: `Diagnose broken MCP server configs before they break your agent. npm: mcp-medic`
> - **Topics**: `mcp`, `model-context-protocol`, `cli`, `diagnostics`, `linter`, `claude`, `vscode`, `security`, `ci`

## Governance, Stability & Security

- 🏛️ [Governance & Project Sustainability](./GOVERNANCE.md)
- 📜 [Stability & Deprecation Policy](./docs/STABILITY_POLICY.md) — v1.0's initial stable surface
- 🔒 [Security Policy & Threat Model](./SECURITY.md)
- 💡 [RFC Process](./docs/RFC_PROCESS.md) (for changes to the frozen 1.0 surface)

---

## Development

```bash
npm install
npm run build
npm run typecheck
npm run test
```

The VS Code extension (`vscode-extension/`) is a separate, independently-installed package — see [vscode-extension/README.md](./vscode-extension/README.md).

## License

MIT

