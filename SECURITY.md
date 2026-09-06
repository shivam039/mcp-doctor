# Security Policy & Threat Model

`mcp-medic` validates MCP server configurations by executing handshakes, parsing JSON-RPC responses, and inspecting JSON schemas. Because it spawns child processes and parses untrusted input, its internal attack surface is governed by strict defensive controls. (For the user-facing warning on how this tool executes and connects to configured servers, see [How this works](./README.md#️-how-this-works--please-read-before-pointing-it-at-a-config) in the README.)

---

## Threat Model & Defensive Controls

### 1. Process Spawning & Command Injection Safeguards
- **No Shell Execution**: Processes are invoked with `child_process.spawn(command, args, { shell: false })`. Arguments are passed as discrete array elements rather than interpolated shell strings, eliminating shell command injection vulnerabilities.
- **Immediate Process Cleanup**: `mcp-medic` terminates child processes immediately after the initialize handshake and tool discovery phases complete, ensuring no orphan or dangling server processes remain.

### 2. Untrusted JSON & Protocol Parsing
- **JSON-RPC Framing Protection**: stdio and HTTP responses are parsed with bounded buffer constraints. Malformed messages or invalid JSON do not crash the runner or leak internal state.
- **Robust Exception Isolation**: Every check execution is isolated with individual `try/catch` boundaries. Malicious or malformed schemas returned by an MCP server cannot crash the diagnostic runner.

### 3. Environment Variable Sanitization
- `env` overrides declared in server configurations are explicitly mapped and isolated.
- Host credentials or process tokens are never logged or leaked in reports or verbose traffic.

### 4. Remote Network Requests (HTTP / SSE)
- Network handshakes are subject to configurable timeouts (default `5000ms`) and abort controllers to prevent hanging connections or DoS via slow HTTP servers.
- Dynamic OAuth token refresh endpoints validate HTTP status codes and restrict header propagation.

---

## Reporting Vulnerabilities

If you discover a security vulnerability within `mcp-medic`, please report it privately rather than opening a public issue:

- **Preferred**: open a [private GitHub Security Advisory](https://github.com/shivam039/mcp-doctor/security/advisories/new) on this repository. This notifies the maintainer directly and keeps the report confidential until a fix ships.
- Do not include exploit details in a public issue, PR, or discussion before a fix is released.

We aim to acknowledge new reports within 48 hours.

## Before you report: what "executing MCP servers" means

`mcp-medic` validates a config by actually connecting to the servers it describes — this is expected, documented behavior, not a bug:
- For `stdio` transport, it **spawns the configured `command`** as a child process on your machine.
- For `sse`/`http` transport, it **makes real network requests** to the configured `url`, including any `headers` you've set (e.g. auth tokens).

Only run `mcp-medic` against configs you trust, the same way you'd only run `npm install` against a `package.json` you trust — a malicious `command`/`url` in a config file will execute/connect exactly as configured. This is inherent to what the tool does (verifying a real handshake), not something a flag can disable.
