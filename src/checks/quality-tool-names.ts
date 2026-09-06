import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/** MCP's `Tool.name` (from `BaseMetadata`) has no documented pattern or
 * length constraint in the spec — so none of these are "protocol
 * violations" in the strict sense. Empty and duplicate names are still
 * treated as errors here because a tool a client cannot reference or
 * distinguish is functionally broken, not merely unstylish; everything
 * else is a warning. */
const MAX_REASONABLE_NAME_LENGTH = 128;

/** Conservative, curated list — exact (case-insensitive) matches only, to
 * avoid false-positiving on legitimately short/plain real tool names. */
const PLACEHOLDER_NAMES = new Set([
  'tool',
  'test',
  'temp',
  'foo',
  'bar',
  'function',
  'func',
  'untitled',
  'new_tool',
  'newtool',
  'example',
  'sample',
  'todo',
  'tbd',
  'xxx',
]);

function hasInvalidCharacters(name: string): boolean {
  // Whitespace (beyond a single space) and control characters break most
  // client UIs and tool-name-as-identifier assumptions, even though the
  // spec doesn't forbid them outright.
  // eslint-disable-next-line no-control-regex
  return /[\t\n\r\x00-\x08\x0b\x0c\x0e-\x1f]/.test(name);
}

export const qualityToolNamesCheck: Check = {
  id: 'quality.tool-name',
  description: 'Flags empty, duplicate, overly long, or placeholder-looking tool names.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      const seen = new Map<string, number>();
      for (const tool of connection.tools) {
        const name = tool.name;
        seen.set(name, (seen.get(name) ?? 0) + 1);

        if (name.trim() === '') {
          results.push({
            checkId: 'quality.tool-name',
            severity: 'error',
            message: 'Tool has an empty name — a client cannot reference or distinguish it.',
            serverName: connection.server.name,
            toolName: name,
            category: 'quality',
            suggestedFix: { description: 'Give the tool a non-empty, descriptive name.' },
          });
          continue;
        }

        if (name.length > MAX_REASONABLE_NAME_LENGTH) {
          results.push({
            checkId: 'quality.tool-name',
            severity: 'warning',
            message: `Tool "${name.slice(0, 40)}..." name is ${name.length} characters, exceeding the recommended ${MAX_REASONABLE_NAME_LENGTH}.`,
            serverName: connection.server.name,
            toolName: name,
            category: 'quality',
            confidence: 'medium',
            suggestedFix: { description: 'Shorten the tool name to something concise and memorable.' },
          });
        }

        if (hasInvalidCharacters(name)) {
          results.push({
            checkId: 'quality.tool-name',
            severity: 'warning',
            message: `Tool name "${JSON.stringify(name)}" contains whitespace/control characters that may break client tooling.`,
            serverName: connection.server.name,
            toolName: name,
            category: 'quality',
            suggestedFix: { description: 'Use only plain, printable characters in tool names (letters, digits, -, _).' },
          });
        }

        if (name.length === 1 || PLACEHOLDER_NAMES.has(name.trim().toLowerCase())) {
          results.push({
            checkId: 'quality.tool-name',
            severity: 'warning',
            message: `Tool name "${name}" is ambiguous or looks like a placeholder — it doesn't communicate what the tool does.`,
            serverName: connection.server.name,
            toolName: name,
            category: 'quality',
            confidence: 'medium',
            suggestedFix: { description: 'Rename the tool to describe its action, e.g. "search_flights" instead of "tool".' },
          });
        }
      }

      for (const [name, count] of seen) {
        if (count > 1) {
          results.push({
            checkId: 'quality.tool-name',
            severity: 'error',
            message: `Tool name "${name}" is declared ${count} times — a client cannot reliably invoke a specific one by name.`,
            serverName: connection.server.name,
            toolName: name,
            category: 'quality',
            details: { duplicateCount: count },
            suggestedFix: { description: `Rename duplicate "${name}" tools so every tool name is unique.` },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.tool-name',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
