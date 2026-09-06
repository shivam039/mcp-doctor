import { describe, it, expect } from 'vitest';
import {
  allChecks,
  malformedSchemaCheck,
  missingRequiredFieldsCheck,
  typeMismatchCheck,
  missingDescriptionCheck,
  sampleCallSimulationCheck,
  securityUntrustedRemoteCheck,
  securityOverbroadPermissionsCheck,
  securityPromptInjectionRiskCheck,
} from '../../src/checks/index.js';

describe('checks index', () => {
  it('exports all 8 checks in allChecks', () => {
    expect(allChecks).toHaveLength(8);
    expect(allChecks).toContain(malformedSchemaCheck);
    expect(allChecks).toContain(missingRequiredFieldsCheck);
    expect(allChecks).toContain(typeMismatchCheck);
    expect(allChecks).toContain(missingDescriptionCheck);
    expect(allChecks).toContain(sampleCallSimulationCheck);
    expect(allChecks).toContain(securityUntrustedRemoteCheck);
    expect(allChecks).toContain(securityOverbroadPermissionsCheck);
    expect(allChecks).toContain(securityPromptInjectionRiskCheck);
  });

  it('has valid check IDs for each check', () => {
    const ids = allChecks.map((c) => c.id);
    expect(ids).toEqual([
      'schema.malformed',
      'schema.missing-required',
      'schema.type-mismatch',
      'schema.missing-description',
      'schema.sample-call-simulation',
      'security.untrusted-remote',
      'security.overbroad-permissions',
      'security.prompt-injection-risk',
    ]);
  });

  it('labels every security check as heuristic in its description', () => {
    for (const check of [securityUntrustedRemoteCheck, securityOverbroadPermissionsCheck, securityPromptInjectionRiskCheck]) {
      expect(check.description.toLowerCase()).toContain('heuristic');
    }
  });
});
