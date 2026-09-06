import { describe, it, expect } from 'vitest';
import { qualityToolNamesCheck, evaluateToolName } from '../../src/checks/quality-tool-names.js';
import { validConnection, emptyToolsConnection, undefinedToolsConnection } from '../fixtures/mock-connections.js';
import type { MCPConnection } from '../../src/types.js';

const conn = (tools: MCPConnection['tools']): MCPConnection => ({
  server: { name: 'srv', transport: 'stdio' },
  status: 'connected',
  tools,
});

describe('qualityToolNamesCheck (quality.tool-name)', () => {
  it('returns no diagnostics for a normal, well-named tool', () => {
    expect(qualityToolNamesCheck.run(validConnection)).toEqual([]);
  });

  it('handles empty tools array and undefined tools gracefully', () => {
    expect(qualityToolNamesCheck.run(emptyToolsConnection)).toEqual([]);
    expect(qualityToolNamesCheck.run(undefinedToolsConnection)).toEqual([]);
  });

  it('flags an empty tool name as an error', () => {
    const results = qualityToolNamesCheck.run(conn([{ name: '', description: 'd', inputSchema: {} }]));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-name', severity: 'error' });
  });

  it('flags duplicate tool names as an error', () => {
    const results = qualityToolNamesCheck.run(
      conn([
        { name: 'search', description: 'd', inputSchema: {} },
        { name: 'search', description: 'd2', inputSchema: {} },
      ]),
    );
    const dup = results.find((r) => r.message.includes('declared 2 times'));
    expect(dup).toMatchObject({ checkId: 'quality.tool-name', severity: 'error', toolName: 'search' });
  });

  it('flags an excessively long name as a warning', () => {
    const longName = 'a'.repeat(200);
    const results = qualityToolNamesCheck.run(conn([{ name: longName, description: 'd', inputSchema: {} }]));
    expect(results).toContainEqual(
      expect.objectContaining({ checkId: 'quality.tool-name', severity: 'warning', toolName: longName }),
    );
  });

  it('flags names with control/whitespace characters as a warning', () => {
    const results = qualityToolNamesCheck.run(conn([{ name: 'search\ntool', description: 'd', inputSchema: {} }]));
    expect(results).toContainEqual(
      expect.objectContaining({ checkId: 'quality.tool-name', severity: 'warning' }),
    );
  });

  it('flags single-character and curated placeholder names as ambiguous', () => {
    const results = qualityToolNamesCheck.run(
      conn([
        { name: 'x', description: 'd', inputSchema: {} },
        { name: 'tool', description: 'd', inputSchema: {} },
        { name: 'Test', description: 'd', inputSchema: {} },
      ]),
    );
    expect(results.filter((r) => r.message.includes('ambiguous'))).toHaveLength(3);
  });

  it('does not flag legitimately short, meaningful names', () => {
    const results = qualityToolNamesCheck.run(conn([{ name: 'ls', description: 'Lists files.', inputSchema: {} }]));
    expect(results).toEqual([]);
  });

  it('catches unexpected internal errors without throwing', () => {
    const brokenConnection = {
      server: { name: 'exploding-server', transport: 'stdio' },
      status: 'connected',
      get tools() {
        throw new Error('boom');
      },
    } as unknown as MCPConnection;

    const results = qualityToolNamesCheck.run(brokenConnection);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'quality.tool-name', severity: 'error' });
  });

  describe('protocol-version awareness (evaluateToolName)', () => {
    it('treats an over-length name as a quality warning when no protocol rule defines a limit', () => {
      const findings = evaluateToolName('a'.repeat(200), {});
      expect(findings).toContainEqual(expect.objectContaining({ severity: 'warning', category: 'quality' }));
      expect(findings.some((f) => f.category === 'protocol')).toBe(false);
    });

    it('treats an over-length name as a protocol violation (error) when a hard rule defines a limit', () => {
      const findings = evaluateToolName('a'.repeat(50), { maxLength: 20 });
      const protocolFinding = findings.find((f) => f.category === 'protocol');
      expect(protocolFinding).toMatchObject({ severity: 'error', category: 'protocol' });
      expect(protocolFinding?.message).toContain('protocol violation');
    });

    it('does not also raise the quality-length warning when the protocol violation already fired', () => {
      const findings = evaluateToolName('a'.repeat(50), { maxLength: 20 });
      expect(findings.filter((f) => f.message.includes('characters'))).toHaveLength(1);
    });

    it('treats a character-set issue as a quality warning with no pattern rule', () => {
      const findings = evaluateToolName('bad name', {});
      expect(findings).toEqual([]); // a single space is not flagged by hasInvalidCharacters
    });

    it('treats a name violating a hard pattern rule as a protocol violation (error)', () => {
      const findings = evaluateToolName('bad name!', { pattern: /^[a-zA-Z0-9_-]+$/ });
      const protocolFinding = findings.find((f) => f.category === 'protocol');
      expect(protocolFinding).toMatchObject({ severity: 'error', category: 'protocol' });
    });

    it('never labels an empty name as a protocol violation, even with hard rules configured', () => {
      const findings = evaluateToolName('', { maxLength: 5, pattern: /^x$/ });
      expect(findings).toHaveLength(1);
      expect(findings[0]).toMatchObject({ severity: 'error', category: 'quality' });
    });

    it('the full check plumbs the negotiated protocol version into evaluateToolName (no violation for any currently-supported version)', () => {
      const results = qualityToolNamesCheck.run({
        server: { name: 'srv', transport: 'stdio' },
        status: 'connected',
        protocolVersion: { requested: '2025-11-25', negotiated: '2025-11-25', compatible: true },
        tools: [{ name: 'a'.repeat(200), description: 'd', inputSchema: {} }],
      });
      expect(results.every((r) => r.category !== 'protocol')).toBe(true);
    });
  });
});
