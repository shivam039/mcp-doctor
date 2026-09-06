# Handoff — codex

## Built

- Implemented `src/protocol/connect.ts` with the non-throwing `connect(config, timeoutMs)` contract.
- Added stdio JSON-RPC over newline-delimited stdin/stdout, including merged environment variables, initialize, initialized notification, tools/list, timeout handling, process-exit handling, and cleanup.
- Added HTTP POST transport and legacy SSE transport (SSE endpoint discovery followed by JSON-RPC POSTs), including configured headers.
- Added `src/protocol/index.ts` with `registerProtocol()` and re-exported `connect`.
- Added a reusable fake stdio server fixture and protocol tests covering success/tools, timeout, spawn failure, and malformed initialize responses.

## Validation

- `npm run typecheck` passed.
- `npm run build` passed.
- `npm test` passed (4 protocol tests).

## Decisions and limitations

- The implementation uses the MCP JSON-RPC wire shapes directly because this repository did not depend on `@modelcontextprotocol/sdk`; the initialize protocol version is `2024-11-05`, with client info `mcp-doctor`/`0.0.1`.
- Each request is bounded by the supplied `timeoutMs`; failures are classified as `handshake`, `capability-negotiation`, or `list-tools`, while process startup failures are classified as `spawn`.
- Processes are terminated after connection setup, since `MCPConnection` contains the negotiated data rather than a live session. See the matching decision log entry.
- SSE support discovers the POST endpoint from the initial `endpoint` event and then uses POST responses for request/response messages. Advanced streaming server responses and session-specific protocol extensions are not handled.
