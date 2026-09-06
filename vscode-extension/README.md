# mcp-medic VS Code extension — EXPERIMENTAL

**This is not published on the VS Code Marketplace.** It's a minimal, working extension you can run from source to try in-editor diagnostics before it's polished enough to ship. Expect rough edges.

It wires `src/extension/index.ts` from the parent `mcp-medic` package (schema + security checks, run against `.mcp.json` / `mcp.json` / `claude_desktop_config.json` files) into real VS Code diagnostics (squiggles) and hover tooltips.

## Run it from source (Extension Development Host)

From the **repo root** (not this folder):

```bash
npm install
npm run build       # produces dist/, which this extension loads at runtime
```

Then, in this folder:

```bash
cd vscode-extension
npm install
npm run compile
```

Open the **`vscode-extension/`** folder itself in VS Code (not the repo root), then press **F5** (or Run → Start Debugging). This launches an "Extension Development Host" window with the extension active. Open a `.mcp.json`, `mcp.json`, or `claude_desktop_config.json` file in that window — errors and warnings from mcp-medic's checks appear as squiggles, and hovering over a flagged line shows the full diagnostic message.

## Package it as a `.vsix` to install locally

```bash
cd vscode-extension
npm install
npm run compile
npm run package        # produces mcp-medic-vscode-0.0.1.vsix
code --install-extension mcp-medic-vscode-0.0.1.vsix
```

## Known limitations of this experimental build

- Only re-checks a file 250ms after you stop typing/save it — no incremental/streaming updates.
- Line numbers are found by a simple text search for the server/tool name, not real JSON AST position tracking — on files with duplicate names, diagnostics can land on the wrong occurrence.
- No real network/protocol handshake is performed from the editor for `sse`/`http` servers within the timeout used here (3s) — a slow or unreachable server will just show a connection-failure diagnostic, same as the CLI.
- No settings/configuration UI (timeout, which checks run, etc.) — it always runs every built-in check.

If you hit something confusing, please open an issue (see the repo's [CONTRIBUTING.md](../CONTRIBUTING.md)) rather than assuming it's expected — the goal is to eventually publish a properly maintained version of this extension.
