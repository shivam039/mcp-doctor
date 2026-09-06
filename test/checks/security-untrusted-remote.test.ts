import { describe, it, expect } from 'vitest';
import { securityUntrustedRemoteCheck } from '../../src/checks/security-untrusted-remote.js';
import { runCheckConformanceSuite } from '../../src/conformance.js';
import { diffConfigPatch, applyConfigPatch, isConfigPatch } from '../../src/fix.js';
import {
  insecureHttpConnection,
  ipLiteralHttpsConnection,
  insecureAndIpLiteralConnection,
  trustedRemoteConnection,
  loopbackHttpConnection,
  validConnection,
  emptyToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('securityUntrustedRemoteCheck (security.untrusted-remote)', () => {
  it('passes the shared conformance suite', async () => {
    const result = await runCheckConformanceSuite(securityUntrustedRemoteCheck);
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('ignores stdio servers entirely', () => {
    expect(securityUntrustedRemoteCheck.run(validConnection)).toEqual([]);
  });

  it('is clean for an https domain URL', () => {
    expect(securityUntrustedRemoteCheck.run(trustedRemoteConnection)).toEqual([]);
  });

  it('flags a plain http:// URL with a fixable patch', () => {
    const results = securityUntrustedRemoteCheck.run(insecureHttpConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.untrusted-remote',
      severity: 'warning',
      serverName: 'insecure-http-server',
      details: { reason: 'non-https' },
    });
    expect(results[0].message.toLowerCase()).toContain('heuristic');
    expect(isConfigPatch(results[0].suggestedFix?.patch)).toBe(true);
    expect(results[0].suggestedFix?.patch).toEqual({
      serverName: 'insecure-http-server',
      set: { url: 'https://api.example.com/mcp' },
    });
  });

  it('flags an https raw-IP host without a patch (no safe mechanical fix)', () => {
    const results = securityUntrustedRemoteCheck.run(ipLiteralHttpsConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.untrusted-remote',
      severity: 'warning',
      serverName: 'ip-literal-server',
      details: { reason: 'ip-literal-host' },
    });
    expect(results[0].suggestedFix?.patch).toBeUndefined();
  });

  it('flags both non-https and IP-literal issues independently for the same server', () => {
    const results = securityUntrustedRemoteCheck.run(insecureAndIpLiteralConnection);
    expect(results).toHaveLength(2);
    const reasons = results.map((r) => (r.details as { reason: string }).reason).sort();
    expect(reasons).toEqual(['ip-literal-host', 'non-https']);
  });

  it('does not flag loopback as a raw-IP host, but still flags http scheme', () => {
    const results = securityUntrustedRemoteCheck.run(loopbackHttpConnection);
    expect(results).toHaveLength(1);
    expect(results[0].details).toMatchObject({ reason: 'non-https' });
  });

  it('handles connections with no url gracefully', () => {
    expect(securityUntrustedRemoteCheck.run(emptyToolsConnection)).toEqual([]);
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: {
        name: 'exploding-server',
        transport: 'http',
        get url(): never {
          throw new Error('internal error');
        },
      },
      status: 'connected',
    } as unknown as MCPConnection;

    const results = securityUntrustedRemoteCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.untrusted-remote',
      severity: 'error',
      serverName: 'exploding-server',
    });
  });

  describe('idempotency (FR3-1.4)', () => {
    it('applying the suggested patch removes the diagnostic on the next check run, and re-applying it is a no-op', () => {
      const rawConfig = { servers: [{ ...insecureHttpConnection.server }] };
      const patch = securityUntrustedRemoteCheck.run(insecureHttpConnection)[0].suggestedFix!.patch;
      expect(isConfigPatch(patch)).toBe(true);
      if (!isConfigPatch(patch)) throw new Error('unreachable');

      // First application actually changes something.
      expect(diffConfigPatch(rawConfig, patch)).toHaveLength(1);
      const fixedConfig = applyConfigPatch(rawConfig, patch);

      // Re-running the check against the fixed server reports nothing.
      const fixedConnection: MCPConnection = {
        ...insecureHttpConnection,
        server: { ...insecureHttpConnection.server, ...fixedConfig.servers[0] },
      };
      expect(securityUntrustedRemoteCheck.run(fixedConnection)).toEqual([]);

      // Applying the same patch again to the already-fixed config is a no-op.
      expect(diffConfigPatch(fixedConfig, patch)).toEqual([]);
      expect(applyConfigPatch(fixedConfig, patch)).toEqual(fixedConfig);
    });
  });
});
