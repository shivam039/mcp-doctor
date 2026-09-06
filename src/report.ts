import type { RunReport } from './types.js';

/** Antigravity: feel free to replace with colored output in the CLI layer;
 * this plain version is the fallback / JSON-adjacent default so the report
 * shape is exercised end-to-end before terminal styling exists. */
export function formatReportHuman(report: RunReport): string {
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
    }
  }

  return lines.join('\n');
}

export function formatReportJSON(report: RunReport): string {
  return JSON.stringify(report, null, 2);
}
