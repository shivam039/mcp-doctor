import type { RunReport } from './types.js';

export interface FormatReportOptions {
  showFixes?: boolean;
}

/** Human-readable plain text report formatter. */
export function formatReportHuman(
  report: RunReport,
  options: FormatReportOptions = {},
): string {
  const lines: string[] = [];
  lines.push(`mcp-doctor report${report.configSource ? ` — ${report.configSource}` : ''}`);
  lines.push(
    `${report.summary.connected}/${report.summary.servers} servers connected, ` +
      `${report.summary.errors} error(s), ${report.summary.warnings} warning(s)`,
  );
  lines.push('');

  for (const conn of report.connections) {
    const status = conn.status === 'connected' ? 'OK' : conn.status.toUpperCase();
    lines.push(`[${status}] ${conn.server.name} (${conn.server.transport})`);
    if (conn.error) {
      lines.push(`  ${conn.error.stage}: ${conn.error.message}`);
    }
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
