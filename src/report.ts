import type { QualityScoreBreakdown, ReportQualityScore, RunReport } from './types.js';

export interface FormatReportOptions {
  showFixes?: boolean;
  /** Include the MCP quality score section (Phase 7). Off by default so a
   * plain `check` report stays short; `--score`/`score` turn it on. */
  showScore?: boolean;
}

const DIMENSION_LABELS: Record<string, string> = {
  protocol: 'Protocol',
  schema: 'Schema',
  usability: 'Agent usability',
  security: 'Security',
  reliability: 'Reliability',
};

function formatScoreBlock(label: string, score: QualityScoreBreakdown): string[] {
  const lines: string[] = [];
  lines.push(label);
  for (const [dim, value] of Object.entries(score.dimensions)) {
    const name = (DIMENSION_LABELS[dim] ?? dim).padEnd(17, ' ');
    lines.push(`  ${name} ${String(value).padStart(3, ' ')}/100`);
  }
  lines.push(`  ${'MCP QUALITY SCORE'.padEnd(17, ' ')} ${String(score.overall).padStart(3, ' ')}/100`);
  if (score.deductions.length > 0) {
    lines.push('  Deductions:');
    for (const d of score.deductions) {
      lines.push(`    -${d.points} ${d.description}`);
    }
  }
  return lines;
}

/** Printed once per report (not per-server) — coverage and the disclaimer
 * are report-level facts, and repeating them per server would overwhelm
 * the output for a multi-server fleet. */
function formatCoverageAndDisclaimer(quality: ReportQualityScore): string[] {
  const lines: string[] = [];
  const gaps = Object.entries(quality.coverage).filter(([, status]) => status !== 'covered');
  const coverageLine =
    gaps.length === 0
      ? `Coverage: ${quality.coveragePercent}% (all dimensions fully evaluated)`
      : `Coverage: ${quality.coveragePercent}% (${gaps
          .map(([dim, status]) => `${DIMENSION_LABELS[dim] ?? dim}: ${status}`)
          .join(', ')})`;
  lines.push(coverageLine);
  if (quality.unscoredServers.length > 0) {
    lines.push(
      `Note: ${quality.unscoredServers.length} server(s) could not be scored (connection failed): ${quality.unscoredServers.join(', ')}`,
    );
  }
  lines.push(quality.disclaimer);
  return lines;
}

/** Human-readable plain text report formatter. */
export function formatReportHuman(
  report: RunReport,
  options: FormatReportOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`mcp-medic report${report.configSource ? ` — ${report.configSource}` : ''}`);
  lines.push(
    `${report.summary.connected}/${report.summary.servers} servers connected, ` +
      `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
  );
  lines.push('');

  for (const conn of report.connections) {
    const status = conn.status === 'connected' ? 'OK' : conn.status.toUpperCase();
    lines.push(`[${status}] ${conn.server.name} (${conn.server.transport})`);
    if (conn.protocolVersion) {
      const { requested, negotiated, compatible } = conn.protocolVersion;
      const statusText = compatible ? '✓ compatible' : '✗ incompatible';
      lines.push(
        `  Protocol: requested ${requested}, server negotiated ${negotiated ?? '(none)'} — ${statusText}`,
      );
    }
    if (conn.tools) {
      const parts = [`${conn.tools.length} tool(s)`];
      if (conn.resources) parts.push(`${conn.resources.length} resource(s)`);
      if (conn.prompts) parts.push(`${conn.prompts.length} prompt(s)`);
      lines.push(`  Capabilities: ${parts.join(', ')}`);
    }
    if (conn.capabilityErrors?.resources) {
      lines.push(`  resources/list: ${conn.capabilityErrors.resources}`);
    }
    if (conn.capabilityErrors?.prompts) {
      lines.push(`  prompts/list: ${conn.capabilityErrors.prompts}`);
    }
    if (conn.error) {
      lines.push(`  ${conn.error.stage}: ${conn.error.message}`);
    }
    const perServerScore = options.showScore ? report.quality?.perServer[conn.server.name] : undefined;
    if (perServerScore) {
      lines.push('');
      lines.push(...formatScoreBlock('QUALITY', perServerScore));
    }
  }

  if (options.showScore && report.quality) {
    if (Object.keys(report.quality.perServer).length > 1) {
      lines.push('');
      lines.push(...formatScoreBlock('OVERALL QUALITY (all servers)', report.quality));
    }
    lines.push('');
    lines.push(...formatCoverageAndDisclaimer(report.quality));
  }

  if (report.diagnostics.length > 0) {
    lines.push('');
    lines.push('Diagnostics:');
    for (const d of report.diagnostics) {
      const scope = d.toolName ? `${d.serverName}/${d.toolName}` : d.serverName;
      lines.push(`  [${d.severity}] ${scope} — ${d.message} (${d.checkId})`);
      if (options.showFixes && d.suggestedFix?.description) {
        lines.push(`    Suggested fix: ${d.suggestedFix.description}`);
      }
    }
  }

  return lines.join('\n');
}

export function formatReportJSON(report: RunReport): string {
  return JSON.stringify(report, null, 2);
}
