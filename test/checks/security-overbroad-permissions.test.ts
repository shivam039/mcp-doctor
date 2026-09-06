import { describe, it, expect } from 'vitest';
import { securityOverbroadPermissionsCheck } from '../../src/checks/security-overbroad-permissions.js';
import { runCheckConformanceSuite } from '../../src/conformance.js';
import {
  overbroadShellCommandConnection,
  overbroadFilesystemConnection,
  overbroadDescriptionConnection,
  narrowlyScopedConnection,
  validConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('securityOverbroadPermissionsCheck (security.overbroad-permissions)', () => {
  it('passes the shared conformance suite', async () => {
    const result = await runCheckConformanceSuite(securityOverbroadPermissionsCheck);
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('returns no diagnostics for a well-scoped tool', () => {
    expect(securityOverbroadPermissionsCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty/undefined tools gracefully', () => {
    expect(securityOverbroadPermissionsCheck.run(emptyToolsConnection)).toEqual([]);
    expect(securityOverbroadPermissionsCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags an unconstrained "command" string parameter as shell-command risk', () => {
    const results = securityOverbroadPermissionsCheck.run(overbroadShellCommandConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.overbroad-permissions',
      severity: 'warning',
      serverName: 'shell-tool-server',
      toolName: 'run_command',
      details: { category: 'shell-command', source: 'schema', property: 'command' },
    });
    expect(results[0].message.toLowerCase()).toContain('heuristic');
  });

  it('flags an unconstrained "path" string parameter as filesystem-path risk', () => {
    const results = securityOverbroadPermissionsCheck.run(overbroadFilesystemConnection);
    expect(results).toHaveLength(1);
    expect(results[0].details).toMatchObject({ category: 'filesystem-path', property: 'path' });
  });

  it('flags tool descriptions that claim broad shell access even without a matching parameter', () => {
    const results = securityOverbroadPermissionsCheck.run(overbroadDescriptionConnection);
    expect(results).toHaveLength(1);
    expect(results[0].details).toMatchObject({ category: 'shell-command', source: 'description' });
  });

  it('does not flag a "command" parameter constrained by an enum', () => {
    expect(securityOverbroadPermissionsCheck.run(narrowlyScopedConnection)).toEqual([]);
  });

  it('does not flag a "command" parameter constrained by a pattern', () => {
    const conn: MCPConnection = {
      server: { name: 'pattern-server', transport: 'stdio' },
      status: 'connected',
      tools: [
        {
          name: 'run_named_script',
          description: 'Runs a whitelisted script.',
          inputSchema: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Script name.', pattern: '^[a-z_]+$' },
            },
          },
        },
      ],
    };
    expect(securityOverbroadPermissionsCheck.run(conn)).toEqual([]);
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools(): never {
        throw new Error('internal error');
      },
    } as unknown as MCPConnection;

    const results = securityOverbroadPermissionsCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.overbroad-permissions',
      severity: 'error',
      serverName: 'exploding-server',
    });
  });
});
