import type { Check, MCPConnection, DiagnosticResult } from '../types.js';
import { getProtocolQualityRules, type ToolNameProtocolRules } from '../protocol/quality-rules.js';

/** Ecosystem recommendation, not a protocol constraint — see the module-level
 * note on `evaluateToolName` for the A/B/C distinction this check makes. */
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

export interface ToolNameFinding {
  severity: 'error' | 'warning';
  /** 'protocol' only when `rules` itself defines a hard constraint the name
   * violates; everything else is 'quality' (a recommendation, never a
   * protocol violation) — see module doc. */
  category: 'protocol' | 'quality';
  message: string;
  confidence?: 'low' | 'medium' | 'high';
  suggestedFixDescription: string;
}

/**
 * Pure evaluation of a single tool name, independent of the rest of the
 * connection (duplicate detection is connection-wide and stays in `run()`).
 * Exported so tests can inject a synthetic `ToolNameProtocolRules` (e.g. a
 * hypothetical future protocol version with a real length/pattern
 * constraint) without needing that version to actually exist yet — see
 * src/protocol/quality-rules.ts.
 *
 * The A/B/C distinction this check makes:
 *   A. PROTOCOL VIOLATION — only possible if `rules.maxLength`/`rules.pattern`
 *      is defined by the negotiated version AND the name violates it.
 *      Reported as category 'protocol', severity 'error'.
 *   B. QUALITY WARNING — technically spec-valid, but likely to hurt agent
 *      usability (too long by convention, odd characters, ambiguous name).
 *      Reported as category 'quality', severity 'warning'.
 *   C. Empty name is kept as a 'quality' error (not 'protocol') — no
 *      supported version's spec actually forbids an empty string, but a
 *      tool a client can't reference or distinguish is functionally
 *      broken, which still deserves error severity without mislabeling it
 *      a protocol violation.
 */
export function evaluateToolName(name: string, rules: ToolNameProtocolRules): ToolNameFinding[] {
  const findings: ToolNameFinding[] = [];

  if (name.trim() === '') {
    findings.push({
      severity: 'error',
      category: 'quality',
      message: 'Tool has an empty name — a client cannot reference or distinguish it.',
      suggestedFixDescription: 'Give the tool a non-empty, descriptive name.',
    });
    return findings; // nothing else meaningful to evaluate on an empty name
  }

  if (rules.maxLength !== undefined && name.length > rules.maxLength) {
    findings.push({
      severity: 'error',
      category: 'protocol',
      message: `Tool name "${name.slice(0, 40)}..." is ${name.length} characters, exceeding the negotiated protocol's maximum of ${rules.maxLength} — this is a protocol violation, not a style recommendation.`,
      suggestedFixDescription: `Shorten the tool name to ${rules.maxLength} characters or fewer to comply with the negotiated protocol version.`,
    });
  } else if (name.length > MAX_REASONABLE_NAME_LENGTH) {
    findings.push({
      severity: 'warning',
      category: 'quality',
      confidence: 'medium',
      message: `Tool name "${name.slice(0, 40)}..." name is ${name.length} characters, exceeding the recommended ${MAX_REASONABLE_NAME_LENGTH}.`,
      suggestedFixDescription: 'Shorten the tool name to something concise and memorable.',
    });
  }

  if (rules.pattern && !rules.pattern.test(name)) {
    findings.push({
      severity: 'error',
      category: 'protocol',
      message: `Tool name "${name}" does not match the naming pattern required by the negotiated protocol version — this is a protocol violation, not a style recommendation.`,
      suggestedFixDescription: 'Rename the tool to match the naming pattern required by the negotiated protocol version.',
    });
  } else if (hasInvalidCharacters(name)) {
    findings.push({
      severity: 'warning',
      category: 'quality',
      message: `Tool name "${JSON.stringify(name)}" contains whitespace/control characters that may break client tooling.`,
      suggestedFixDescription: 'Use only plain, printable characters in tool names (letters, digits, -, _).',
    });
  }

  if (name.length === 1 || PLACEHOLDER_NAMES.has(name.trim().toLowerCase())) {
    findings.push({
      severity: 'warning',
      category: 'quality',
      confidence: 'medium',
      message: `Tool name "${name}" is ambiguous or looks like a placeholder — it doesn't communicate what the tool does.`,
      suggestedFixDescription: 'Rename the tool to describe its action, e.g. "search_flights" instead of "tool".',
    });
  }

  return findings;
}

export const qualityToolNamesCheck: Check = {
  id: 'quality.tool-name',
  description: 'Flags empty, duplicate, overly long, or placeholder-looking tool names; distinguishes protocol-version-defined violations from quality recommendations.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      const rules = getProtocolQualityRules(connection.protocolVersion?.negotiated).toolName;
      const seen = new Map<string, number>();

      for (const tool of connection.tools) {
        const name = tool.name;
        seen.set(name, (seen.get(name) ?? 0) + 1);

        for (const finding of evaluateToolName(name, rules)) {
          results.push({
            checkId: 'quality.tool-name',
            severity: finding.severity,
            message: finding.message,
            serverName: connection.server.name,
            toolName: name,
            category: finding.category,
            ...(finding.confidence ? { confidence: finding.confidence } : {}),
            suggestedFix: { description: finding.suggestedFixDescription },
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
