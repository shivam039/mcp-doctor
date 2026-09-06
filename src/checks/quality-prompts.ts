import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/** Same conservative placeholder list used for tool descriptions. */
const PLACEHOLDER_DESCRIPTIONS = new Set([
  'todo',
  'test',
  'foo',
  'bar',
  'description',
  'prompt',
  'tbd',
  'n/a',
  'na',
  'none',
  'placeholder',
  'xxx',
]);

/**
 * Inspects only what `prompts/list` already returned (see
 * MCPConnection.prompts, populated passively in src/protocol/connect.ts).
 * Never calls `prompts/get` — that would retrieve/render the prompt, out
 * of scope for a passive `check`.
 */
export const qualityPromptsCheck: Check = {
  id: 'quality.prompt',
  description: 'Flags duplicate/empty prompt names, placeholder descriptions, and malformed argument definitions in prompts/list results.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      const prompts = connection.prompts;
      if (!prompts || !Array.isArray(prompts)) {
        return results;
      }

      const byName = new Map<string, number>();
      for (const prompt of prompts) {
        const name = prompt.name;

        if (typeof name !== 'string' || name.trim() === '') {
          results.push({
            checkId: 'quality.prompt',
            severity: 'error',
            message: 'Prompt has an empty or invalid "name" — the MCP spec requires prompts to have a name.',
            serverName: connection.server.name,
            category: 'schema',
            details: { prompt },
          });
          continue;
        }

        byName.set(name, (byName.get(name) ?? 0) + 1);

        const description = prompt.description?.trim();
        if (!description) {
          results.push({
            checkId: 'quality.prompt',
            severity: 'info',
            message: `Prompt "${name}" has no description, making it harder for an agent to know when to use it.`,
            serverName: connection.server.name,
            category: 'quality',
          });
        } else if (PLACEHOLDER_DESCRIPTIONS.has(description.toLowerCase())) {
          results.push({
            checkId: 'quality.prompt',
            severity: 'warning',
            message: `Prompt "${name}" description ("${description}") looks like placeholder text.`,
            serverName: connection.server.name,
            category: 'quality',
            confidence: 'high',
          });
        }

        if (Array.isArray(prompt.arguments)) {
          const argNames = new Map<string, number>();
          for (const arg of prompt.arguments) {
            if (!arg.name || arg.name.trim() === '') {
              results.push({
                checkId: 'quality.prompt',
                severity: 'error',
                message: `Prompt "${name}" has an argument with an empty or missing "name" — required by the MCP spec's PromptArgument type.`,
                serverName: connection.server.name,
                category: 'schema',
                details: { promptName: name, argument: arg },
              });
              continue;
            }
            argNames.set(arg.name, (argNames.get(arg.name) ?? 0) + 1);
          }
          for (const [argName, count] of argNames) {
            if (count > 1) {
              results.push({
                checkId: 'quality.prompt',
                severity: 'error',
                message: `Prompt "${name}" declares argument "${argName}" ${count} times.`,
                serverName: connection.server.name,
                category: 'schema',
                details: { promptName: name, argumentName: argName, duplicateCount: count },
              });
            }
          }
        }
      }

      for (const [name, count] of byName) {
        if (count > 1) {
          results.push({
            checkId: 'quality.prompt',
            severity: 'error',
            message: `Prompt name "${name}" is declared ${count} times — a client cannot reliably invoke a specific one by name.`,
            serverName: connection.server.name,
            category: 'schema',
            details: { duplicateCount: count },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.prompt',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
