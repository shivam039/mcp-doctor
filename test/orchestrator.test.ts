import { describe, it, expect } from 'vitest';
import { runChecks, registerConnectImpl } from '../src/orchestrator.js';
import { allChecks } from '../src/checks/index.js';
import { validConnection, malformedSchemaConnection } from './fixtures/mock-connections.js';
import type { MCPConfig, MCPConnection } from '../src/types.js';

describe('orchestrator with allChecks', () => {
  it('runs all checks against connected servers and aggregates diagnostics', async () => {
    registerConnectImpl(async (server): Promise<MCPConnection> => {
      if (server.name === 'valid-server') {
        return validConnection;
      }
      return malformedSchemaConnection;
    });

    const config: MCPConfig = {
      servers: [
        { name: 'valid-server', transport: 'stdio' },
        { name: 'malformed-schema-server', transport: 'stdio' },
      ],
    };

    const report = await runChecks(config, { checks: allChecks });
    expect(report.summary.servers).toBe(2);
    expect(report.summary.connected).toBe(2);
    expect(report.summary.failed).toBe(0);
    expect(report.diagnostics.length).toBeGreaterThan(0);
    expect(report.summary.errors).toBeGreaterThan(0);
  });
});
