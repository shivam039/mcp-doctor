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

## Blockers to Marketplace Publish

This extension is currently an experimental preview for testing from source. The following blockers must be resolved before publishing to the Visual Studio Marketplace:

1. **Self-Contained Diagnostics**: Currently, `src/extension.ts` dynamically resolves the parent monorepo's build output (`../../dist/extension/index.js`). The packaged extension must be self-contained and not depend on parent directory paths.
2. **Marketplace Metadata & Assets**: Requires a registered publisher ID, 128x128 icon, verified `engines.vscode` compatibility range, and marketplace documentation.
3. **Standalone Installation**: A packaged `.vsix` must install and run cleanly on a clean machine without the monorepo repository present.

## Path to Marketplace Checklist

When preparing the extension for official release:

- [ ] **Bundle Diagnostics**: Bundle the diagnostics library via `esbuild`/`tsup`, depend on the published `mcp-medic` package, or vendor the diagnostics module into `vscode-extension/src/`.
- [ ] **Configure Metadata**: Update `vscode-extension/package.json` with production `publisher`, `icon`, `repository`, and `categories`.
- [ ] **Package VSIX**: Run `npx @vscode/vsce package` to generate the standalone `.vsix`.
- [ ] **Clean-Machine Test**: Verify local installation (`code --install-extension <file>.vsix`) in an isolated environment without the repository source.
- [ ] **Publish**: Execute `npx @vscode/vsce publish` with a Visual Studio Marketplace publisher token.

If you hit something confusing, please open an issue (see the repo's [CONTRIBUTING.md](../CONTRIBUTING.md)) rather than assuming it's expected — the goal is to eventually publish a properly maintained version of this extension.
