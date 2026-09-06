import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

const VALID_JSON_SCHEMA_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
]);

function matchesDeclaredType(value: unknown, declaredType: string): boolean {
  if (value === null) {
    return declaredType === 'null';
  }
  if (Array.isArray(value)) {
    return declaredType === 'array';
  }
  const jsType = typeof value;
  if (jsType === 'string') {
    return declaredType === 'string';
  }
  if (jsType === 'number') {
    if (declaredType === 'number') return true;
    if (declaredType === 'integer') return Number.isInteger(value);
    return false;
  }
  if (jsType === 'boolean') {
    return declaredType === 'boolean';
  }
  if (jsType === 'object') {
    return declaredType === 'object';
  }
  return false;
}

function valueMatchesTypeDefinition(value: unknown, typeDef: unknown): boolean {
  if (typeof typeDef === 'string') {
    return matchesDeclaredType(value, typeDef);
  }
  if (Array.isArray(typeDef)) {
    return typeDef.some(
      (t) => typeof t === 'string' && matchesDeclaredType(value, t),
    );
  }
  return true;
}

export const typeMismatchCheck: Check = {
  id: 'schema.type-mismatch',
  description: 'Flags properties with invalid types or enum values that do not match their declared type.',
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
          const declaredType = propObj.type;

          if (declaredType !== undefined) {
            if (typeof declaredType === 'string') {
              if (!VALID_JSON_SCHEMA_TYPES.has(declaredType)) {
                results.push({
                  checkId: 'schema.type-mismatch',
                  severity: 'warning',
                  message: `Property "${propName}" in tool "${tool.name}" has invalid or unrecognized type "${declaredType}".`,
                  serverName: connection.server.name,
                  toolName: tool.name,
                  details: { property: propName, invalidType: declaredType },
                });
              }
            } else if (Array.isArray(declaredType)) {
              for (const item of declaredType) {
                if (typeof item !== 'string' || !VALID_JSON_SCHEMA_TYPES.has(item)) {
                  results.push({
                    checkId: 'schema.type-mismatch',
                    severity: 'warning',
                    message: `Property "${propName}" in tool "${tool.name}" has invalid type union entry "${String(item)}".`,
                    serverName: connection.server.name,
                    toolName: tool.name,
                    details: { property: propName, invalidTypeEntry: item },
                  });
                }
              }
            } else {
              results.push({
                checkId: 'schema.type-mismatch',
                severity: 'warning',
                message: `Property "${propName}" in tool "${tool.name}" has invalid type descriptor of type ${typeof declaredType}.`,
                serverName: connection.server.name,
                toolName: tool.name,
                details: { property: propName, typeDescriptor: declaredType },
              });
            }
          }

          // Check enum values against declared type
          if (Array.isArray(propObj.enum) && declaredType !== undefined) {
            for (const enumVal of propObj.enum) {
              if (!valueMatchesTypeDefinition(enumVal, declaredType)) {
                results.push({
                  checkId: 'schema.type-mismatch',
                  severity: 'warning',
                  message: `Enum value ${JSON.stringify(enumVal)} for property "${propName}" in tool "${tool.name}" does not match declared type "${JSON.stringify(declaredType)}".`,
                  serverName: connection.server.name,
                  toolName: tool.name,
                  details: {
                    property: propName,
                    enumValue: enumVal,
                    declaredType,
                  },
                });
              }
            }
          }
        }
      }
    } catch (err) {
      results.push({
        checkId: 'schema.type-mismatch',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
