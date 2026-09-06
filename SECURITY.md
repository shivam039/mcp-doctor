# Security Policy & Threat Model

`mcp-medic` validates MCP server configurations by executing handshakes, parsing JSON-RPC responses, and inspecting JSON schemas. Because it spawns child processes and parses untrusted input, its internal attack surface is governed by strict defensive controls.

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

If you discover a security vulnerability within `mcp-medic`, please report it privately via GitHub Security Advisories or by emailing security contact before public disclosure. We will respond within 48 hours.
