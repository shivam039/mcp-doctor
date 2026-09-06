import { describe, it, expect } from 'vitest';
import { getProtocolQualityRules } from '../../src/protocol/quality-rules.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '../../src/protocol/versions.js';

describe('getProtocolQualityRules', () => {
  it('returns no hard tool-name constraints for every currently-supported protocol version', () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const rules = getProtocolQualityRules(version);
      expect(rules.toolName.maxLength).toBeUndefined();
      expect(rules.toolName.pattern).toBeUndefined();
    }
  });

  it('returns the same (no-constraint) rules for an unknown/undefined version rather than guessing', () => {
    expect(getProtocolQualityRules(undefined).toolName).toEqual({});
    expect(getProtocolQualityRules('9999-01-01').toolName).toEqual({});
  });
});
