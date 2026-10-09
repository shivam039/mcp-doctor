import type { RunReport } from './types.js';
import type { FleetReport } from './fleet.js';

function escapeXml(unsafe: string): string {
  let validXml = '';
  for (const character of unsafe) {
    const codePoint = character.codePointAt(0)!;
    const valid =
      codePoint === 0x9 ||
      codePoint === 0xa ||
      codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (valid) {
      validXml += character;
    }
  }
  return validXml
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
  let totalTestCases = 0;
  let totalFailures = 0;
  for (const fileResult of fleetReport.fileResults) {
    if (fileResult.report) {
      totalTestCases += fileResult.report.connections.length + fileResult.report.diagnostics.length;
      totalFailures += fileResult.report.connections.filter((conn) => conn.status !== 'connected').length;
      totalFailures += fileResult.report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    } else if (fileResult.error) {
      totalTestCases += 1;
      totalFailures += 1;
    }
  }
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuites name="mcp-medic-fleet" tests="${totalTestCases}" failures="${totalFailures}">`,
  );

  for (const fileResult of fleetReport.fileResults) {
    if (fileResult.report) {
      const rep = fileResult.report;
      const testCases = rep.connections.length + rep.diagnostics.length;
      const failures = rep.connections.filter((conn) => conn.status !== 'connected').length +
        rep.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
      lines.push(
        `  <testsuite name="${escapeXml(fileResult.filePath)}" tests="${testCases}" failures="${failures}">`,
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
        } else {
          lines.push(
            `    <testcase classname="${escapeXml(scope)}" name="${escapeXml(d.checkId)}"><system-out>[${d.severity}] ${escapeXml(d.message)}</system-out></testcase>`,
          );
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
