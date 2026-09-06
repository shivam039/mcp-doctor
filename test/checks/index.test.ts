import { describe, it, expect } from 'vitest';
import {
  allChecks,
  malformedSchemaCheck,
  missingRequiredFieldsCheck,
  typeMismatchCheck,
  missingDescriptionCheck,
  sampleCallSimulationCheck,
} from '../../src/checks/index.js';

describe('checks index', () => {
  it('exports all 5 checks in allChecks', () => {
    expect(allChecks).toHaveLength(5);
    expect(allChecks).toContain(malformedSchemaCheck);
    expect(allChecks).toContain(missingRequiredFieldsCheck);
    expect(allChecks).toContain(typeMismatchCheck);
    expect(allChecks).toContain(missingDescriptionCheck);
    expect(allChecks).toContain(sampleCallSimulationCheck);
  });

  it('has valid check IDs for each check', () => {
    const ids = allChecks.map((c) => c.id);
    expect(ids).toEqual([
      'schema.malformed',
      'schema.missing-required',
      'schema.type-mismatch',
      'schema.missing-description',
      'schema.sample-call-simulation',
    ]);
  });
});
