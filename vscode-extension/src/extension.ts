import * as vscode from 'vscode';

/**
 * EXPERIMENTAL. This extension is not published to the VS Code Marketplace —
 * see vscode-extension/README.md for how to run it from source. It loads
 * mcp-medic's diagnostics library from the parent repo's build output
 * (`../../dist/extension/index.js`) rather than a published dependency,
 * since that library isn't published as its own package. Run `npm run
 * build` in the repo root before using this extension.
 */
type MedicLib = typeof import('../../dist/extension/index.js', { with: { 'resolution-mode': 'import' } });
type MinimalDiagnostic = Awaited<ReturnType<MedicLib['validateMCPDocument']>>[number];

let medicLibPromise: Promise<MedicLib> | undefined;

function loadMedicLib(): Promise<MedicLib> {
  if (!medicLibPromise) {
    medicLibPromise = import('../../dist/extension/index.js').catch((err) => {
      medicLibPromise = undefined;
      throw new Error(
        `mcp-medic (experimental): could not load ../../dist/extension/index.js — ` +
          `did you run "npm run build" in the repo root first? (${err instanceof Error ? err.message : String(err)})`,
      );
    });
  }
  return medicLibPromise;
}

function toVSCodeDiagnostic(d: MinimalDiagnostic): vscode.Diagnostic {
  const range = new vscode.Range(
    d.range.start.line,
    d.range.start.character,
    d.range.end.line,
    d.range.end.character,
  );
  const diagnostic = new vscode.Diagnostic(range, d.message, d.severity as vscode.DiagnosticSeverity);
  diagnostic.source = d.source;
  if (d.code) diagnostic.code = d.code;
  return diagnostic;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const collection = vscode.languages.createDiagnosticCollection('mcp-medic');
  context.subscriptions.push(collection);

  const outputChannel = vscode.window.createOutputChannel('mcp-medic');
  context.subscriptions.push(outputChannel);

  let debounceTimer: NodeJS.Timeout | undefined;

  const validate = async (document: vscode.TextDocument): Promise<void> => {
    let lib: MedicLib;
    try {
      lib = await loadMedicLib();
    } catch (err) {
      outputChannel.appendLine(err instanceof Error ? err.message : String(err));
      return;
    }

    if (!lib.isMCPConfigFile(document.fileName)) return;

    try {
      const diagnostics = await lib.validateMCPDocument(document, vscode as never);
      collection.set(document.uri, diagnostics.map(toVSCodeDiagnostic));
    } catch (err) {
      outputChannel.appendLine(`validation failed for ${document.fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const scheduleValidate = (document: vscode.TextDocument): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => void validate(document), 250);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(scheduleValidate),
    vscode.workspace.onDidChangeTextDocument((e) => scheduleValidate(e.document)),
    vscode.workspace.onDidSaveTextDocument(scheduleValidate),
    vscode.workspace.onDidCloseTextDocument((doc) => collection.delete(doc.uri)),
  );

  // Validate already-open documents on activation.
  for (const doc of vscode.workspace.textDocuments) {
    void validate(doc);
  }

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: '**/*{mcp,claude}*.json' },
      {
        async provideHover(document, position) {
          let lib: MedicLib;
          try {
            lib = await loadMedicLib();
          } catch {
            return undefined;
          }
          if (!lib.isMCPConfigFile(document.fileName)) return undefined;

          const existing = collection.get(document.uri) ?? [];
          const atLine = existing.filter((d) => d.range.start.line === position.line);
          if (atLine.length === 0) return undefined;

          const contents = atLine.map(
            (d) => new vscode.MarkdownString(`**mcp-medic** \`${d.code ?? ''}\`\n\n${d.message}`),
          );
          return new vscode.Hover(contents);
        },
      },
    ),
  );
}

export function deactivate(): void {}
