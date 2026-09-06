# mcp-doctor

Diagnose broken MCP (Model Context Protocol) server configs before they break your agent silently.

`mcp-doctor` validates MCP server configurations, executes full protocol initialization handshakes across stdio/SSE/HTTP transports, checks all exposed tool JSON schemas against standard specifications, and simulates sample calls — providing actionable suggestions, in-editor VS Code diagnostics, fleet management, and CI-ready exit codes.

---

## Features

- 🔍 **Auto-Discovery**: Run `mcp-doctor check` with no arguments to auto-discover Claude Desktop, `.mcp.json`, and VS Code/Cursor MCP configuration paths across macOS, Windows, and Linux.
- 💡 **Auto-Fix Suggestions**: Diagnose issues with clear, actionable fix suggestions using `--show-fixes`.
- 🌐 **Registry Validation**: Validate published registry entries directly using `mcp-doctor check --registry <server-id>`.
- 🏢 **Fleet Validation**: Scan and validate monorepos or multi-team configurations with `mcp-doctor check-all "<glob>"`.
- ⚖️ **Drift Detection**: Catch environment divergence between staging and production configs with `mcp-doctor diff <configA> <configB>`.
- 📜 **Policy-as-Code**: Enforce organizational constraints (e.g., banned transports, domain allowlists, minimum description lengths) via `.mcp-doctor-policy.json` / `--policy`.
- 📸 **Snapshot Baseline Mode**: Filter out legacy diagnostics with `--snapshot <baseline.json>` to gate only on newly introduced regressions.
- 📊 **CI Reporting**: Export standard JUnit XML (`--export-junit <file.xml>`) and JSON (`--export-json <file.json>`) for seamless CI dashboard visualization.
- 👀 **Watch Mode**: Re-run validation on save using `mcp-doctor watch <path>`.
- ⚡ **Transport Hardening**: Full handshake validation across stdio, HTTP (with OAuth token refresh), and SSE (with automatic retry resilience).
- 💻 **VS Code Extension**: In-editor squiggles and hover tooltips showing diagnostics and suggested fixes.
- 🚦 **CI Usability & Exit Codes**: Strict exit code taxonomy (`0` clean, `1` diagnostic failures, `2` usage/syntax errors) and `--fail-on <error|warning>`.
- 🤖 **GitHub Action**: Drop-in CI integration via `shivam039/mcp-doctor@main` (or `mcp-doctor-action`).
- 🧩 **Community Checks**: Conformance test helper (`runCheckConformanceSuite`) to build custom `mcp-doctor-check-*` check plugins.

---

## Quick Start

```bash
# Run against auto-discovered configs in current project / Claude Desktop
npx mcp-doctor

# Run check on a specific configuration file
npx mcp-doctor check path/to/config.json

# Validate all configs across a monorepo
npx mcp-doctor check-all "configs/**/*.json"

# Compare two configs to detect drift
npx mcp-doctor diff staging.mcp.json prod.mcp.json

# Validate a published registry server directly without a local config
npx mcp-doctor check --registry @modelcontextprotocol/server-memory
npx mcp-doctor check --registry smithery:username/my-server

# Apply organizational policy rules and export to JUnit XML
npx mcp-doctor check path/to/config.json --policy .mcp-doctor-policy.json --export-junit results.xml

# Display suggested fixes for flagged diagnostics
npx mcp-doctor check path/to/config.json --show-fixes

# Watch mode (re-runs checks on save)
npx mcp-doctor watch path/to/config.json
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
| `--config <path>` | Explicit configuration path |
| `--policy <path>` | Apply organizational policy rules (`.mcp-doctor-policy.json`) |
| `--snapshot <path>` | Compare against baseline snapshot, reporting regressions only |
| `--update-snapshot <path>` | Save diagnostic report as new baseline snapshot |
| `--export-junit <file>` | Export report in JUnit XML format |
| `--export-json <file>` | Export report in JSON format |
| `--show-fixes` | Show suggested fixes inline under diagnostics |
| `--fail-on <severity>` | Fail with exit code 1 on `error` (default) or `warning` |
| `--verbose`, `-v` | Output raw JSON-RPC traffic and debug messages |
| `--json` | Output full diagnostic report in JSON |
| `--timeout <ms>` | Per-server handshake timeout in milliseconds (default: `5000`) |

### Exit Codes

- **`0`**: All checks passed cleanly.
- **`1`**: Diagnostic failure (one or more errors, or warnings if `--fail-on warning` is set).
- **`2`**: Configuration or usage error (missing file, JSON parse error, invalid options).

---

## Policy-as-Code (`.mcp-doctor-policy.json`)

Define organization-wide policies that compose with built-in checks:

```json
{
  "bannedTransports": ["stdio"],
  "allowedDomains": ["corp.internal", "mcp.example.com"],
  "minDescriptionLength": 20
}
```

---

## VS Code Extension

The `mcp-doctor` VS Code extension provides:
- Inline squiggles on `.mcp.json`, `mcp.json`, and `claude_desktop_config.json` files as you edit.
- Hover tooltips showing the full diagnostic explanation and actionable suggested fix.

---

## GitHub Action

Add MCP config validation to your PR workflow:

```yaml
name: Validate MCP Configs
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivam039/mcp-doctor@main
        with:
          config-path: './.mcp.json'
          fail-on: 'error'
          show-fixes: 'true'
```

---

## Check Ecosystem Directory

| Check ID | Package | Scope | Description |
|---|---|---|---|
| `schema.malformed` | `mcp-doctor` | **Official** | Verifies inputSchema is a valid JSON schema object |
| `schema.missing-required` | `mcp-doctor` | **Official** | Flags required fields missing from properties |
| `schema.type-mismatch` | `mcp-doctor` | **Official** | Flags invalid JSON schema types and enum mismatches |
| `schema.missing-description` | `mcp-doctor` | **Official** | Flags tools and properties missing documentation |
| `schema.sample-call-simulation` | `mcp-doctor` | **Official** | Simulates and validates synthetic call payloads |
| `policy.*` | `mcp-doctor` | **Official** | Evaluates policy-as-code rules (transports, domains, length) |
| `community.strict-typing` | `mcp-doctor-check-strict-typing` | *Community* | Enforces strict property type annotations |
| `community.no-empty-enums` | `mcp-doctor-check-no-empty-enums` | *Community* | Ensures non-empty enum option lists |

To write and publish your own check plugin, see [Authoring Custom Checks](./docs/AUTHORING_CHECKS.md).

---

## Governance, Stability & Security

- 🏛️ [Governance & Project Sustainability](./GOVERNANCE.md)
- 📜 [1.0 Stability & Deprecation Policy](./docs/STABILITY_POLICY.md)
- 🔒 [Security Policy & Threat Model](./SECURITY.md)
- 💡 [RFC Process](./docs/RFC_PROCESS.md)

---

## Development

```bash
npm install
npm run build
npm run typecheck
npm run test
```

## License

MIT
