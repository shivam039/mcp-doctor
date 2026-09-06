import { describe, it, expect } from 'vitest';
import { securityPromptInjectionRiskCheck } from '../../src/checks/security-prompt-injection-risk.js';
import { runCheckConformanceSuite } from '../../src/conformance.js';
import {
  promptInjectionDescriptionConnection,
  promptInjectionParamConnection,
  cleanDescriptionsConnection,
  validConnection,
  emptyToolsConnection,
  undefinedToolsConnection,
} from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

describe('securityPromptInjectionRiskCheck (security.prompt-injection-risk)', () => {
  it('passes the shared conformance suite', async () => {
    const result = await runCheckConformanceSuite(securityPromptInjectionRiskCheck);
    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('returns no diagnostics for normal, human-facing descriptions', () => {
    expect(securityPromptInjectionRiskCheck.run(validConnection)).toEqual([]);
    expect(securityPromptInjectionRiskCheck.run(cleanDescriptionsConnection)).toEqual([]);
  });

  it('handles empty/undefined tools gracefully', () => {
    expect(securityPromptInjectionRiskCheck.run(emptyToolsConnection)).toEqual([]);
    expect(securityPromptInjectionRiskCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags instruction-like language in a tool description', () => {
    const results = securityPromptInjectionRiskCheck.run(promptInjectionDescriptionConnection);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.prompt-injection-risk',
      severity: 'warning',
      serverName: 'injection-server',
      toolName: 'suspicious_tool',
    });
    expect(results[0].details).toMatchObject({ source: 'description' });
    expect(results[0].message.toLowerCase()).toContain('heuristic');
  });

  it('flags instruction-like language hidden in a parameter description', () => {
    const results = securityPromptInjectionRiskCheck.run(promptInjectionParamConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.prompt-injection-risk',
      severity: 'warning',
      toolName: 'other_tool',
    });
    expect(results[0].details).toMatchObject({ source: 'parameter-description', property: 'note' });
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools(): never {
        throw new Error('internal error');
      },
    } as unknown as MCPConnection;

    const results = securityPromptInjectionRiskCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      checkId: 'security.prompt-injection-risk',
      severity: 'error',
      serverName: 'exploding-server',
    });
  });
});
