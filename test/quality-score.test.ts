import { describe, it, expect } from 'vitest';
import {
  computeConnectionQualityScore,
  computeReportQualityScore,
  QUALITY_DIMENSION_WEIGHTS,
} from '../src/quality-score.js';
import type { MCPConnection, DiagnosticResult, RunReport } from '../src/types.js';

const perfectConnection: MCPConnection = {
  server: { name: 'perfect', transport: 'stdio' },
  status: 'connected',
  tools: [{ name: 'get_weather', description: 'Returns the current weather for a city.', inputSchema: { type: 'object' } }],
  protocolVersion: { requested: '2025-11-25', negotiated: '2025-11-25', compatible: true },
  serverInfo: { name: 'perfect-server', version: '1.0.0' },
};

describe('computeConnectionQualityScore', () => {
  it('returns undefined for a connection that never connected', () => {
    expect(
      computeConnectionQualityScore({ server: { name: 's', transport: 'stdio' }, status: 'failed' }, []),
    ).toBeUndefined();
  });

  it('gives a perfect connection with no diagnostics a 100 in every dimension', () => {
    const score = computeConnectionQualityScore(perfectConnection, []);
    expect(score?.overall).toBe(100);
    expect(score?.dimensions).toEqual({ protocol: 100, schema: 100, usability: 100, security: 100, reliability: 100 });
    expect(score?.deductions).toEqual([]);
  });

  it('dimension weights sum to 1', () => {
    const sum = Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('deducts from the usability dimension for quality-category diagnostics', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'quality.vague-description', severity: 'warning', message: 'x', serverName: 'perfect', category: 'quality' },
    ];
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(score?.dimensions.usability).toBe(97); // 100 - 3
    expect(score?.dimensions.schema).toBe(100);
    expect(score?.deductions).toHaveLength(1);
    expect(score?.deductions[0]).toMatchObject({ dimension: 'usability', checkId: 'quality.vague-description', points: 3 });
  });

  it('deducts from schema for schema-category diagnostics via checkId-prefix inference (no explicit category needed)', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'schema.malformed', severity: 'error', message: 'x', serverName: 'perfect' },
    ];
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(score?.dimensions.schema).toBe(92); // 100 - 8
  });

  it('caps repeated diagnostics from the same checkId so they cannot dominate a dimension', () => {
    // 20 identical warnings from one checkId: naive math would be 20*3=60,
    // but the per-checkId cap for warnings is 15.
    const diagnostics: DiagnosticResult[] = Array.from({ length: 20 }, (_, i) => ({
      checkId: 'quality.vague-description',
      severity: 'warning' as const,
      message: `tool ${i}`,
      serverName: 'perfect',
      category: 'quality' as const,
    }));
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(score?.dimensions.usability).toBe(85); // 100 - 15 (capped), not 100 - 60
    expect(score?.deductions[0].points).toBe(15);
  });

  it('never lets a dimension go below 0 even with many distinct high-severity checkIds', () => {
    const diagnostics: DiagnosticResult[] = Array.from({ length: 30 }, (_, i) => ({
      checkId: `security.made-up-check-${i}`,
      severity: 'error' as const,
      message: 'x',
      serverName: 'perfect',
    }));
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(score?.dimensions.security).toBe(0);
    expect(score?.overall).toBeGreaterThanOrEqual(0);
  });

  it('ignores diagnostics that belong to a different server', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'schema.malformed', severity: 'error', message: 'x', serverName: 'someone-else' },
    ];
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(score?.overall).toBe(100);
  });

  it('deducts from the protocol dimension for capability errors and a missing serverInfo', () => {
    const connection: MCPConnection = {
      ...perfectConnection,
      serverInfo: undefined,
      capabilityErrors: { resources: 'resources/list response has no resources array' },
    };
    const score = computeConnectionQualityScore(connection, []);
    expect(score?.dimensions.protocol).toBe(80); // 100 - 15 (capability error) - 5 (missing serverInfo)
  });

  it('is deterministic: repeated calls with the same input produce the same score', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'quality.tool-name', severity: 'warning', message: 'x', serverName: 'perfect', category: 'quality' },
    ];
    const first = computeConnectionQualityScore(perfectConnection, diagnostics);
    const second = computeConnectionQualityScore(perfectConnection, diagnostics);
    expect(first).toEqual(second);
  });

  it('every non-zero deduction has a non-empty, explaining description', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'schema.malformed', severity: 'error', message: 'x', serverName: 'perfect' },
    ];
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    for (const d of score?.deductions ?? []) {
      expect(d.description.length).toBeGreaterThan(0);
      expect(d.points).toBeGreaterThan(0);
    }
  });
});

describe('computeReportQualityScore', () => {
  it('returns undefined when no server connected', () => {
    const report: RunReport = {
      connections: [{ server: { name: 's', transport: 'stdio' }, status: 'failed' }],
      diagnostics: [],
      summary: { servers: 1, connected: 0, failed: 1, errors: 0, warnings: 0 },
    };
    expect(computeReportQualityScore(report)).toBeUndefined();
  });

  it('averages per-server scores and excludes failed connections from the average', () => {
    const report: RunReport = {
      connections: [
        perfectConnection,
        { server: { name: 'broken', transport: 'stdio' }, status: 'failed', error: { stage: 'spawn', message: 'x' } },
      ],
      diagnostics: [],
      summary: { servers: 2, connected: 1, failed: 1, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report);
    expect(score?.overall).toBe(100);
    expect(Object.keys(score?.perServer ?? {})).toEqual(['perfect']);
  });
});
