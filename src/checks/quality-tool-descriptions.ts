import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * Complements `schema.missing-description` (which flags *absent* descriptions).
 * This check only looks at descriptions that ARE present, and flags ones that
 * exist but carry no real semantic information — the "someone typed
 * something to satisfy a linter" case. Deterministic heuristics only, no LLM;
 * conservative by design so legitimately short-but-meaningful descriptions
 * (e.g. "Returns the current time.") are never flagged.
 */
const PLACEHOLDER_DESCRIPTIONS = new Set([
  'todo',
  'test',
  'foo',
  'bar',
  'description',
  'tool',
  'tbd',
  'n/a',
  'na',
  'none',
  'placeholder',
  'xxx',
  'wip',
  'change me',
  'fill me in',
  'description here',
  'a tool',
  'this is a tool',
]);

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export const qualityToolDescriptionsCheck: Check = {
  id: 'quality.vague-description',
  description: 'Flags tool descriptions that are present but carry no useful semantic information (placeholder text, single words, or a copy of the tool name).',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const description = tool.description;
        if (typeof description !== 'string') continue; // absence is schema.missing-description's job
        const trimmed = description.trim();
        if (trimmed === '') continue; // ditto

        const normalized = trimmed.toLowerCase();

        if (PLACEHOLDER_DESCRIPTIONS.has(normalized)) {
          results.push({
            checkId: 'quality.vague-description',
            severity: 'warning',
            message: `Tool "${tool.name}" description ("${trimmed}") looks like placeholder text, not a real description.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            confidence: 'high',
            suggestedFix: {
              description: `Write a real description for "${tool.name}" explaining what it does and when an agent should call it.`,
            },
          });
          continue;
        }

        if (normalized === tool.name.trim().toLowerCase()) {
          results.push({
            checkId: 'quality.vague-description',
            severity: 'warning',
            message: `Tool "${tool.name}" description is just the tool's own name — it adds no information beyond what the name already says.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            confidence: 'high',
            suggestedFix: {
              description: `Describe what "${tool.name}" actually does, not just repeat its name.`,
            },
          });
          continue;
        }

        if (wordCount(trimmed) <= 1) {
          results.push({
            checkId: 'quality.vague-description',
            severity: 'warning',
            message: `Tool "${tool.name}" description ("${trimmed}") is a single word — too short to convey what the tool does.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            confidence: 'medium',
            suggestedFix: {
              description: `Expand "${tool.name}"'s description into at least a short sentence.`,
            },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.vague-description',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
