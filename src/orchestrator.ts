import type {
  MCPConfig,
  MCPConnection,
  RunOptions,
  RunReport,
  DiagnosticResult,
  Check,
} from './types.js';

async function connectStub(config: MCPConfig['servers'][number]): Promise<MCPConnection> {
  return {
    server: config,
    status: 'failed',
    error: {
      stage: 'spawn',
      message:
        'protocol layer not yet implemented (src/protocol/) — see .agent-room/STATUS.md',
    },
  };
}

let connectImpl: (
  config: MCPConfig['servers'][number],
  timeoutMs: number,
  options?: RunOptions,
) => Promise<MCPConnection> = (config, _timeoutMs) => connectStub(config);

/** Allows the protocol layer to register its real implementation without
 * this file needing to import it directly (keeps orchestrator decoupled
 * from protocol internals per CONTRACT.md module boundaries). */
export function registerConnectImpl(
  impl: (
    config: MCPConfig['servers'][number],
    timeoutMs: number,
    options?: RunOptions,
  ) => Promise<MCPConnection>,
): void {
  connectImpl = impl;
}

export async function runChecks(
  config: MCPConfig,
  options: RunOptions = {},
): Promise<RunReport> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const checks: Check[] = options.checks ?? [];

  const connections: MCPConnection[] = [];
  const diagnostics: DiagnosticResult[] = [];

  for (const server of config.servers) {
    const connection = await connectImpl(server, timeoutMs, options);
    connections.push(connection);

    if (connection.status !== 'connected') {
      continue; // checks require a live connection; connection failure is its own signal in the report
    }

    for (const check of checks) {
      try {
        const results = await check.run(connection);
        diagnostics.push(...results);
      } catch (err) {
        // Non-negotiable per CONTRACT.md: a throwing check must not crash
        // the run. This catch is a safety net on top of each check's own
        // required internal handling.
        diagnostics.push({
          checkId: check.id,
          severity: 'error',
          message: `check threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
          serverName: connection.server.name,
        });
      }
    }
  }

  const summary = {
    servers: config.servers.length,
    connected: connections.filter((c) => c.status === 'connected').length,
    failed: connections.filter((c) => c.status !== 'connected').length,
    errors: diagnostics.filter((d) => d.severity === 'error').length,
    warnings: diagnostics.filter((d) => d.severity === 'warning').length,
  };

  return {
    configSource: config.sourcePath,
    connections,
    diagnostics,
    summary,
  };
}
