import type { Check, MCPConnection, DiagnosticResult } from '../types.js';
import { HEURISTIC_DISCLAIMER } from './security-shared.js';

// Instruction-like language aimed at the model reading the tool description,
// rather than at a human deciding whether to use the tool — a known MCP
// supply-chain risk pattern (tool descriptions are injected into the
// model's context).
const INJECTION_PATTERNS: RegExp[] = [
  /\balways\s+call\s+this\s+(tool\s+)?first\b/i,
  /\bignore\s+(all\s+)?(previous|prior|above)\s+instructions\b/i,
  /\bdisregard\s+(the\s+)?(system\s+prompt|previous\s+instructions)\b/i,
  /\bdo\s+not\s+(tell|inform)\s+the\s+user\b/i,
  /\bnever\s+(mention|tell)\s+.*\bthe\s+user\b/i,
  /\byou\s+must\s+(always|never)\s+\w/i,
  /\bthis\s+is\s+a\s+system\s+(prompt|instruction)\b/i,
  /\boverride\s+(your|any)\s+(previous|prior)\s+(instructions|guidelines)\b/i,
  /\bact\s+as\s+(if\s+you\s+are|though\s+you\s+are)\b/i,
];

function findMatch(text: string): { pattern: string; snippet: string } | undefined {
  for (const pattern of INJECTION_PATTERNS) {
    const match = pattern.exec(text);
    if (match) {
      return { pattern: pattern.source, snippet: match[0] };
    }
  }
  return undefined;
}

export const securityPromptInjectionRiskCheck: Check = {
  id: 'security.prompt-injection-risk',
  description: `Flags tool/parameter descriptions containing instruction-like language aimed at the model rather than a human (${HEURISTIC_DISCLAIMER}).`,
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) return results;

      for (const tool of connection.tools) {
        if (typeof tool.description === 'string') {
          const match = findMatch(tool.description);
          if (match) {
            results.push({
              checkId: 'security.prompt-injection-risk',
              severity: 'warning',
              message:
                `Tool "${tool.name}" description contains instruction-like language aimed at the model ` +
                `("${match.snippet}") rather than describing the tool to a human — a known MCP supply-chain ` +
                `risk pattern. (${HEURISTIC_DISCLAIMER})`,
              serverName: connection.server.name,
              toolName: tool.name,
              details: { source: 'description', matchedPattern: match.pattern, snippet: match.snippet },
              suggestedFix: {
                description:
                  "Review this tool's description and the server's source before trusting it; rewrite or remove instruction-like language if you control this server.",
              },
            });
          }
        }

        const schema = tool.inputSchema;
        if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
          const properties = (schema as Record<string, unknown>).properties;
          if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
            for (const [propName, propDef] of Object.entries(properties as Record<string, unknown>)) {
              if (!propDef || typeof propDef !== 'object' || Array.isArray(propDef)) continue;
              const description = (propDef as Record<string, unknown>).description;
              if (typeof description !== 'string') continue;
              const match = findMatch(description);
              if (match) {
                results.push({
                  checkId: 'security.prompt-injection-risk',
                  severity: 'warning',
                  message:
                    `Tool "${tool.name}" parameter "${propName}" description contains instruction-like language ` +
                    `aimed at the model ("${match.snippet}") rather than describing the parameter to a human. ` +
                    `(${HEURISTIC_DISCLAIMER})`,
                  serverName: connection.server.name,
                  toolName: tool.name,
                  details: { source: 'parameter-description', property: propName, matchedPattern: match.pattern, snippet: match.snippet },
                  suggestedFix: {
                    description:
                      "Review this tool's description and the server's source before trusting it; rewrite or remove instruction-like language if you control this server.",
                  },
                });
              }
            }
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'security.prompt-injection-risk',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
