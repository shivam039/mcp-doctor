import type { Check, MCPConnection, DiagnosticResult } from './types.js';

export interface ConformanceResult {
  pass: boolean;
  errors: string[];
}

const VALID_SEVERITIES = new Set(['error', 'warning', 'info']);

/**
 * Conformance test helper for community check packages (mcp-medic-check-*).
 * Validates that a Check implementation conforms strictly to CONTRACT.md.
 */
export async function runCheckConformanceSuite(check: Check): Promise<ConformanceResult> {
  const errors: string[] = [];

  // 1. Metadata validation
  if (!check.id || typeof check.id !== 'string' || check.id.trim() === '') {
    errors.push('Check must have a non-empty string `id`.');
  }

  if (!check.description || typeof check.description !== 'string' || check.description.trim() === '') {
    errors.push('Check must have a non-empty string `description`.');
  }

  if (typeof check.run !== 'function') {
    errors.push('Check must have a `run()` method.');
    return { pass: false, errors };
  }

  // 2. Test execution against clean connection
  const mockCleanConnection: MCPConnection = {
    server: { name: 'conformance-clean-server', transport: 'stdio' },
    status: 'connected',
    tools: [
      {
        name: 'sample_tool',
        description: 'A sample tool for testing.',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string', description: 'Sample input' },
          },
          required: ['input'],
        },
      },
    ],
  };

  try {
    const results = await check.run(mockCleanConnection);
    validateDiagnosticsShape(results, errors, 'clean connection');
  } catch (err) {
    errors.push(`Check threw uncaught exception on clean connection: ${String(err)}`);
  }

  // 3. Test execution against empty tools connection
  const mockEmptyToolsConnection: MCPConnection = {
    server: { name: 'conformance-empty-server', transport: 'stdio' },
    status: 'connected',
    tools: [],
  };

  try {
    const results = await check.run(mockEmptyToolsConnection);
    validateDiagnosticsShape(results, errors, 'empty tools connection');
  } catch (err) {
    errors.push(`Check threw uncaught exception on empty tools connection: ${String(err)}`);
  }

  // 4. Test execution against undefined tools connection
  const mockUndefinedToolsConnection: MCPConnection = {
    server: { name: 'conformance-undefined-server', transport: 'stdio' },
    status: 'connected',
  };

  try {
    const results = await check.run(mockUndefinedToolsConnection);
    validateDiagnosticsShape(results, errors, 'undefined tools connection');
  } catch (err) {
    errors.push(`Check threw uncaught exception on undefined tools connection: ${String(err)}`);
  }

  // 5. Test execution against throwing getter connection (error boundary test)
  const mockExplodingConnection = {
    server: { name: 'conformance-exploding-server', transport: 'stdio' },
    status: 'connected',
    get tools(): never {
      throw new Error('conformance simulated unexpected getter failure');
    },
  } as unknown as MCPConnection;

  try {
    const results = await check.run(mockExplodingConnection);
    validateDiagnosticsShape(results, errors, 'exploding getter connection');
  } catch (err) {
    errors.push(
      `Check threw uncaught exception when connection threw internally (must catch all errors in run()): ${String(err)}`,
    );
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}

function validateDiagnosticsShape(
  results: unknown,
  errors: string[],
  context: string,
): void {
  if (!Array.isArray(results)) {
    errors.push(`Check.run() must return an array of DiagnosticResult on ${context}, got ${typeof results}.`);
    return;
  }

  for (const d of results as DiagnosticResult[]) {
    if (!d || typeof d !== 'object') {
      errors.push(`Diagnostic entry is not an object on ${context}.`);
      continue;
    }
    if (!d.checkId || typeof d.checkId !== 'string') {
      errors.push(`Diagnostic missing valid \`checkId\` on ${context}.`);
    }
    if (!d.severity || !VALID_SEVERITIES.has(d.severity)) {
      errors.push(`Diagnostic has invalid \`severity\` "${String(d.severity)}" on ${context}.`);
    }
    if (!d.message || typeof d.message !== 'string') {
      errors.push(`Diagnostic missing valid \`message\` string on ${context}.`);
    }
    if (!d.serverName || typeof d.serverName !== 'string') {
      errors.push(`Diagnostic missing valid \`serverName\` string on ${context}.`);
    }
  }
}
