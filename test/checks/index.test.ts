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
  securityHiddenUnicodeTagsCheck,
  qualityToolNamesCheck,
  qualityToolDescriptionsCheck,
  qualityToolOutputSchemaCheck,
  qualityToolAnnotationsCheck,
  qualityToolSurfaceCheck,
  qualityResourcesCheck,
  qualityPromptsCheck,
  protocolConnectionHealthCheck,
} from '../../src/checks/index.js';

describe('checks index', () => {
  it('exports all 17 checks in allChecks', () => {
    expect(allChecks).toHaveLength(17);
    expect(allChecks).toContain(malformedSchemaCheck);
    expect(allChecks).toContain(missingRequiredFieldsCheck);
    expect(allChecks).toContain(typeMismatchCheck);
    expect(allChecks).toContain(missingDescriptionCheck);
    expect(allChecks).toContain(sampleCallSimulationCheck);
    expect(allChecks).toContain(securityUntrustedRemoteCheck);
    expect(allChecks).toContain(securityOverbroadPermissionsCheck);
    expect(allChecks).toContain(securityPromptInjectionRiskCheck);
    expect(allChecks).toContain(securityHiddenUnicodeTagsCheck);
    expect(allChecks).toContain(qualityToolNamesCheck);
    expect(allChecks).toContain(qualityToolDescriptionsCheck);
    expect(allChecks).toContain(qualityToolOutputSchemaCheck);
    expect(allChecks).toContain(qualityToolAnnotationsCheck);
    expect(allChecks).toContain(qualityToolSurfaceCheck);
    expect(allChecks).toContain(qualityResourcesCheck);
    expect(allChecks).toContain(qualityPromptsCheck);
    expect(allChecks).toContain(protocolConnectionHealthCheck);
  });

  it('has valid check IDs for each check', () => {
    const ids = allChecks.map((c) => c.id);
    expect(ids).toEqual([
      'protocol.connection-health',
      'schema.malformed',
      'schema.missing-required',
      'schema.type-mismatch',
      'schema.missing-description',
      'schema.sample-call-simulation',
      'security.untrusted-remote',
      'security.overbroad-permissions',
      'security.prompt-injection-risk',
      'security.hidden-unicode-tags',
      'quality.tool-name',
      'quality.vague-description',
      'quality.output-schema',
      'quality.tool-annotations',
      'quality.tool-surface',
      'quality.resource',
      'quality.prompt',
    ]);
  });

  it('labels every heuristic (pattern-matching) security check as such in its description', () => {
    for (const check of [securityUntrustedRemoteCheck, securityOverbroadPermissionsCheck, securityPromptInjectionRiskCheck]) {
      expect(check.description.toLowerCase()).toContain('heuristic');
    }
  });

  it('does NOT label security.hidden-unicode-tags as heuristic — its detection is deterministic, not a pattern guess', () => {
    expect(securityHiddenUnicodeTagsCheck.description.toLowerCase()).not.toContain('heuristic');
  });
});
