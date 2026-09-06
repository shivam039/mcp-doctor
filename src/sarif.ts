import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RunReport, Severity } from './types.js';

function readOwnVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function sarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

interface SarifRule {
  id: string;
  shortDescription: { text: string };
  defaultConfiguration: { level: 'error' | 'warning' | 'note' };
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: { artifactLocation: { uri: string } };
    logicalLocations?: Array<{ name: string; kind: string }>;
  }>;
}

/**
 * Formats a RunReport as SARIF 2.1.0 (https://sarifweb.azurewebsites.net/),
 * consumable by GitHub Code Scanning (`upload-sarif`) and other SARIF
 * viewers. mcp-medic's diagnostics have no source line/column — they're
 * about a *running server's* declared tools/capabilities, not source code —
 * so each result's physicalLocation points at the config file the server
 * was declared in, with the server (and tool, if any) named as a logical
 * location instead of a line range.
 */
export function formatReportSarif(report: RunReport): string {
  const artifactUri = report.configSource || 'mcp-config.json';

  const rules = new Map<string, SarifRule>();
  const results: SarifResult[] = [];

  for (const d of report.diagnostics) {
    if (!rules.has(d.checkId)) {
      rules.set(d.checkId, {
        id: d.checkId,
        shortDescription: { text: d.checkId },
        defaultConfiguration: { level: sarifLevel(d.severity) },
      });
    }

    const logicalLocations = [{ name: d.serverName, kind: 'module' }];
    if (d.toolName) {
      logicalLocations.push({ name: d.toolName, kind: 'member' });
    }

    results.push({
      ruleId: d.checkId,
      level: sarifLevel(d.severity),
      message: {
        text: d.suggestedFix?.description ? `${d.message} Suggested fix: ${d.suggestedFix.description}` : d.message,
      },
      locations: [
        {
          physicalLocation: { artifactLocation: { uri: artifactUri } },
          logicalLocations,
        },
      ],
    });
  }

  const sarif = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'mcp-medic',
            informationUri: 'https://github.com/shivam039/mcp-doctor',
            version: readOwnVersion(),
            rules: [...rules.values()],
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(sarif, null, 2);
}
