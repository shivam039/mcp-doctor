import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

interface ValidationOutcome {
  valid: boolean;
  errors: string[];
  caveats: string[];
}

function generatePlaceholderForType(
  propDef: Record<string, unknown>,
): { value: unknown; caveat?: string } {
  // 1. If enum is specified
  if (Array.isArray(propDef.enum)) {
    if (propDef.enum.length === 0) {
      throw new Error('required enum array is empty');
    }
    return { value: propDef.enum[0] };
  }

  // 2. If default is specified
  if (propDef.default !== undefined) {
    return { value: propDef.default };
  }

  // 3. Match by type
  const rawType = propDef.type;
  const targetType = Array.isArray(rawType) ? rawType[0] : rawType;

  if (targetType === 'string') {
    if (typeof propDef.minLength === 'number' && propDef.minLength > 0) {
      return { value: 'a'.repeat(propDef.minLength) };
    }
    return { value: '' };
  }

  if (targetType === 'number' || targetType === 'integer') {
    if (typeof propDef.minimum === 'number' && propDef.minimum > 0) {
      return { value: propDef.minimum };
    }
    return { value: 0 };
  }

  if (targetType === 'boolean') {
    return { value: false };
  }

  if (targetType === 'array') {
    return { value: [] };
  }

  if (targetType === 'object') {
    return { value: {} };
  }

  if (targetType === 'null') {
    return { value: null };
  }

  // Fallback if type is missing or complex
  return {
    value: '',
    caveat: `unknown or missing type "${String(rawType)}", defaulted to empty string`,
  };
}

function validateSyntheticPayload(
  payload: Record<string, unknown>,
  schema: Record<string, unknown>,
): ValidationOutcome {
  const errors: string[] = [];
  const caveats: string[] = [];

  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties =
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};

  // Verify all required fields are present
  for (const req of required) {
    if (typeof req === 'string' && !(req in payload)) {
      errors.push(`Missing required field "${req}" in synthetic payload.`);
    }
  }

  // Validate properties
  for (const [key, val] of Object.entries(payload)) {
    const propDef = properties[key];
    if (!propDef || typeof propDef !== 'object' || Array.isArray(propDef)) {
      continue;
    }
    const propObj = propDef as Record<string, unknown>;

    // Enum validation
    if (Array.isArray(propObj.enum)) {
      if (propObj.enum.length === 0) {
        errors.push(`Field "${key}" specifies an empty enum array.`);
      } else if (!propObj.enum.includes(val)) {
        errors.push(
          `Field "${key}" value ${JSON.stringify(val)} is not in enum [${propObj.enum.map((e) => JSON.stringify(e)).join(', ')}].`,
        );
      }
    }

    // Number constraints check
    if (typeof val === 'number') {
      if (typeof propObj.minimum === 'number' && typeof propObj.maximum === 'number') {
        if (propObj.minimum > propObj.maximum) {
          errors.push(
            `Field "${key}" has contradictory bounds: minimum (${propObj.minimum}) > maximum (${propObj.maximum}).`,
          );
        }
      }
      if (typeof propObj.minimum === 'number' && val < propObj.minimum) {
        errors.push(`Field "${key}" value ${val} is less than minimum ${propObj.minimum}.`);
      }
      if (typeof propObj.maximum === 'number' && val > propObj.maximum) {
        errors.push(`Field "${key}" value ${val} is greater than maximum ${propObj.maximum}.`);
      }
    }

    // String constraints check
    if (typeof val === 'string') {
      if (typeof propObj.minLength === 'number' && typeof propObj.maxLength === 'number') {
        if (propObj.minLength > propObj.maxLength) {
          errors.push(
            `Field "${key}" has contradictory bounds: minLength (${propObj.minLength}) > maxLength (${propObj.maxLength}).`,
          );
        }
      }
    }
  }

  if (schema.$ref || schema.oneOf || schema.anyOf || schema.allOf) {
    caveats.push('Schema uses complex combinators or references ($ref/oneOf/anyOf/allOf).');
  }

  return {
    valid: errors.length === 0,
    errors,
    caveats,
  };
}

export const sampleCallSimulationCheck: Check = {
  id: 'schema.sample-call-simulation',
  description:
    'Generates and validates a minimal synthetic argument object against the tool inputSchema.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools || !Array.isArray(connection.tools)) {
        return results;
      }

      for (const tool of connection.tools) {
        const schema = tool.inputSchema;
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
          results.push({
            checkId: 'schema.sample-call-simulation',
            severity: 'error',
            message: `Cannot simulate sample call for tool "${tool.name}": inputSchema is not a valid object.`,
            serverName: connection.server.name,
            toolName: tool.name,
          });
          continue;
        }

        const schemaObj = schema as Record<string, unknown>;
        const required = Array.isArray(schemaObj.required) ? schemaObj.required : [];
        const properties =
          schemaObj.properties &&
          typeof schemaObj.properties === 'object' &&
          !Array.isArray(schemaObj.properties)
            ? (schemaObj.properties as Record<string, unknown>)
            : {};

        const syntheticArgs: Record<string, unknown> = {};
        const generationCaveats: string[] = [];
        let generationFailed = false;

        for (const reqField of required) {
          if (typeof reqField !== 'string') continue;

          if (!(reqField in properties)) {
            results.push({
              checkId: 'schema.sample-call-simulation',
              severity: 'error',
              message: `Sample call generation failed for tool "${tool.name}": required field "${reqField}" has no property definition.`,
              serverName: connection.server.name,
              toolName: tool.name,
              details: { missingRequiredProperty: reqField },
            });
            generationFailed = true;
            break;
          }

          const propDef = properties[reqField];
          if (!propDef || typeof propDef !== 'object' || Array.isArray(propDef)) {
            results.push({
              checkId: 'schema.sample-call-simulation',
              severity: 'error',
              message: `Sample call generation failed for tool "${tool.name}": property definition for "${reqField}" is not an object.`,
              serverName: connection.server.name,
              toolName: tool.name,
            });
            generationFailed = true;
            break;
          }

          try {
            const { value, caveat } = generatePlaceholderForType(
              propDef as Record<string, unknown>,
            );
            syntheticArgs[reqField] = value;
            if (caveat) generationCaveats.push(caveat);
          } catch (genErr) {
            results.push({
              checkId: 'schema.sample-call-simulation',
              severity: 'error',
              message: `Sample call generation failed for tool "${tool.name}" on required field "${reqField}": ${genErr instanceof Error ? genErr.message : String(genErr)}`,
              serverName: connection.server.name,
              toolName: tool.name,
            });
            generationFailed = true;
            break;
          }
        }

        if (generationFailed) {
          continue;
        }

        // Validate the generated payload against the schema
        const outcome = validateSyntheticPayload(syntheticArgs, schemaObj);
        if (!outcome.valid) {
          results.push({
            checkId: 'schema.sample-call-simulation',
            severity: 'error',
            message: `Sample call simulation validation failed for tool "${tool.name}": ${outcome.errors.join('; ')}`,
            serverName: connection.server.name,
            toolName: tool.name,
            details: {
              syntheticArgs,
              errors: outcome.errors,
            },
          });
        } else if (generationCaveats.length > 0 || outcome.caveats.length > 0) {
          const allCaveats = [...generationCaveats, ...outcome.caveats];
          results.push({
            checkId: 'schema.sample-call-simulation',
            severity: 'warning',
            message: `Sample call simulation succeeded with caveats for tool "${tool.name}": ${allCaveats.join('; ')}`,
            serverName: connection.server.name,
            toolName: tool.name,
            details: {
              syntheticArgs,
              caveats: allCaveats,
            },
          });
        }
      }
    } catch (err) {
      results.push({
        checkId: 'schema.sample-call-simulation',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
