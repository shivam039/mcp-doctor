# MCP Troubleshooting Cookbook

A search-indexed troubleshooting guide for resolving common Model Context Protocol (MCP) server configuration errors and handshake failures.

---

## 1. "MCP handshake timed out after 5000ms"

### Symptom
When connecting to an MCP server via stdio, SSE, or HTTP, initialization fails with:
`[TIMEOUT] server-name (stdio) — initialize handshake timed out after 5000ms`

### Root Cause
1. **Unbuffered Stdio Output**: The server process is writing startup logs or banners to `stdout` instead of `stderr`, corrupting the JSON-RPC stream.
2. **Missing Executable / Slow Launch**: The server binary (e.g. `npx`, `uvx`, `python`) is downloading heavy dependencies synchronously before responding to the `initialize` message.

### How to Fix
1. Ensure all diagnostic logging inside your server is directed strictly to `stderr` (`console.error` in Node.js, `sys.stderr.write` in Python).
2. Increase handshake timeout using the CLI flag:
   ```bash
   npx mcp-medic check --timeout 15000 --verbose
   ```
3. Run with `--verbose` to inspect raw JSON-RPC traffic and identify whether the process responded:
   ```bash
   npx mcp-medic check --verbose
   ```

---

## 2. "Tool lists required field 'X', but it is not defined in 'properties'"

### Symptom
`[error] server-name/tool-name — Tool "X" lists required field "Y", but it is not defined in "properties" (schema.missing-required)`

### Root Cause
The tool's `inputSchema` declares `"required": ["Y"]`, but `"properties"` either omits `"Y"` or defines `"Y"` under a different key name. Calling LLMs cannot construct valid arguments for undefined properties.

### How to Fix
Add the property definition to `inputSchema.properties` with a valid `type` and `description`:
```json
{
  "type": "object",
  "properties": {
    "Y": {
      "type": "string",
      "description": "Explanation of parameter Y"
    }
  },
  "required": ["Y"]
}
```

---

## 3. "MCP SSE stream ended before endpoint event"

### Symptom
`[FAILED] remote-server (sse) — handshake: MCP SSE stream ended before endpoint event`

### Root Cause
The remote SSE endpoint closed the HTTP connection before sending the mandatory `endpoint` event containing the POST target URL for JSON-RPC messages.

### How to Fix
1. Verify the server SSE implementation emits the initial `endpoint` URI event:
   ```
   event: endpoint
   data: /messages?sessionId=...
   ```
2. If the server requires dynamic authentication, configure `tokenRefreshUrl` in your config.

---

## 4. "Property 'X' has invalid or unrecognized type 'Y'"

### Symptom
`[warning] server-name/tool-name — Property "param" in tool "my_tool" has invalid or unrecognized type "int_custom"`

### Root Cause
JSON Schema standard allows only: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null`. Non-standard types confuse LLM function-calling parsers.

### How to Fix
Change the type to a recognized JSON schema type, e.g. `"type": "integer"`.
