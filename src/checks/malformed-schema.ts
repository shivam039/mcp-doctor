import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

export const malformedSchemaCheck: Check = {
  id: 'schema.malformed',
  description: 'Flags tools whose inputSchema is not a valid JSON Schema object.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const schema = tool.inputSchema;

        // Check if inputSchema is an object and not null / array / primitive
        if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
          const actualType = schema === null ? 'null' : Array.isArray(schema) ? 'array' : typeof schema;
          results.push({
            checkId: 'schema.malformed',
            severity: 'error',
            message: `Tool "${tool.name}" inputSchema must be a valid JSON Schema object, but got ${actualType}.`,
            serverName: connection.server.name,
            toolName: tool.name,
            details: { actualType, inputSchema: schema },
            suggestedFix: {
              description:
                'Replace inputSchema with a valid JSON Schema object, e.g. { "type": "object", "properties": {} }.',
            },
          });
          continue;
        }

        // Schema is an object: verify it has 'type' or a combinator / ref
        const schemaObj = schema as Record<string, unknown>;
        const hasType = typeof schemaObj.type === 'string' || Array.isArray(schemaObj.type);
        const hasCombinatorOrRef =
          Boolean(schemaObj.$ref) ||
          Boolean(schemaObj.oneOf) ||
          Boolean(schemaObj.anyOf) ||
          Boolean(schemaObj.allOf);

        if (!hasType && !hasCombinatorOrRef) {
          const hasProperties = Boolean(schemaObj.properties);
          results.push({
            checkId: 'schema.malformed',
            severity: 'warning',
            message: hasProperties
              ? `Tool "${tool.name}" inputSchema is missing a "type" or combinator ("$ref", "oneOf", "anyOf", "allOf") field, but defines "properties".`
              : `Tool "${tool.name}" inputSchema is missing a "type" or combinator ("$ref", "oneOf", "anyOf", "allOf") field.`,
            serverName: connection.server.name,
            toolName: tool.name,
            details: { inputSchema: schema },
            suggestedFix: {
              description: 'Add `"type": "object"` to the inputSchema.',
            },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'schema.malformed',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
