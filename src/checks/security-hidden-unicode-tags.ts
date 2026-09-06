import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * Unicode "Tags" block (U+E0000–U+E007F): originally drafted for invisible
 * language tagging, deprecated, and now documented in the wild as a way to
 * hide prompt-injection payloads inside MCP tool/resource/prompt metadata —
 * the characters render as nothing in virtually every UI, but many LLM
 * tokenizers still see and act on them. See e.g. "Unicode TAG-Block
 * Concealment of Tool-Metadata Payloads in the Model Context Protocol"
 * (arXiv:2607.05744).
 *
 * Unlike security.prompt-injection-risk's keyword matching (which only
 * catches instructions written in plain, visible text), this check flags
 * the mere PRESENCE of any codepoint in this block — there is no legitimate
 * reason for it to appear in tool/resource/prompt metadata a human is
 * meant to review, so this is treated as an error, not a heuristic
 * judgment call.
 */
const HIDDEN_TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/u;

function checkField(
  text: string | undefined,
  fieldLabel: string,
): { snippet: string } | undefined {
  if (typeof text !== 'string' || !HIDDEN_TAG_CHARACTERS.test(text)) return undefined;
  const visible = text.replace(HIDDEN_TAG_CHARACTERS, '');
  return { snippet: `${fieldLabel}: "${visible}" (+ ${[...text].filter((c) => HIDDEN_TAG_CHARACTERS.test(c)).length} hidden tag character(s))` };
}

export const securityHiddenUnicodeTagsCheck: Check = {
  id: 'security.hidden-unicode-tags',
  description:
    'Flags tool/resource/prompt names or descriptions containing invisible Unicode "Tag" characters (U+E0000-U+E007F) — a known technique for concealing prompt-injection payloads from human review.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      for (const tool of connection.tools ?? []) {
        for (const [field, value] of [
          ['name', tool.name],
          ['title', tool.title],
          ['description', tool.description],
        ] as const) {
          const found = checkField(value, field);
          if (found) {
            results.push({
              checkId: 'security.hidden-unicode-tags',
              severity: 'error',
              message: `Tool "${tool.name}" ${field} contains hidden Unicode tag characters — likely a concealed prompt-injection payload. ${found.snippet}`,
              serverName: connection.server.name,
              toolName: tool.name,
              category: 'security',
              confidence: 'high',
              details: { field },
              suggestedFix: { description: `Remove the hidden Unicode tag characters from this tool's ${field}, or treat this server as untrusted.` },
            });
          }
        }
      }

      for (const resource of connection.resources ?? []) {
        for (const [field, value] of [
          ['name', resource.name],
          ['title', resource.title],
          ['description', resource.description],
        ] as const) {
          const found = checkField(value, field);
          if (found) {
            results.push({
              checkId: 'security.hidden-unicode-tags',
              severity: 'error',
              message: `Resource "${resource.uri}" ${field} contains hidden Unicode tag characters — likely a concealed prompt-injection payload. ${found.snippet}`,
              serverName: connection.server.name,
              category: 'security',
              confidence: 'high',
              details: { field, uri: resource.uri },
              suggestedFix: { description: `Remove the hidden Unicode tag characters from this resource's ${field}, or treat this server as untrusted.` },
            });
          }
        }
      }

      for (const prompt of connection.prompts ?? []) {
        for (const [field, value] of [
          ['name', prompt.name],
          ['title', prompt.title],
          ['description', prompt.description],
        ] as const) {
          const found = checkField(value, field);
          if (found) {
            results.push({
              checkId: 'security.hidden-unicode-tags',
              severity: 'error',
              message: `Prompt "${prompt.name}" ${field} contains hidden Unicode tag characters — likely a concealed prompt-injection payload. ${found.snippet}`,
              serverName: connection.server.name,
              category: 'security',
              confidence: 'high',
              details: { field },
              suggestedFix: { description: `Remove the hidden Unicode tag characters from this prompt's ${field}, or treat this server as untrusted.` },
            });
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'security.hidden-unicode-tags',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'security',
      });
    }
    return results;
  },
};
