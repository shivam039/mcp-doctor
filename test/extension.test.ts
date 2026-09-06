import { describe, it, expect } from 'vitest';
import {
  isMCPConfigFile,
  validateMCPDocument,
  activateExtension,
  type MinimalVSCodeAPI,
  type MinimalTextDocument,
  type MinimalDiagnostic,
} from '../src/extension/index.js';

describe('VS Code Extension', () => {
  const mockVSCode: MinimalVSCodeAPI = {
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    Range: class {
      constructor(
        public startLine: number,
        public startChar: number,
        public endLine: number,
        public endChar: number,
      ) {}
      get start() {
        return { line: this.startLine, character: this.startChar };
      }
      get end() {
        return { line: this.endLine, character: this.endChar };
      }
    },
    Position: class {
      constructor(public line: number, public character: number) {}
    },
    languages: {
      createDiagnosticCollection(_name: string) {
        const map = new Map<unknown, MinimalDiagnostic[]>();
        return {
          set(uri: unknown, diags: MinimalDiagnostic[]) {
            map.set(uri, diags);
          },
          delete(uri: unknown) {
            map.delete(uri);
          },
          clear() {
            map.clear();
          },
          dispose() {},
        };
      },
      registerHoverProvider(_selector: unknown, _provider: unknown) {
        return { dispose() {} };
      },
    },
    workspace: {
      onDidChangeTextDocument(_listener: unknown) {
        return { dispose() {} };
      },
      onDidOpenTextDocument(_listener: unknown) {
        return { dispose() {} };
      },
      onDidSaveTextDocument(_listener: unknown) {
        return { dispose() {} };
      },
    },
  };

  it('identifies MCP config files accurately', () => {
    expect(isMCPConfigFile('/path/to/.mcp.json')).toBe(true);
    expect(isMCPConfigFile('/path/to/mcp.json')).toBe(true);
    expect(isMCPConfigFile('claude_desktop_config.json')).toBe(true);
    expect(isMCPConfigFile('/project/.vscode/mcp.json')).toBe(true);
    expect(isMCPConfigFile('package.json')).toBe(false);
    expect(isMCPConfigFile('server.ts')).toBe(false);
  });

  it('reports JSON syntax errors as diagnostics', async () => {
    const brokenDoc: MinimalTextDocument = {
      uri: { toString: () => 'file:///.mcp.json', fsPath: '/.mcp.json' },
      fileName: '.mcp.json',
      languageId: 'json',
      getText: () => '{\n  "badJson": \n}',
    };

    const diagnostics = await validateMCPDocument(brokenDoc, mockVSCode);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].severity).toBe(mockVSCode.DiagnosticSeverity.Error);
    expect(diagnostics[0].code).toBe('config.parse-error');
  });

  it('activates extension and registers event listeners', () => {
    const context = { subscriptions: [] as { dispose(): void }[] };
    const { diagnosticCollection } = activateExtension(context, mockVSCode);
    expect(diagnosticCollection).toBeDefined();
    expect(context.subscriptions.length).toBeGreaterThanOrEqual(2);
  });
});
