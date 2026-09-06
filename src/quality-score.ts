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
  QualityCoverage,
  CoverageStatus,
  Check,
} from './types.js';
import { categoryOf, inferDiagnosticCategory } from './diagnostics.js';
import { allChecks } from './checks/index.js';

/**
 * Deterministic MCP quality score. No LLM, no randomness, no network
 * calls beyond the MCP inspection `connect()` already performed — the same
 * report always produces the same score.
 *
 * Design: connection -> diagnostics -> normalized per-checkId deductions ->
 * capped per-dimension score -> weighted overall score. Every deduction is
 * derived from a visible `DiagnosticResult` — nothing is deducted directly
 * from connection metadata that isn't also represented as a diagnostic
 * (see .agent-room/DECISIONS.md, "v1.1 trust hardening" entry, for the
 * `protocol.connection-health` check this replaced).
 *
 * (Result types — QualityDimension, QualityDeduction, QualityScoreBreakdown,
 * ReportQualityScore, QualityCoverage, CoverageStatus — live in src/types.ts
 * alongside RunReport, since RunReport.quality is one of them; this module
 * just implements the math.)
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
 * point deduction must be explainable in terms of these. Do not change
 * without a documented reason — see .agent-room/DECISIONS.md. */
export const QUALITY_DIMENSION_WEIGHTS: Record<QualityDimension, number> = {
  protocol: 0.25,
  schema: 0.2,
  usability: 0.2,
  security: 0.2,
  reliability: 0.15,
};

/**
 * The score is a measurement, not a certification: it reports what
 * mcp-medic's passive checks actually found (or, per `coverage`, actually
 * looked for) — never a formal audit of the server's real security or
 * behavior. Surfaced in both JSON (`ReportQualityScore.disclaimer`) and the
 * human report.
 */
export const QUALITY_SCORE_DISCLAIMER =
  "This score reflects issues detectable by mcp-medic's passive inspection (see \"coverage\") — " +
  'it is not a certification of the server\'s actual security, correctness, or behavior.';

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

function dimensionScore(deductions: QualityDeduction[]): number {
  const totalPoints = deductions.reduce((sum, d) => sum + d.points, 0);
  return Math.max(0, Math.min(100, Math.round(100 - totalPoints)));
}

/**
 * Computes a quality score for one connection, purely from `diagnostics`
 * (filtered to that server) — no connection metadata is consulted
 * directly. Returns `undefined` for a connection that never connected —
 * there's nothing meaningful to score (no tools/schema/capabilities were
 * ever observed); see `computeReportQualityScore` for how the report-level
 * score surfaces that instead of silently dropping it.
 */
export function computeConnectionQualityScore(
  connection: MCPConnection,
  diagnostics: DiagnosticResult[],
): QualityScoreBreakdown | undefined {
  if (connection.status !== 'connected') return undefined;

  const relevant = diagnostics.filter((d) => d.serverName === connection.server.name);

  const allDeductions: QualityDeduction[] = QUALITY_DIMENSIONS.flatMap((dim) =>
    deductionsFromDiagnostics(dim, relevant),
  );

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

const COVERAGE_WEIGHT: Record<CoverageStatus, number> = { covered: 1, partial: 0.5, 'not-covered': 0 };

/**
 * Coverage answers "was this dimension actually evaluated," independent of
 * what score it got — a 100 from zero checks run means "nothing was
 * looked for," not "nothing is wrong." Derived from the *ids* of the
 * checks that actually ran (`executedChecks`), compared against the
 * built-in `allChecks` reference set grouped by dimension. Reliability is
 * special-cased to always 'covered': its signal (did the connection
 * succeed) isn't produced by any optional `Check` — it's inherent to
 * attempting a connection at all, so it's never "not covered."
 */
export function computeQualityCoverage(executedChecks: Check[]): QualityCoverage {
  const referenceByDimension = new Map<QualityDimension, Set<string>>();
  for (const check of allChecks) {
    const dim = categoryToDimension(inferDiagnosticCategory(check.id));
    if (dim === 'reliability') continue; // no built-in check drives reliability; handled unconditionally below
    if (!referenceByDimension.has(dim)) referenceByDimension.set(dim, new Set());
    referenceByDimension.get(dim)!.add(check.id);
  }

  const coverage = {} as QualityCoverage;
  for (const dim of QUALITY_DIMENSIONS) {
    if (dim === 'reliability') {
      coverage[dim] = 'covered';
      continue;
    }
    const reference = referenceByDimension.get(dim) ?? new Set<string>();
    // Every executed check that maps to this dimension — including custom/
    // community checks not in the built-in reference set, so an unmapped
    // check still counts as (at least partial) coverage for the dimension
    // it was inferred into, rather than being invisible to this count.
    const executedForDim = executedChecks.filter((c) => categoryToDimension(inferDiagnosticCategory(c.id)) === dim);

    if (executedForDim.length === 0) {
      coverage[dim] = 'not-covered';
      continue;
    }
    if (reference.size === 0) {
      // No built-in check exists for this dimension at all, but something
      // (necessarily a custom check) ran for it — can't call that "full"
      // coverage without a reference to compare against.
      coverage[dim] = 'partial';
      continue;
    }
    const executedKnownIds = new Set(executedForDim.map((c) => c.id).filter((id) => reference.has(id)));
    coverage[dim] = executedKnownIds.size === reference.size ? 'covered' : 'partial';
  }
  return coverage;
}

function coveragePercent(coverage: QualityCoverage): number {
  const total = QUALITY_DIMENSIONS.reduce((sum, dim) => sum + COVERAGE_WEIGHT[coverage[dim]], 0);
  return Math.round((total / QUALITY_DIMENSIONS.length) * 100);
}

/**
 * Aggregate score across every connected server in a report (simple mean —
 * deliberately not weighted by tool count, so one huge server can't drown
 * out the rest of a fleet). `executedChecks` should be the exact list
 * passed to `runChecks({ checks })` for this report, so `coverage` reflects
 * what actually ran (defaults to the full built-in set if omitted, for
 * callers that haven't been updated to pass it through).
 * Returns `undefined` if no server connected — nothing to score at all.
 */
export function computeReportQualityScore(
  report: RunReport,
  executedChecks: Check[] = allChecks,
): ReportQualityScore | undefined {
  const perServer: Record<string, QualityScoreBreakdown> = {};
  for (const connection of report.connections) {
    const breakdown = computeConnectionQualityScore(connection, report.diagnostics);
    if (breakdown) perServer[connection.server.name] = breakdown;
  }

  const scoredServers = Object.keys(perServer);
  const unscoredServers = report.connections
    .map((c) => c.server.name)
    .filter((name) => !perServer[name]);

  if (scoredServers.length === 0) return undefined;

  const dimensions = Object.fromEntries(
    QUALITY_DIMENSIONS.map((dim) => [
      dim,
      Math.round(scoredServers.reduce((sum, n) => sum + perServer[n].dimensions[dim], 0) / scoredServers.length),
    ]),
  ) as Record<QualityDimension, number>;

  const overall = Math.round(scoredServers.reduce((sum, n) => sum + perServer[n].overall, 0) / scoredServers.length);

  const deductions = scoredServers
    .flatMap((n) => perServer[n].deductions)
    .sort((a, b) => b.points - a.points);

  const coverage = computeQualityCoverage(executedChecks);

  return {
    overall,
    dimensions,
    deductions,
    perServer,
    coverage,
    coveragePercent: coveragePercent(coverage),
    scoredServers,
    unscoredServers,
    disclaimer: QUALITY_SCORE_DISCLAIMER,
  };
}

/**
 * Enforces `.mcp-medic-policy.json`'s `quality.minimumScore` as a CI gate.
 * Pure function so it's directly unit-testable without needing a real CLI
 * invocation or a restricted check set — see PHASE 12 ("policy/CI") in
 * .agent-room/DECISIONS.md.
 *
 * Returns diagnostics to append to the report (0, 1, or 2):
 *  - an 'error' if the score is below `minimumScore` (fails the run).
 *  - a 'warning' if the score was computed from a partial assessment
 *    (incomplete coverage, or a server that couldn't be scored) — a
 *    minimumScore gate must never silently "pass" as if a full check had
 *    run when it didn't.
 */
export function checkMinimumScorePolicy(
  quality: ReportQualityScore,
  minimumScore: number,
  serverNamesLabel: string,
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (quality.overall < minimumScore) {
    results.push({
      checkId: 'policy.minimum-quality-score',
      severity: 'error',
      message: `MCP quality score ${quality.overall} is below the policy minimum of ${minimumScore}.`,
      serverName: serverNamesLabel,
      category: 'configuration',
    });
  }

  if (quality.coveragePercent < 100 || quality.unscoredServers.length > 0) {
    const gaps = Object.entries(quality.coverage)
      .filter(([, status]) => status !== 'covered')
      .map(([dim, status]) => `${dim}: ${status}`)
      .join(', ');
    const parts = [
      gaps ? `coverage is ${quality.coveragePercent}% (${gaps})` : undefined,
      quality.unscoredServers.length > 0
        ? `${quality.unscoredServers.length} server(s) could not be scored: ${quality.unscoredServers.join(', ')}`
        : undefined,
    ].filter(Boolean);
    results.push({
      checkId: 'policy.partial-coverage-with-minimum-score',
      severity: 'warning',
      message: `quality.minimumScore was evaluated against a partial assessment (${parts.join('; ')}) — it may not reflect a full check of this server.`,
      serverName: serverNamesLabel,
      category: 'configuration',
    });
  }

  return results;
}
