import type { MCPConnection } from '../../src/types.js';

/**
 * Perfectly valid tool schema:
 * - valid JSON schema object
 * - all required fields defined in properties
 * - valid property types and matching enums
 * - tool and property descriptions present
 * - valid synthetic sample call generation
 */
export const validConnection: MCPConnection = {
  server: {
    name: 'valid-server',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  },
  status: 'connected',
  tools: [
    {
      name: 'calculate_sum',
      description: 'Calculates the sum of two numbers.',
      inputSchema: {
        type: 'object',
        properties: {
          a: {
            type: 'number',
            description: 'The first number.',
          },
          b: {
            type: 'number',
            description: 'The second number.',
          },
          operation: {
            type: 'string',
            description: 'Operation name.',
            enum: ['add', 'sum'],
          },
        },
        required: ['a', 'b'],
      },
    },
  ],
};

/**
 * Required fields declared in `required` that do NOT appear in `properties`.
 */
export const missingRequiredFieldsConnection: MCPConnection = {
  server: {
    name: 'missing-required-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [
    {
      name: 'broken_required_tool',
      description: 'Tool declaring non-existent required fields.',
      inputSchema: {
        type: 'object',
        properties: {
          existingField: {
            type: 'string',
            description: 'An existing field.',
          },
        },
        required: ['existingField', 'nonExistentField1', 'nonExistentField2'],
      },
    },
  ],
};

/**
 * Invalid property type (not in JSON Schema standard) and enum value mismatch.
 */
export const invalidTypeConnection: MCPConnection = {
  server: {
    name: 'invalid-type-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [
    {
      name: 'invalid_type_tool',
      description: 'Tool with unrecognized type and enum mismatch.',
      inputSchema: {
        type: 'object',
        properties: {
          badTypeField: {
            type: 'int_custom',
            description: 'Field with non-standard type.',
          },
          enumMismatchField: {
            type: 'string',
            description: 'String field with numeric enum values.',
            enum: ['valid_str', 123, true],
          },
          validField: {
            type: 'boolean',
            description: 'Valid boolean field.',
          },
        },
      },
    },
  ],
};

/**
 * Tool missing top-level description, and schema properties missing descriptions.
 */
export const missingDescriptionConnection: MCPConnection = {
  server: {
    name: 'missing-description-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [
    {
      name: 'undocumented_tool',
      // description is omitted / missing
      inputSchema: {
        type: 'object',
        properties: {
          paramOne: {
            type: 'string',
            // description is omitted
          },
          paramTwo: {
            type: 'number',
            description: 'Has a description.',
          },
        },
      },
    },
  ],
};

/**
 * Malformed inputSchema:
 * - string instead of object
 * - null schema
 * - array schema
 * - object missing "type" and combinators ($ref/oneOf/anyOf/allOf)
 */
export const malformedSchemaConnection: MCPConnection = {
  server: {
    name: 'malformed-schema-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [
    {
      name: 'string_schema_tool',
      description: 'Tool whose inputSchema is just a string.',
      inputSchema: 'foo',
    },
    {
      name: 'null_schema_tool',
      description: 'Tool whose inputSchema is null.',
      inputSchema: null,
    },
    {
      name: 'array_schema_tool',
      description: 'Tool whose inputSchema is an array.',
      inputSchema: ['not', 'an', 'object'],
    },
    {
      name: 'missing_type_schema_tool',
      description: 'Tool whose inputSchema has properties but missing type.',
      inputSchema: {
        properties: {
          name: {
            type: 'string',
            description: 'Name field.',
          },
        },
      },
    },
    {
      name: 'empty_object_schema_tool',
      description: 'Tool whose inputSchema is an empty object with no type or combinator.',
      inputSchema: {},
    },
  ],
};

/**
 * Empty tools array.
 */
export const emptyToolsConnection: MCPConnection = {
  server: {
    name: 'empty-tools-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [],
};

/**
 * Tools undefined connection.
 */
export const undefinedToolsConnection: MCPConnection = {
  server: {
    name: 'undefined-tools-server',
    transport: 'stdio',
  },
  status: 'connected',
};

/**
 * Sample call simulation failure connection:
 * e.g., required enum field with empty enum array or contradictory schema.
 */
export const sampleCallFailureConnection: MCPConnection = {
  server: {
    name: 'sample-call-failure-server',
    transport: 'stdio',
  },
  status: 'connected',
  tools: [
    {
      name: 'empty_enum_tool',
      description: 'Tool with required enum property having empty enum list.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            description: 'Mode selector with empty enums.',
            enum: [],
          },
        },
        required: ['mode'],
      },
    },
  ],
};
