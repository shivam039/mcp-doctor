import { describe, it, expect } from 'vitest';
import {
  computeConnectionQualityScore,
  computeReportQualityScore,
  computeQualityCoverage,
  checkMinimumScorePolicy,
  QUALITY_DIMENSION_WEIGHTS,
  QUALITY_SCORE_DISCLAIMER,
} from '../src/quality-score.js';
import { protocolConnectionHealthCheck } from '../src/checks/protocol-connection-health.js';
import { allChecks, malformedSchemaCheck, securityUntrustedRemoteCheck } from '../src/checks/index.js';
import type { MCPConnection, DiagnosticResult, RunReport, Check } from '../src/types.js';

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

  it('deducts from the protocol dimension for capability errors and a missing serverInfo, via visible protocol.* diagnostics', () => {
    // Connection-level facts (capability errors, missing serverInfo) are no
    // longer deducted directly from MCPConnection metadata — they must flow
    // through a real Check (protocolConnectionHealthCheck) into visible
    // diagnostics first, so a developer can see *why* the score dropped.
    const connection: MCPConnection = {
      ...perfectConnection,
      serverInfo: undefined,
      capabilityErrors: { resources: 'resources/list response has no resources array' },
    };
    const diagnostics = protocolConnectionHealthCheck.run(connection) as DiagnosticResult[];
    expect(diagnostics.length).toBeGreaterThan(0); // sanity: the check actually produced something
    expect(diagnostics.every((d) => d.category === 'protocol')).toBe(true);

    const score = computeConnectionQualityScore(connection, diagnostics);
    // 1 error (capability-error, 8pts) + 1 info (missing-server-info, 1pt) = 9
    expect(score?.dimensions.protocol).toBe(91);
  });

  it('setting connection metadata alone (no diagnostics) no longer silently deducts anything', () => {
    const connection: MCPConnection = {
      ...perfectConnection,
      serverInfo: undefined,
      capabilityErrors: { resources: 'x', prompts: 'y' },
    };
    // Diagnostics deliberately NOT generated from the connection here —
    // proves the score is driven purely by `diagnostics`, not by
    // `MCPConnection` metadata read directly.
    const score = computeConnectionQualityScore(connection, []);
    expect(score?.dimensions.protocol).toBe(100);
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

  it('is independent of diagnostics array order', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'schema.malformed', severity: 'error', message: 'a', serverName: 'perfect' },
      { checkId: 'quality.tool-name', severity: 'warning', message: 'b', serverName: 'perfect', category: 'quality' },
      { checkId: 'security.untrusted-remote', severity: 'warning', message: 'c', serverName: 'perfect' },
    ];
    const forward = computeConnectionQualityScore(perfectConnection, diagnostics);
    const shuffled = computeConnectionQualityScore(perfectConnection, [...diagnostics].reverse());
    expect(forward?.overall).toBe(shuffled?.overall);
    expect(forward?.dimensions).toEqual(shuffled?.dimensions);
  });

  it('gives a single error more impact than a single info finding', () => {
    const errorScore = computeConnectionQualityScore(perfectConnection, [
      { checkId: 'schema.malformed', severity: 'error', message: 'x', serverName: 'perfect' },
    ]);
    const infoScore = computeConnectionQualityScore(perfectConnection, [
      { checkId: 'schema.malformed', severity: 'info', message: 'x', serverName: 'perfect' },
    ]);
    expect(errorScore!.dimensions.schema).toBeLessThan(infoScore!.dimensions.schema);
  });

  it('keeps dimension and overall scores within [0, 100]', () => {
    const diagnostics: DiagnosticResult[] = Array.from({ length: 50 }, (_, i) => ({
      checkId: `quality.made-up-${i}`,
      severity: 'error' as const,
      message: 'x',
      serverName: 'perfect',
      category: 'quality' as const,
    }));
    const score = computeConnectionQualityScore(perfectConnection, diagnostics);
    for (const value of Object.values(score!.dimensions)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
    expect(score!.overall).toBeGreaterThanOrEqual(0);
    expect(score!.overall).toBeLessThanOrEqual(100);
  });

  it('the overall score is explainable as the weighted mean of dimensions', () => {
    const diagnostics: DiagnosticResult[] = [
      { checkId: 'schema.malformed', severity: 'error', message: 'x', serverName: 'perfect' },
      { checkId: 'quality.tool-name', severity: 'warning', message: 'x', serverName: 'perfect', category: 'quality' },
    ];
    const score = computeConnectionQualityScore(perfectConnection, diagnostics)!;
    const expected = Math.round(
      Object.entries(QUALITY_DIMENSION_WEIGHTS).reduce(
        (sum, [dim, weight]) => sum + score.dimensions[dim as keyof typeof score.dimensions] * weight,
        0,
      ),
    );
    expect(score.overall).toBe(expected);
  });
});

describe('computeQualityCoverage', () => {
  it('reports full coverage for the default check set', () => {
    const coverage = computeQualityCoverage(allChecks);
    expect(coverage.protocol).toBe('covered');
    expect(coverage.schema).toBe('covered');
    expect(coverage.usability).toBe('covered');
    expect(coverage.security).toBe('covered');
    expect(coverage.reliability).toBe('covered'); // always covered — connection status is unconditional
  });

  it('reports not-covered for dimensions with zero executed checks, and partial for a subset of a multi-check dimension', () => {
    const coverage = computeQualityCoverage([malformedSchemaCheck]);
    expect(coverage.schema).toBe('partial'); // 1 of 5 built-in schema.* checks ran
    expect(coverage.security).toBe('not-covered');
    expect(coverage.usability).toBe('not-covered');
    expect(coverage.protocol).toBe('not-covered');
    expect(coverage.reliability).toBe('covered');
  });

  it('reports partial coverage when some but not all of a dimension\'s checks ran', () => {
    // security has 3 built-in checks; running only one is partial, not full.
    const coverage = computeQualityCoverage([securityUntrustedRemoteCheck]);
    expect(coverage.security).toBe('partial');
  });

  it('reports not-covered for every diagnostic-driven dimension with an empty check set', () => {
    const coverage = computeQualityCoverage([]);
    expect(coverage.protocol).toBe('not-covered');
    expect(coverage.schema).toBe('not-covered');
    expect(coverage.usability).toBe('not-covered');
    expect(coverage.security).toBe('not-covered');
    expect(coverage.reliability).toBe('covered');
  });

  it('treats an unrecognized custom check as partial coverage for its inferred (usability) dimension', () => {
    const customCheck: Check = { id: 'mycompany.custom-check', description: 'x', run: () => [] };
    const coverage = computeQualityCoverage([customCheck]);
    expect(coverage.usability).toBe('partial');
  });

  it('is deterministic regardless of check list order', () => {
    const a = computeQualityCoverage([...allChecks]);
    const b = computeQualityCoverage([...allChecks].reverse());
    expect(a).toEqual(b);
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

  it('surfaces failed connections as unscoredServers rather than silently dropping them', () => {
    const report: RunReport = {
      connections: [
        perfectConnection,
        { server: { name: 'broken', transport: 'stdio' }, status: 'failed', error: { stage: 'spawn', message: 'x' } },
      ],
      diagnostics: [],
      summary: { servers: 2, connected: 1, failed: 1, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report);
    expect(score?.scoredServers).toEqual(['perfect']);
    expect(score?.unscoredServers).toEqual(['broken']);
  });

  it('reports empty unscoredServers when every server connected', () => {
    const report: RunReport = {
      connections: [perfectConnection],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report);
    expect(score?.unscoredServers).toEqual([]);
  });

  it('includes coverage, coveragePercent, and a disclaimer', () => {
    const report: RunReport = {
      connections: [perfectConnection],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report, allChecks);
    expect(score?.coverage.protocol).toBe('covered');
    expect(score?.coveragePercent).toBe(100);
    expect(score?.disclaimer).toBe(QUALITY_SCORE_DISCLAIMER);
  });

  it('reports reduced coveragePercent when only a subset of checks ran', () => {
    const report: RunReport = {
      connections: [perfectConnection],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report, [malformedSchemaCheck]);
    expect(score?.coveragePercent).toBeLessThan(100);
  });

  it('defaults to the full built-in check set for coverage when executedChecks is omitted', () => {
    const report: RunReport = {
      connections: [perfectConnection],
      diagnostics: [],
      summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
    };
    const score = computeReportQualityScore(report);
    expect(score?.coveragePercent).toBe(100);
  });
});

describe('checkMinimumScorePolicy', () => {
  const fullReport: RunReport = {
    connections: [perfectConnection],
    diagnostics: [],
    summary: { servers: 1, connected: 1, failed: 0, errors: 0, warnings: 0 },
  };

  it('produces no diagnostics when the score passes and coverage is complete', () => {
    const quality = computeReportQualityScore(fullReport, allChecks)!;
    expect(checkMinimumScorePolicy(quality, 50, 'perfect')).toEqual([]);
  });

  it('produces an error diagnostic when the score is below the minimum', () => {
    const quality = computeReportQualityScore(fullReport, allChecks)!;
    const results = checkMinimumScorePolicy(quality, 101, 'perfect');
    expect(results).toContainEqual(
      expect.objectContaining({ checkId: 'policy.minimum-quality-score', severity: 'error' }),
    );
  });

  it('produces a warning diagnostic (not an error) when coverage is incomplete, even if the score passes', () => {
    const quality = computeReportQualityScore(fullReport, [malformedSchemaCheck])!;
    const results = checkMinimumScorePolicy(quality, 50, 'perfect');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ checkId: 'policy.partial-coverage-with-minimum-score', severity: 'warning' });
    expect(results[0].message).toContain('not-covered');
  });

  it('produces both diagnostics when the score fails AND coverage is incomplete', () => {
    const quality = computeReportQualityScore(fullReport, [malformedSchemaCheck])!;
    const results = checkMinimumScorePolicy(quality, 101, 'perfect');
    expect(results.map((r) => r.checkId).sort()).toEqual([
      'policy.minimum-quality-score',
      'policy.partial-coverage-with-minimum-score',
    ]);
  });

  it('flags an unscored server even when overall coverage looks complete', () => {
    const report: RunReport = {
      connections: [
        perfectConnection,
        { server: { name: 'broken', transport: 'stdio' }, status: 'failed', error: { stage: 'spawn', message: 'x' } },
      ],
      diagnostics: [],
      summary: { servers: 2, connected: 1, failed: 1, errors: 0, warnings: 0 },
    };
    const quality = computeReportQualityScore(report, allChecks)!;
    const results = checkMinimumScorePolicy(quality, 50, 'perfect, broken');
    const warning = results.find((r) => r.checkId === 'policy.partial-coverage-with-minimum-score');
    expect(warning?.message).toContain('broken');
  });
});
