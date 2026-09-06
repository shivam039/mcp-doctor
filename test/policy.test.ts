import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadPolicy, createPolicyChecks } from '../src/policy.js';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MCPConnection } from '../src/types.js';

describe('Policy-as-Code', () => {
  const policyFile = join(tmpdir(), `policy-test-${Date.now()}.json`);

  beforeEach(() => {
    writeFileSync(
      policyFile,
      JSON.stringify({
        bannedTransports: ['stdio'],
        allowedDomains: ['example.com', 'mcp.internal'],
        minDescriptionLength: 15,
      }),
    );
  });

  afterEach(() => {
    if (existsSync(policyFile)) {
      unlinkSync(policyFile);
    }
  });

  it('loads policy from path', () => {
    const policy = loadPolicy(policyFile);
    expect(policy).toBeDefined();
    expect(policy?.bannedTransports).toEqual(['stdio']);
    expect(policy?.minDescriptionLength).toBe(15);
  });

  it('generates composable check instances enforcing policy rules', () => {
    const policy = loadPolicy(policyFile)!;
    const checks = createPolicyChecks(policy);
    expect(checks).toHaveLength(3);

    const bannedConn: MCPConnection = {
      server: { name: 'stdio-server', transport: 'stdio' },
      status: 'connected',
    };

    const bannedCheck = checks.find((c) => c.id === 'policy.banned-transport')!;
    const results = bannedCheck.run(bannedConn) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe('policy.banned-transport');
    expect(results[0].severity).toBe('error');
    expect(results[0].suggestedFix).toBeDefined();
  });

  it('flags unapproved remote domains in SSE/HTTP servers', () => {
    const policy = loadPolicy(policyFile)!;
    const checks = createPolicyChecks(policy);
    const domainCheck = checks.find((c) => c.id === 'policy.domain-allowlist')!;

    const unapprovedConn: MCPConnection = {
      server: {
        name: 'external-server',
        transport: 'sse',
        url: 'https://unapproved-domain.org/mcp/sse',
      },
      status: 'connected',
    };

    const results = domainCheck.run(unapprovedConn) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe('policy.domain-allowlist');
    expect(results[0].severity).toBe('error');
  });

  it('flags tool descriptions shorter than minimum length', () => {
    const policy = loadPolicy(policyFile)!;
    const checks = createPolicyChecks(policy);
    const lengthCheck = checks.find((c) => c.id === 'policy.description-length')!;

    const briefConn: MCPConnection = {
      server: { name: 'brief-server', transport: 'http', url: 'https://example.com' },
      status: 'connected',
      tools: [
        {
          name: 'short_tool',
          description: 'Too short', // 9 chars < 15
          inputSchema: { type: 'object' },
        },
      ],
    };

    const results = lengthCheck.run(briefConn) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].checkId).toBe('policy.description-length');
    expect(results[0].severity).toBe('warning');
  });

  it('enforces requireToolDescriptions (nested quality form) as an error', () => {
    const checks = createPolicyChecks({ quality: { requireToolDescriptions: true } });
    const check = checks.find((c) => c.id === 'policy.require-tool-descriptions')!;
    expect(check).toBeDefined();

    const conn: MCPConnection = {
      server: { name: 's', transport: 'stdio' },
      status: 'connected',
      tools: [{ name: 'undocumented', inputSchema: {} }],
    };
    const results = check.run(conn) as any[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'policy.require-tool-descriptions', severity: 'error' });
  });

  it('honors the deprecated top-level requireToolDescriptions field the same way', () => {
    const checks = createPolicyChecks({ requireToolDescriptions: true });
    expect(checks.find((c) => c.id === 'policy.require-tool-descriptions')).toBeDefined();
  });

  it('enforces quality.maxTools as an organizational error, independent of the default quality.tool-surface warning', () => {
    const checks = createPolicyChecks({ quality: { maxTools: 2 } });
    const check = checks.find((c) => c.id === 'policy.max-tools')!;
    expect(check).toBeDefined();

    const conn: MCPConnection = {
      server: { name: 's', transport: 'stdio' },
      status: 'connected',
      tools: [
        { name: 'a', description: 'd', inputSchema: {} },
        { name: 'b', description: 'd', inputSchema: {} },
        { name: 'c', description: 'd', inputSchema: {} },
      ],
    };
    const results = check.run(conn) as any[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'policy.max-tools', severity: 'error' });
  });

  it('does not add the quality checks when the relevant policy fields are unset', () => {
    const checks = createPolicyChecks({});
    expect(checks.find((c) => c.id === 'policy.require-tool-descriptions')).toBeUndefined();
    expect(checks.find((c) => c.id === 'policy.max-tools')).toBeUndefined();
  });
});
