import type { Check, MCPConnection, DiagnosticResult, MCPToolDefinition } from '../types.js';
import { HEURISTIC_DISCLAIMER } from './security-shared.js';

interface RiskRule {
  category: 'shell-command' | 'filesystem-path' | 'network-request';
  namePattern: RegExp;
  hint: string;
}

// Ordered by specificity; matched against each top-level inputSchema property name.
const PROPERTY_RULES: RiskRule[] = [
  {
    category: 'shell-command',
    namePattern: /^(cmd|command|shell|bash|sh|exec|script|code)$/i,
    hint: 'accepts an unconstrained shell/command string',
  },
  {
    category: 'filesystem-path',
    namePattern: /^(path|filepath|file_path|dir|directory|folder)$/i,
    hint: 'accepts an unconstrained filesystem path',
  },
  {
    category: 'network-request',
    namePattern: /^(url|endpoint|host|target|uri)$/i,
    hint: 'accepts an unconstrained network destination',
  },
];

const DESCRIPTION_RULES: Array<{ category: RiskRule['category']; pattern: RegExp; hint: string }> = [
  {
    category: 'shell-command',
    pattern: /\b(execute|executes|run|runs)\s+(any|arbitrary)\s+(shell|command|code)\b|\barbitrary\s+shell\s+command/i,
    hint: 'description states it executes arbitrary shell commands or code',
  },
  {
    category: 'filesystem-path',
    pattern: /\bfull\s+filesystem\s+access\b|\baccess(?:es)?\s+(?:to\s+)?any\s+file\b|\b(?:read|write|delete)\s+any\s+file\b/i,
    hint: 'description states it can access any file on the filesystem',
  },
  {
    category: 'network-request',
    pattern: /\b(unrestricted|arbitrary)\s+(network|http|url)\s+(access|request)\b/i,
    hint: 'description states it allows unrestricted network access',
  },
];

function isUnconstrainedString(propDef: unknown): boolean {
  if (!propDef || typeof propDef !== 'object' || Array.isArray(propDef)) return false;
  const prop = propDef as Record<string, unknown>;
  if (prop.type !== 'string') return false;
  if (Array.isArray(prop.enum) && prop.enum.length > 0) return false;
  if (typeof prop.pattern === 'string' && prop.pattern.length > 0) return false;
  return true;
}

function checkTool(tool: MCPToolDefinition, serverName: string): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (typeof tool.description === 'string') {
    for (const rule of DESCRIPTION_RULES) {
      if (rule.pattern.test(tool.description)) {
        results.push({
          checkId: 'security.overbroad-permissions',
          severity: 'warning',
          message: `Tool "${tool.name}" ${rule.hint} — review before granting it broad access. (${HEURISTIC_DISCLAIMER})`,
          serverName,
          toolName: tool.name,
          details: { category: rule.category, source: 'description' },
          suggestedFix: {
            description:
              'Confirm this scope is intentional after reviewing the server\'s source; prefer a server that exposes narrower, purpose-built tools instead of one broad tool.',
          },
        });
      }
    }
  }

  const schema = tool.inputSchema;
  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    const schemaObj = schema as Record<string, unknown>;
    const properties =
      schemaObj.properties && typeof schemaObj.properties === 'object' && !Array.isArray(schemaObj.properties)
        ? (schemaObj.properties as Record<string, unknown>)
        : {};

    for (const [propName, propDef] of Object.entries(properties)) {
      if (!isUnconstrainedString(propDef)) continue;
      const rule = PROPERTY_RULES.find((r) => r.namePattern.test(propName));
      if (!rule) continue;

      results.push({
        checkId: 'security.overbroad-permissions',
        severity: 'warning',
        message: `Tool "${tool.name}" parameter "${propName}" ${rule.hint} (no enum or pattern constraining it). (${HEURISTIC_DISCLAIMER})`,
        serverName,
        toolName: tool.name,
        details: { category: rule.category, source: 'schema', property: propName },
        suggestedFix: {
          description: `Constrain "${propName}" with an enum of allowed values or a validating pattern, or split it into narrower parameters, if you control this server.`,
        },
      });
    }
  }

  return results;
}

export const securityOverbroadPermissionsCheck: Check = {
  id: 'security.overbroad-permissions',
  description: `Flags tools whose description or schema implies unscoped filesystem/shell/network access (${HEURISTIC_DISCLAIMER}).`,
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) return results;
      for (const tool of connection.tools) {
        results.push(...checkTool(tool, connection.server.name));
      }
    } catch (err) {
      results.push({
        checkId: 'security.overbroad-permissions',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
