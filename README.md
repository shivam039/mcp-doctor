# mcp-doctor

Diagnose broken MCP (Model Context Protocol) server configs before they break your agent silently.

`mcp-doctor` validates MCP server configurations, executes full protocol initialization handshakes across stdio/SSE/HTTP transports, checks all exposed tool JSON schemas against standard specifications, and simulates sample calls — providing actionable suggestions and CI-ready exit codes.

---

## Features

- 🔍 **Auto-Discovery**: Run `mcp-doctor check` with no arguments to auto-discover Claude Desktop, `.mcp.json`, and VS Code/Cursor MCP configuration paths across macOS, Windows, and Linux.
- 💡 **Auto-Fix Suggestions**: Diagnose issues with clear, actionable fix suggestions using `--show-fixes`.
- 👀 **Watch Mode**: Re-run validation on save using `mcp-doctor watch <path>`.
- ⚡ **Transport Hardening**: Full handshake validation across stdio, HTTP (with OAuth token refresh), and SSE (with automatic retry resilience).
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

# Display suggested fixes for flagged diagnostics
npx mcp-doctor check path/to/config.json --show-fixes

# Watch mode (re-runs checks on save)
npx mcp-doctor watch path/to/config.json

# Output machine-readable JSON
npx mcp-doctor check path/to/config.json --json
```

---

## CLI Options

| Flag | Description |
|---|---|
| `[check] [path]` | Check target configuration (or auto-discover if path is omitted) |
| `watch <path>` | Watch configuration file and re-run checks on file save |
| `--config <path>` | Explicit configuration path |
| `--show-fixes` | Show suggested fixes inline under diagnostics |
| `--fail-on <severity>` | Fail with exit code 1 on `error` (default) or `warning` |
| `--verbose`, `-v` | Output raw JSON-RPC traffic and debug information |
| `--json` | Output full diagnostic report in JSON |
| `--timeout <ms>` | Per-server handshake timeout in milliseconds (default: `5000`) |

### Exit Codes

- **`0`**: All checks passed cleanly.
- **`1`**: Diagnostic failure (one or more errors, or warnings if `--fail-on warning` is set).
- **`2`**: Configuration or usage error (missing file, JSON parse error, invalid options).

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

## Creating Community Checks (`mcp-doctor-check-*`)

Community check packages should be named `mcp-doctor-check-<name>` and implement the `Check` interface. Use the built-in conformance helper to ensure full compliance:

```ts
import { describe, it, expect } from 'vitest';
import { runCheckConformanceSuite } from 'mcp-doctor';
import { myCustomCheck } from './my-custom-check.js';

describe('myCustomCheck conformance', () => {
  it('conforms to mcp-doctor check contract', async () => {
    const result = await runCheckConformanceSuite(myCustomCheck);
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
```

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
