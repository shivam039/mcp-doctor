# VS Code Marketplace Listing Assets

This document contains the official metadata, copy, and promotional assets for publishing the `mcp-doctor` extension on the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/).

---

## Listing Metadata

- **Extension ID**: `shivam039.mcp-doctor`
- **Display Name**: `MCP Doctor — Model Context Protocol Diagnostics`
- **Short Tagline (120 chars max)**:
  `Diagnose broken MCP server configs and schemas in real-time with inline squiggles, hover fixes, and zero setup.`
- **Categories**: `Linters`, `Programming Languages`, `Testing`
- **Tags & Keywords**: `mcp`, `model-context-protocol`, `claude`, `claude-desktop`, `llm`, `agents`, `json-schema`, `diagnostics`
- **Pricing**: `Free (Open Source / MIT)`

---

## Marketplace Description Copy

```markdown
# MCP Doctor for Visual Studio Code

Diagnose broken MCP (Model Context Protocol) server configs before they break your agent silently.

MCP Doctor provides real-time in-editor diagnostics and hover tooltips for `.mcp.json`, `claude_desktop_config.json`, and workspace MCP settings.

---

## ✨ Features at a Glance

- 🔴 **Instant Error Squiggles**: Flags missing required fields, unrecognized types, missing tool descriptions, and malformed schemas as you type.
- 💡 **Actionable Hover Tooltips**: Hover over any diagnostic to see the full root-cause explanation and suggested fix.
- ⚡ **Zero Setup**: Automatically detects `.mcp.json`, `mcp.json`, and Claude Desktop configuration files.
- 🛡️ **Zero Runtime Overhead**: Lightweight analysis powered by the frozen `mcp-doctor` core engine.

---

## 🔍 In-Editor Previews

### 1. Missing Required Property Definition
\`\`\`json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["server.js"]
    }
  }
}
// ⚠️ Warning on Line 4: Tool "get_forecast" lists required field "city", but it is not defined in "properties".
// Suggested fix: Define property "city" under inputSchema.properties, or remove "city" from inputSchema.required.
\`\`\`

---

## 🚀 Works Seamlessly with the CLI

Need to run diagnostics in CI or test standalone handshakes? Use the companion CLI:

\`\`\`bash
npx mcp-doctor check
\`\`\`

---

## 📜 License

MIT License. Open source and community driven.
```
