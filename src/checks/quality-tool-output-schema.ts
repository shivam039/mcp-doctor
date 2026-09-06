import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * `outputSchema` is optional per the MCP spec (2025-06-18+) — this check
 * never flags its absence. It only inspects an `outputSchema` that IS
 * present, and only for basic structural validity (same shape rules as
 * `inputSchema`: must be an object, should declare "object" as its type).
 * Malformed output schemas are a quality warning, not a protocol error,
 * since a client can simply ignore an outputSchema it can't parse.
 */
export const qualityToolOutputSchemaCheck: Check = {
  id: 'quality.output-schema',
  description: 'Flags tool outputSchemas that are present but structurally malformed. Never flags a missing outputSchema — it is optional.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const schema = tool.outputSchema;
        if (schema === undefined) continue; // optional; absence is fine

        if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
          const actualType = schema === null ? 'null' : Array.isArray(schema) ? 'array' : typeof schema;
          results.push({
            checkId: 'quality.output-schema',
            severity: 'warning',
            message: `Tool "${tool.name}" declares an outputSchema, but it is ${actualType} instead of a JSON Schema object.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            details: { actualType },
            suggestedFix: {
              description: 'Replace outputSchema with a valid JSON Schema object, or remove it if not needed.',
            },
          });
          continue;
        }

        const schemaObj = schema as Record<string, unknown>;
        const hasType = typeof schemaObj.type === 'string' || Array.isArray(schemaObj.type);
        const hasCombinatorOrRef =
          Boolean(schemaObj.$ref) || Boolean(schemaObj.oneOf) || Boolean(schemaObj.anyOf) || Boolean(schemaObj.allOf);

        if (!hasType && !hasCombinatorOrRef) {
          results.push({
            checkId: 'quality.output-schema',
            severity: 'warning',
            message: `Tool "${tool.name}" outputSchema is missing a "type" or combinator field.`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            suggestedFix: { description: 'Add `"type": "object"` to the outputSchema.' },
          });
        } else if (typeof schemaObj.type === 'string' && schemaObj.type !== 'object') {
          results.push({
            checkId: 'quality.output-schema',
            severity: 'warning',
            message: `Tool "${tool.name}" outputSchema declares type "${schemaObj.type}" instead of "object".`,
            serverName: connection.server.name,
            toolName: tool.name,
            category: 'quality',
            suggestedFix: { description: 'Change outputSchema\'s top-level "type" to "object".' },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'quality.output-schema',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'quality',
      });
    }
    return results;
  },
};
