import type { DiagnosticCategory, DiagnosticResult } from './types.js';

/**
 * Infers a stable category from a checkId's namespace prefix, for
 * diagnostics that don't set `category` explicitly. This lets every
 * existing check (schema.*, security.*, policy.*) participate in
 * category-aware reporting/scoring without having to touch each one —
 * only checks written after the taxonomy existed set `category` directly.
 */
export function inferDiagnosticCategory(checkId: string): DiagnosticCategory {
  if (checkId.startsWith('protocol.')) return 'protocol';
  if (checkId.startsWith('schema.')) return 'schema';
  if (checkId.startsWith('security.')) return 'security';
  if (checkId.startsWith('usability.')) return 'usability';
  if (checkId.startsWith('reliability.')) return 'reliability';
  if (checkId.startsWith('quality.')) return 'quality';
  if (checkId.startsWith('policy.') || checkId.startsWith('configuration.')) return 'configuration';
  return 'quality';
}

/** The effective category of a diagnostic: its own `category` if set, else inferred from `checkId`. */
export function categoryOf(diagnostic: DiagnosticResult): DiagnosticCategory {
  return diagnostic.category ?? inferDiagnosticCategory(diagnostic.checkId);
}
