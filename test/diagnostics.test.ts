import { describe, it, expect } from 'vitest';
import { inferDiagnosticCategory, categoryOf } from '../src/diagnostics.js';

describe('inferDiagnosticCategory', () => {
  it('maps known checkId prefixes to their category', () => {
    expect(inferDiagnosticCategory('protocol.version-mismatch')).toBe('protocol');
    expect(inferDiagnosticCategory('schema.malformed')).toBe('schema');
    expect(inferDiagnosticCategory('security.untrusted-remote')).toBe('security');
    expect(inferDiagnosticCategory('usability.something')).toBe('usability');
    expect(inferDiagnosticCategory('reliability.something')).toBe('reliability');
    expect(inferDiagnosticCategory('quality.tool-name')).toBe('quality');
    expect(inferDiagnosticCategory('policy.banned-transport')).toBe('configuration');
    expect(inferDiagnosticCategory('configuration.custom')).toBe('configuration');
  });

  it('defaults unknown prefixes to quality', () => {
    expect(inferDiagnosticCategory('community-check.something')).toBe('quality');
  });
});

describe('categoryOf', () => {
  it('prefers an explicit category over inference', () => {
    expect(
      categoryOf({
        checkId: 'schema.malformed',
        severity: 'error',
        message: 'x',
        serverName: 's',
        category: 'security',
      }),
    ).toBe('security');
  });

  it('falls back to inference when category is unset', () => {
    expect(
      categoryOf({ checkId: 'security.untrusted-remote', severity: 'warning', message: 'x', serverName: 's' }),
    ).toBe('security');
  });
});
