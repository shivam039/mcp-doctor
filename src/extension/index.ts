import { loadConfig } from '../config-loader.js';
import { runChecks } from '../orchestrator.js';
import { allChecks } from '../checks/index.js';
import type { DiagnosticResult, Severity } from '../types.js';

export interface MinimalPosition {
  line: number;
  character: number;
}

export interface MinimalRange {
  start: MinimalPosition;
  end: MinimalPosition;
}

export interface MinimalDiagnostic {
  range: MinimalRange;
  message: string;
  severity: number; // 0: Error, 1: Warning, 2: Information, 3: Hint
  source: string;
  code?: string;
  suggestedFix?: string;
}

export interface MinimalTextDocument {
  uri: { toString(): string; fsPath: string };
  fileName: string;
  getText(): string;
  languageId: string;
}

export interface MinimalDiagnosticCollection {
  set(uri: unknown, diagnostics: MinimalDiagnostic[]): void;
  delete(uri: unknown): void;
  clear(): void;
  dispose(): void;
}

export interface MinimalVSCodeAPI {
  DiagnosticSeverity: {
    Error: number;
    Warning: number;
    Information: number;
    Hint: number;
  };
  Range: new (
    startLine: number,
    startChar: number,
    endLine: number,
    endChar: number,
  ) => MinimalRange;
  Position: new (line: number, character: number) => MinimalPosition;
  languages: {
    createDiagnosticCollection(name: string): MinimalDiagnosticCollection;
    registerHoverProvider(
      selector: unknown,
      provider: {
        provideHover(
          document: MinimalTextDocument,
          position: MinimalPosition,
        ): unknown;
      },
    ): { dispose(): void };
  };
  workspace: {
    onDidChangeTextDocument(
      listener: (e: { document: MinimalTextDocument }) => void,
    ): { dispose(): void };
    onDidOpenTextDocument(
      listener: (document: MinimalTextDocument) => void,
    ): { dispose(): void };
    onDidSaveTextDocument(
      listener: (document: MinimalTextDocument) => void,
    ): { dispose(): void };
  };
}

export function isMCPConfigFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return (
    lower.endsWith('.mcp.json') ||
    lower.endsWith('mcp.json') ||
    lower.endsWith('claude_desktop_config.json') ||
    lower.includes('.vscode/mcp.json') ||
    lower.includes('.cursor/mcp.json')
  );
}

function findLineForScope(
  text: string,
  serverName: string,
  toolName?: string,
): number {
  const lines = text.split('\n');
  if (toolName) {
    const toolIndex = lines.findIndex((l) => l.includes(`"${toolName}"`));
    if (toolIndex >= 0) return toolIndex;
  }
  const serverIndex = lines.findIndex((l) => l.includes(`"${serverName}"`));
  if (serverIndex >= 0) return serverIndex;
  return 0;
}

export function mapSeverity(
  severity: Severity,
  vscode: MinimalVSCodeAPI,
): number {
  switch (severity) {
    case 'error':
      return vscode.DiagnosticSeverity.Error;
    case 'warning':
      return vscode.DiagnosticSeverity.Warning;
    case 'info':
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

/**
 * Validates a document content using mcp-doctor core and returns VS Code diagnostics.
 */
export async function validateMCPDocument(
  document: MinimalTextDocument,
  vscode: MinimalVSCodeAPI,
): Promise<MinimalDiagnostic[]> {
  if (!isMCPConfigFile(document.fileName)) {
    return [];
  }

  const rawText = document.getText();
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch (parseErr) {
    return [
      {
        range: new vscode.Range(0, 0, 0, 1),
        message: `JSON syntax error in MCP config: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        severity: vscode.DiagnosticSeverity.Error,
        source: 'mcp-doctor',
        code: 'config.parse-error',
      },
    ];
  }

  const { config, errors } = loadConfig(rawJson, document.fileName);
  if (errors.length > 0 || !config) {
    return errors.map((errMessage) => ({
      range: new vscode.Range(0, 0, 0, 1),
      message: errMessage,
      severity: vscode.DiagnosticSeverity.Error,
      source: 'mcp-doctor',
      code: 'config.invalid-schema',
    }));
  }

  const report = await runChecks(config, { checks: allChecks, timeoutMs: 3000 });
  const diagnostics: MinimalDiagnostic[] = [];

  for (const d of report.diagnostics) {
    const line = findLineForScope(rawText, d.serverName, d.toolName);
    const lineContent = rawText.split('\n')[line] || '';
    const endChar = Math.max(1, lineContent.length);

    let message = d.message;
    if (d.suggestedFix?.description) {
      message += `\n\nSuggested fix: ${d.suggestedFix.description}`;
    }

    diagnostics.push({
      range: new vscode.Range(line, 0, line, endChar),
      message,
      severity: mapSeverity(d.severity, vscode),
      source: 'mcp-doctor',
      code: d.checkId,
      suggestedFix: d.suggestedFix?.description,
    });
  }

  return diagnostics;
}

/**
 * Activates the lightweight MCP Doctor extension.
 */
export function activateExtension(
  context: { subscriptions: { dispose(): void }[] },
  vscode: MinimalVSCodeAPI,
): { diagnosticCollection: MinimalDiagnosticCollection } {
  const collection = vscode.languages.createDiagnosticCollection('mcp-doctor');
  context.subscriptions.push(collection);

  let debounceTimer: NodeJS.Timeout | undefined;

  const triggerValidation = (document: MinimalTextDocument): void => {
    if (!isMCPConfigFile(document.fileName)) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const diagnostics = await validateMCPDocument(document, vscode);
      collection.set(document.uri, diagnostics);
    }, 250);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => triggerValidation(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => triggerValidation(e.document)),
    vscode.workspace.onDidSaveTextDocument((doc) => triggerValidation(doc)),
  );

  // Register hover tooltip provider showing full diagnostic message + suggested fix
  const hoverProvider = vscode.languages.registerHoverProvider(
    { pattern: '**/*{mcp,claude}*.json' },
    {
      provideHover(document, position) {
        if (!isMCPConfigFile(document.fileName)) return undefined;
        const line = position.line;
        const lines = document.getText().split('\n');
        const currentLineText = lines[line] || '';

        return {
          contents: [
            `**mcp-doctor diagnostic** (Line ${line + 1})`,
            `Inspecting: \`${currentLineText.trim()}\``,
          ],
        };
      },
    },
  );
  context.subscriptions.push(hoverProvider);

  return { diagnosticCollection: collection };
}
