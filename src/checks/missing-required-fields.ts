import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

export const missingRequiredFieldsCheck: Check = {
  id: 'schema.missing-required',
  description: 'Flags required fields listed in inputSchema.required that are not defined in inputSchema.properties.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const schema = tool.inputSchema;
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
          continue;
        }

        const schemaObj = schema as Record<string, unknown>;
        if (!Array.isArray(schemaObj.required)) {
          continue;
        }

        const properties =
          schemaObj.properties &&
          typeof schemaObj.properties === 'object' &&
          !Array.isArray(schemaObj.properties)
            ? (schemaObj.properties as Record<string, unknown>)
            : {};

        for (const reqField of schemaObj.required) {
          if (typeof reqField === 'string' && !(reqField in properties)) {
            results.push({
              checkId: 'schema.missing-required',
              severity: 'error',
              message: `Tool "${tool.name}" lists required field "${reqField}", but it is not defined in "properties".`,
              serverName: connection.server.name,
              toolName: tool.name,
              details: {
                missingField: reqField,
                required: schemaObj.required,
                definedProperties: Object.keys(properties),
              },
              suggestedFix: {
                description: `Define property "${reqField}" under inputSchema.properties, or remove "${reqField}" from inputSchema.required.`,
              },
            });
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'schema.missing-required',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
