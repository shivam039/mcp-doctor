import type {
  MCPConnection,
  DiagnosticResult,
  RunReport,
  Severity,
  DiagnosticCategory,
  QualityDimension,
  QualityDeduction,
  QualityScoreBreakdown,
  ReportQualityScore,
} from './types.js';
import { categoryOf } from './diagnostics.js';

/**
 * Deterministic MCP quality score. No LLM, no randomness, no network
 * calls beyond the MCP inspection `connect()` already performed — the same
 * report always produces the same score.
 *
 * Design: diagnostics -> normalized per-checkId deductions -> capped
 * per-dimension score -> weighted overall score. This keeps the score
 * fully derived from (and consistent with) the diagnostics that are also
 * shown in the report, rather than an independent "second opinion" — see
 * .agent-room/DECISIONS.md for the full rationale.
 *
 * (Result types — QualityDimension, QualityDeduction, QualityScoreBreakdown,
 * ReportQualityScore — live in src/types.ts alongside RunReport, since
 * RunReport.quality is one of them; this module just implements the math.)
 */
export type { QualityDimension, QualityDeduction, QualityScoreBreakdown, ReportQualityScore };

export const QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  'protocol',
  'schema',
  'usability',
  'security',
  'reliability',
];

/** Suggested weights from the product spec; documented here since every
 * point deduction must be explainable in terms of these. */
export const QUALITY_DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  protocol: 0.25,
  schema: 0.2,
  usability: 0.2,
  security: 0.2,
  reliability: 0.15,
};

// Deduction weights: chosen so a handful of real problems meaningfully move
// the score, while a single noisy checkId can never wipe out a whole
// dimension on its own (the per-checkId cap) — this directly implements
// "avoid double-counting" / "sensible caps" from the product spec: e.g. 20
// tools sharing one description problem cost at most 15 points total, not 60.
const SEVERITY_POINTS: Record<Severity, number> = { error: 8, warning: 3, info: 1 };
const SEVERITY_CAP_PER_CHECK: Record<Severity, number> = { error: 25, warning: 15, info: 5 };

function categoryToDimension(category: DiagnosticCategory): QualityDimension {
  switch (category) {
    case 'protocol':
      return 'protocol';
    case 'schema':
      return 'schema';
    case 'security':
      return 'security';
    case 'reliability':
      return 'reliability';
    // 'usability', 'quality' (the broad bucket most tool/resource/prompt
    // quality checks use), and 'configuration' (policy.* checks) all land
    // under the "Agent usability" dimension from the product spec.
    case 'usability':
    case 'quality':
    case 'configuration':
    default:
      return 'usability';
  }
}

function describeDeduction(checkId: string, severity: Severity, count: number): string {
  const plural = count === 1 ? '' : 's';
  return `${count} ${severity}${plural} from "${checkId}"`;
}

function deductionsFromDiagnostics(
  dimension: QualityDimension,
  diagnostics: DiagnosticResult[],
): QualityDeduction[] {
  const grouped = new Map<string, { checkId: string; severity: Severity; count: number }>();
  for (const d of diagnostics) {
    if (categoryToDimension(categoryOf(d)) !== dimension) continue;
    const key = `${d.checkId}|${d.severity}`;
    const entry = grouped.get(key) ?? { checkId: d.checkId, severity: d.severity, count: 0 };
    entry.count += 1;
    grouped.set(key, entry);
  }

  const deductions: QualityDeduction[] = [];
  for (const { checkId, severity, count } of grouped.values()) {
    const points = Math.min(count * SEVERITY_POINTS[severity], SEVERITY_CAP_PER_CHECK[severity]);
    deductions.push({ dimension, checkId, severity, count, points, description: describeDeduction(checkId, severity, count) });
  }
  return deductions;
}

/** Protocol-dimension facts that live on `MCPConnection` rather than as
 * diagnostics (capability negotiation isn't produced by a `Check`). */
function protocolConnectionDeductions(connection: MCPConnection): QualityDeduction[] {
  const deductions: QualityDeduction[] = [];

  if (connection.capabilityErrors?.resources) {
    deductions.push({
      dimension: 'protocol',
      checkId: 'protocol.capability-error',
      severity: 'warning',
      count: 1,
      points: 15,
      description: 'resources/list failed despite being declared as a capability',
    });
  }
  if (connection.capabilityErrors?.prompts) {
    deductions.push({
      dimension: 'protocol',
      checkId: 'protocol.capability-error',
      severity: 'warning',
      count: 1,
      points: 15,
      description: 'prompts/list failed despite being declared as a capability',
    });
  }
  if (
    connection.protocolVersion &&
    connection.protocolVersion.negotiated &&
    connection.protocolVersion.negotiated !== connection.protocolVersion.requested
  ) {
    deductions.push({
      dimension: 'protocol',
      checkId: 'protocol.version-downgrade',
      severity: 'info',
      count: 1,
      points: 5,
      description: `server negotiated ${connection.protocolVersion.negotiated} instead of the requested ${connection.protocolVersion.requested}`,
    });
  }
  if (!connection.serverInfo?.name) {
    deductions.push({
      dimension: 'protocol',
      checkId: 'protocol.missing-server-info',
      severity: 'info',
      count: 1,
      points: 5,
      description: 'server did not report its name/version in serverInfo',
    });
  }

  return deductions;
}

function dimensionScore(deductions: QualityDeduction[]): number {
  const totalPoints = deductions.reduce((sum, d) => sum + d.points, 0);
  return Math.max(0, Math.min(100, Math.round(100 - totalPoints)));
}

/**
 * Computes a quality score for one connection. Returns `undefined` for a
 * connection that never connected — there's nothing meaningful to score
 * (no tools/schema/capabilities were ever observed).
 */
export function computeConnectionQualityScore(
  connection: MCPConnection,
  diagnostics: DiagnosticResult[],
): QualityScoreBreakdown | undefined {
  if (connection.status !== 'connected') return undefined;

  const relevant = diagnostics.filter((d) => d.serverName === connection.server.name);

  const allDeductions: QualityDeduction[] = [
    ...protocolConnectionDeductions(connection),
    ...QUALITY_DIMENSIONS.flatMap((dim) => deductionsFromDiagnostics(dim, relevant)),
  ];

  const dimensions = Object.fromEntries(
    QUALITY_DIMENSIONS.map((dim) => [dim, dimensionScore(allDeductions.filter((d) => d.dimension === dim))]),
  ) as Record<QualityDimension, number>;

  const overall = Math.round(
    QUALITY_DIMENSIONS.reduce((sum, dim) => sum + dimensions[dim] * QUALITY_DIMENSION_WEIGHTS[dim], 0),
  );

  return {
    overall,
    dimensions,
    deductions: allDeductions.filter((d) => d.points > 0).sort((a, b) => b.points - a.points),
  };
}

/**
 * Aggregate score across every connected server in a report (simple mean —
 * deliberately not weighted by tool count, so one huge server can't drown
 * out the rest of a fleet). Returns `undefined` if no server connected.
 */
export function computeReportQualityScore(report: RunReport): ReportQualityScore | undefined {
  const perServer: Record<string, QualityScoreBreakdown> = {};
  for (const connection of report.connections) {
    const breakdown = computeConnectionQualityScore(connection, report.diagnostics);
    if (breakdown) perServer[connection.server.name] = breakdown;
  }

  const names = Object.keys(perServer);
  if (names.length === 0) return undefined;

  const dimensions = Object.fromEntries(
    QUALITY_DIMENSIONS.map((dim) => [
      dim,
      Math.round(names.reduce((sum, n) => sum + perServer[n].dimensions[dim], 0) / names.length),
    ]),
  ) as Record<QualityDimension, number>;

  const overall = Math.round(names.reduce((sum, n) => sum + perServer[n].overall, 0) / names.length);

  const deductions = names
    .flatMap((n) => perServer[n].deductions)
    .sort((a, b) => b.points - a.points);

  return { overall, dimensions, deductions, perServer };
}
