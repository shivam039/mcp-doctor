import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

/**
 * Surfaces connection-level protocol facts as real, visible diagnostics —
 * previously these (capability-inspection failures, a version downgrade, a
 * missing serverInfo) were deducted from the quality score directly from
 * `MCPConnection` metadata inside src/quality-score.ts, with no
 * corresponding diagnostic a user could actually see in the report or
 * `--json` output. That meant a developer looking at "why did my protocol
 * score drop" would find nothing in `diagnostics` explaining it.
 *
 * This check makes those same facts flow through the standard
 * connection -> diagnostics -> dimension -> score pipeline like every
 * other check, so every point deducted is explainable from a visible
 * DiagnosticResult (see .agent-room/DECISIONS.md for the full rationale,
 * including why this also changes some of the exact point values).
 */
export const protocolConnectionHealthCheck: Check = {
  id: 'protocol.connection-health',
  description: 'Flags protocol-level connection facts: a negotiated version downgrade, a missing serverInfo, or a declared capability whose list call failed.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (
        connection.protocolVersion?.negotiated &&
        connection.protocolVersion.negotiated !== connection.protocolVersion.requested
      ) {
        results.push({
          checkId: 'protocol.version-downgrade',
          severity: 'info',
          message: `Server negotiated protocol version ${connection.protocolVersion.negotiated} instead of the requested ${connection.protocolVersion.requested}.`,
          serverName: connection.server.name,
          category: 'protocol',
          details: {
            requested: connection.protocolVersion.requested,
            negotiated: connection.protocolVersion.negotiated,
          },
        });
      }

      if (!connection.serverInfo?.name) {
        results.push({
          checkId: 'protocol.missing-server-info',
          severity: 'info',
          message: 'Server did not report its name/version in serverInfo during initialize.',
          serverName: connection.server.name,
          category: 'protocol',
          suggestedFix: { description: 'Have the server include a serverInfo.name in its initialize response.' },
        });
      }

      if (connection.capabilityErrors?.resources) {
        results.push({
          checkId: 'protocol.capability-error',
          severity: 'error',
          message: `Server declared the "resources" capability, but resources/list failed: ${connection.capabilityErrors.resources}`,
          serverName: connection.server.name,
          category: 'protocol',
          details: { capability: 'resources', error: connection.capabilityErrors.resources },
        });
      }

      if (connection.capabilityErrors?.prompts) {
        results.push({
          checkId: 'protocol.capability-error',
          severity: 'error',
          message: `Server declared the "prompts" capability, but prompts/list failed: ${connection.capabilityErrors.prompts}`,
          serverName: connection.server.name,
          category: 'protocol',
          details: { capability: 'prompts', error: connection.capabilityErrors.prompts },
        });
      }
    } catch (err) {
      results.push({
        checkId: 'protocol.connection-health',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
        category: 'protocol',
      });
    }
    return results;
  },
};
