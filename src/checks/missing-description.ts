import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

export const missingDescriptionCheck: Check = {
  id: 'schema.missing-description',
  description: 'Flags tools and tool properties that are missing descriptions.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        // Check top-level tool description
        if (
          tool.description === undefined ||
          typeof tool.description !== 'string' ||
          tool.description.trim() === ''
        ) {
          results.push({
            checkId: 'schema.missing-description',
            severity: 'warning',
            message: `Tool "${tool.name}" is missing a description.`,
            serverName: connection.server.name,
            toolName: tool.name,
          });
        }

        // Check property descriptions in inputSchema
        const schema = tool.inputSchema;
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
          continue;
        }

        const schemaObj = schema as Record<string, unknown>;
        if (
          !schemaObj.properties ||
          typeof schemaObj.properties !== 'object' ||
          Array.isArray(schemaObj.properties)
        ) {
          continue;
        }

        const properties = schemaObj.properties as Record<string, unknown>;
        for (const [propName, propDef] of Object.entries(properties)) {
          if (!propDef || typeof propDef !== 'object' || Array.isArray(propDef)) {
            continue;
          }

          const propObj = propDef as Record<string, unknown>;
          if (
            propObj.description === undefined ||
            typeof propObj.description !== 'string' ||
            propObj.description.trim() === ''
          ) {
            results.push({
              checkId: 'schema.missing-description',
              severity: 'info',
              message: `Property "${propName}" in tool "${tool.name}" is missing a description.`,
              serverName: connection.server.name,
              toolName: tool.name,
              details: { property: propName },
            });
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'schema.missing-description',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
