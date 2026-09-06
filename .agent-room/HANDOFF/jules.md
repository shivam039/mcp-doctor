# Handoff — jules

## What's Implemented

All 5 core schema validation checks in `src/checks/*.ts` and exported via `src/checks/index.ts`:

1. **`src/checks/malformed-schema.ts` (`schema.malformed`)**:
   - Verifies `inputSchema` is a valid JSON object (not `null`, `array`, or primitive). Flags primitives/arrays/nulls with `severity: 'error'`.
   - Verifies the schema contains `"type"` or one of the combinator/reference keywords (`"$ref"`, `"oneOf"`, `"anyOf"`, `"allOf"`).
   - Flags missing `"type"`/combinator fields with `severity: 'warning'`.

2. **`src/checks/missing-required-fields.ts` (`schema.missing-required`)**:
   - Verifies that every field listed in `inputSchema.required` has a corresponding property definition in `inputSchema.properties`.
   - Flags missing definitions with `severity: 'error'`.

3. **`src/checks/type-mismatch.ts` (`schema.type-mismatch`)**:
   - Walks `inputSchema.properties` and verifies each declared `type` is one of standard JSON Schema types: `string`, `number`, `integer`, `boolean`, `object`, `array`, `null` (or valid union arrays).
   - Verifies all entries in `enum` match the declared `type`.
   - Flags invalid types and mismatched enum entries with `severity: 'warning'`.

4. **`src/checks/missing-description.ts` (`schema.missing-description`)**:
   - Flags tools lacking a top-level `description` with `severity: 'warning'`.
   - Flags individual property definitions lacking `description` with `severity: 'info'`.

5. **`src/checks/sample-call-simulation.ts` (`schema.sample-call-simulation`)**:
   - Synthesizes a minimal valid arguments object for required properties (respecting types, enums, defaults, and min/max bounds).
   - Validates generated payloads against schema constraints (empty enums, contradictory bounds, missing required fields).
   - Flags fatal generation/validation failures with `severity: 'error'`, and flags schemas with caveats (`$ref`/`oneOf`/`anyOf`/`allOf` combinators) with `severity: 'warning'`.

6. **`src/checks/index.ts`**:
   - Exports all 5 individual check objects and `allChecks` array.

All checks strictly conform to the `CONTRACT.md` requirement: every `Check.run()` wraps its logic in try/catch and never throws uncaught exceptions, returning an `error`-severity `DiagnosticResult` on unexpected internal failures.

## Test Coverage

- **Fixtures (`test/fixtures/mock-connections.ts`)**:
  - `validConnection`: Clean schema passing all checks.
  - `missingRequiredFieldsConnection`: Declares non-existent fields in `required`.
  - `invalidTypeConnection`: Unrecognized type names and type-mismatched enum values.
  - `missingDescriptionConnection`: Missing tool description and missing property description.
  - `malformedSchemaConnection`: String schemas, null schemas, array schemas, and empty schemas.
  - `emptyToolsConnection` & `undefinedToolsConnection`: Edge cases with zero tools.
  - `sampleCallFailureConnection`: Tool with required empty enum array `[]`.

- **Unit Tests (`test/checks/*.test.ts`)**:
  - `test/checks/malformed-schema.test.ts`: Error/warning assertions, error boundary tests.
  - `test/checks/missing-required-fields.test.ts`: Missing property detection, non-object schema resilience, error boundary tests.
  - `test/checks/type-mismatch.test.ts`: Type checking, union types, enum validation, error boundary tests.
  - `test/checks/missing-description.test.ts`: Tool-level warning vs property-level info, error boundary tests.
  - `test/checks/sample-call-simulation.test.ts`: Valid synthesis, empty enums, contradictory bounds, caveat generation, error boundary tests.
  - `test/checks/index.test.ts`: Validates exports and IDs.
  - `test/orchestrator.test.ts`: End-to-end integration test with orchestrator and `allChecks`.

All 32 tests across 8 test suites pass cleanly with 0 type errors.

## Dependencies & Decisions

- **Zero runtime dependencies added**: Built-in lightweight synthetic generator and schema validator in `sample-call-simulation.ts` to avoid modifying package dependencies in v1.
- **Future Proposal**: If full JSON Schema draft-07/2020-12 spec validation or remote `$ref` resolution is required in v2, proposing adding `ajv` (logged in `DECISIONS.md`).

## Explicit Edge Cases & Scope Boundaries

- **Complex Schema References (`$ref`, `oneOf`, `anyOf`, `allOf`)**: In v1, sample-call simulation does not fetch remote URL `$ref` schemas or evaluate deep combinator matrices; instead, it generates base required properties and reports a `severity: 'warning'` caveat to inform the user that combinators are in use.
- **Non-object schemas in sub-checks**: Handled gracefully by returning clean/empty or deferring to `schema.malformed` rather than throwing errors.
