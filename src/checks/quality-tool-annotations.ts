import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * MCP `ToolAnnotations` are optional client *hints* the spec explicitly
 * does not treat as authoritative — a server can declare `readOnlyHint:
 * true` and still do something destructive. This check only flags
 * internally self-contradictory combinations of hints (the server's own
 * declaration doesn't add up), never infers "this tool is dangerous" from
 * an annotation, and never treats annotations as a security guarantee.
 */
export const qualityToolAnnotationsCheck: Check = {
  id: 'quality.tool-annotations',
  description: 'Flags tool annotation hints that are internally contradictory (e.g. both read-only and destructive).',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const annotations = tool.annotations;
        if (!annotations || typeof annotations !== 'object') continue;

        if (annotations.readOnlyHint === true && annotations.destructiveHint === true) {
          results.push({
            checkId: 'quality.tool-annotations',
            severity: 'warning',
            message: `Tool "${tool.name}" declares both readOnlyHint and destructiveHint as true — these are contradictory (a read-only tool cannot also be destructive).`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            confidence: 'high',
            suggestedFix: {
              description: `Correct "${tool.name}"'s annotations so readOnlyHint and destructiveHint aren't both true.`,
            },
          });
        }

        if (annotations.readOnlyHint === true && annotations.idempotentHint === false) {
          // Not a hard contradiction (idempotentHint's meaning is about repeat
          // calls with the same args), but worth a low-confidence note: a
          // read-only operation is idempotent by construction in practice.
          results.push({
            checkId: 'quality.tool-annotations',
            severity: 'info',
            message: `Tool "${tool.name}" declares readOnlyHint: true but idempotentHint: false — read-only operations are usually idempotent; double-check this is intentional.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            confidence: 'low',
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.tool-annotations',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
