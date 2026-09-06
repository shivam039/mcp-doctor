import { describe, it, expect } from 'vitest';
import { runCheckConformanceSuite } from '../src/conformance.js';
import { allChecks } from '../src/checks/index.js';
import type { Check, MCPConnection, DiagnosticResult } from '../src/types.js';

describe('runCheckConformanceSuite', () => {
  it('passes all 5 built-in checks through conformance suite', async () => {
    for (const check of allChecks) {
      const result = await runCheckConformanceSuite(check);
      expect(result.errors).toEqual([]);
      expect(result.pass).toBe(true);
    }
  });

  it('fails an invalid check missing id or description', async () => {
    const brokenCheck: Check = {
      id: '',
      description: '',
      run(_conn: MCPConnection): DiagnosticResult[] {
        return [];
      },
    };

    const result = await runCheckConformanceSuite(brokenCheck);
    expect(result.pass).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('fails a check that throws uncaught exceptions', async () => {
    const throwingCheck: Check = {
      id: 'mcp-doctor-check-throwing',
      description: 'A check that throws',
      run(_conn: MCPConnection): DiagnosticResult[] {
        throw new Error('uncaught fatal exception');
      },
    };

    const result = await runCheckConformanceSuite(throwingCheck);
    expect(result.pass).toBe(false);
    expect(result.errors.some((e) => e.includes('uncaught exception'))).toBe(true);
  });
});
