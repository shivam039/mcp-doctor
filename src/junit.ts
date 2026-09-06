import type { RunReport } from './types.js';
import type { FleetReport } from './fleet.js';

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Formats a RunReport as a standard JUnit XML document for CI visualization.
 */
export function formatReportJUnit(report: RunReport): string {
  const lines: string[] = [];
  const totalTests = Math.max(1, report.connections.length + report.diagnostics.length);
  const totalErrors = report.summary.errors;

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="mcp-medic" tests="${totalTests}" failures="${totalErrors}" errors="0">`,
  );
  lines.push(
    `  <testsuite name="${escapeXml(report.configSource || 'mcp-config')}" tests="${totalTests}" failures="${totalErrors}">`,
  );

  // Connection testcases
  for (const conn of report.connections) {
    if (conn.status === 'connected') {
      lines.push(
        `    <testcase classname="${escapeXml(conn.server.name)}" name="connection.handshake" time="${((conn.latencyMs || 0) / 1000).toFixed(3)}" />`,
      );
    } else {
      lines.push(
        `    <testcase classname="${escapeXml(conn.server.name)}" name="connection.handshake">`,
      );
      lines.push(
        `      <failure message="${escapeXml(conn.error?.message || 'Connection failed')}" type="ConnectionFailure">${escapeXml(conn.error?.message || '')}</failure>`,
      );
      lines.push('    </testcase>');
    }
  }

  // Diagnostic testcases
  for (const d of report.diagnostics) {
    const scope = d.toolName ? `${d.serverName}.${d.toolName}` : d.serverName;
    if (d.severity === 'error') {
      lines.push(
        `    <testcase classname="${escapeXml(scope)}" name="${escapeXml(d.checkId)}">`,
      );
      lines.push(
        `      <failure message="${escapeXml(d.message)}" type="CheckError">${escapeXml(d.message)}${d.suggestedFix ? `\nSuggested fix: ${escapeXml(d.suggestedFix.description)}` : ''}</failure>`,
      );
      lines.push('    </testcase>');
    } else {
      lines.push(
        `    <testcase classname="${escapeXml(scope)}" name="${escapeXml(d.checkId)}">`,
      );
      lines.push(`      <system-out>[${d.severity}] ${escapeXml(d.message)}</system-out>`);
      lines.push('    </testcase>');
    }
  }

  lines.push('  </testsuite>');
  lines.push('</testsuites>');

  return lines.join('\n');
}

/**
 * Formats a multi-file FleetReport as a JUnit XML document.
 */
export function formatFleetReportJUnit(fleetReport: FleetReport): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="mcp-medic-fleet" tests="${fleetReport.totalServers}" failures="${fleetReport.totalErrors}">`,
  );

  for (const fileResult of fleetReport.fileResults) {
    if (fileResult.report) {
      const rep = fileResult.report;
      lines.push(
        `  <testsuite name="${escapeXml(fileResult.filePath)}" tests="${rep.summary.servers + rep.diagnostics.length}" failures="${rep.summary.errors}">`,
      );
      for (const conn of rep.connections) {
        if (conn.status === 'connected') {
          lines.push(
            `    <testcase classname="${escapeXml(conn.server.name)}" name="connection.handshake" />`,
          );
        } else {
          lines.push(
            `    <testcase classname="${escapeXml(conn.server.name)}" name="connection.handshake">`,
          );
          lines.push(
            `      <failure message="${escapeXml(conn.error?.message || 'Connection failed')}" type="ConnectionFailure" />`,
          );
          lines.push('    </testcase>');
        }
      }
      for (const d of rep.diagnostics) {
        const scope = d.toolName ? `${d.serverName}.${d.toolName}` : d.serverName;
        if (d.severity === 'error') {
          lines.push(
            `    <testcase classname="${escapeXml(scope)}" name="${escapeXml(d.checkId)}">`,
          );
          lines.push(
            `      <failure message="${escapeXml(d.message)}" type="CheckError">${escapeXml(d.message)}</failure>`,
          );
          lines.push('    </testcase>');
        }
      }
      lines.push('  </testsuite>');
    } else if (fileResult.error) {
      lines.push(
        `  <testsuite name="${escapeXml(fileResult.filePath)}" tests="1" failures="1">`,
      );
      lines.push(
        `    <testcase classname="config.file" name="parse"><failure message="${escapeXml(fileResult.error)}" type="ConfigError" /></testcase>`,
      );
      lines.push('  </testsuite>');
    }
  }

  lines.push('</testsuites>');
  return lines.join('\n');
}
