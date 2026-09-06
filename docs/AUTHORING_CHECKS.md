# Authoring Custom Checks for mcp-doctor

This guide explains how to write, test, and distribute custom check plugins for `mcp-doctor`.

## Check Architecture

Every check implements the frozen `Check` interface from `mcp-doctor`:

```ts
import type { Check, MCPConnection, DiagnosticResult } from 'mcp-doctor';

export const noEmptyEnumCheck: Check = {
  id: 'community.no-empty-enums',
  description: 'Ensures enum arrays on tool schema properties contain at least one option.',
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      if (!connection.tools) return results;

      for (const tool of connection.tools) {
        const schema = tool.inputSchema as Record<string, unknown> | undefined;
        if (!schema || typeof schema !== 'object') continue;

        const properties = schema.properties as Record<string, unknown> | undefined;
        if (!properties) continue;

        for (const [propName, propDef] of Object.entries(properties)) {
          if (propDef && typeof propDef === 'object') {
            const p = propDef as Record<string, unknown>;
            if (Array.isArray(p.enum) && p.enum.length === 0) {
              results.push({
                checkId: 'community.no-empty-enums',
                severity: 'error',
                message: `Property "${propName}" in tool "${tool.name}" declares an empty enum [].`,
                serverName: connection.server.name,
                toolName: tool.name,
                suggestedFix: {
                  description: `Provide at least one allowed value in enum for property "${propName}".`,
                },
              });
            }
          }
        }
      }
    } catch (err) {
      // NON-NEGOTIABLE: Never let an exception escape run()
      results.push({
        checkId: 'community.no-empty-enums',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
```

---

## Non-Negotiable Contract Rules

1. **Never Throw**: `Check.run()` must catch all internal exceptions and return an `error`-severity diagnostic instead of throwing.
2. **No Shared State**: Checks must be pure functions operating only on the provided `MCPConnection` object without mutating global module variables.
3. **Structured Diagnostic Output**: Every `DiagnosticResult` must provide:
   - `checkId`: namespaced identifier (e.g. `community.my-check` or `org.rule-name`)
   - `severity`: `'error' | 'warning' | 'info'`
   - `message`: Clear, one-line summary
   - `serverName`: `connection.server.name`
   - `suggestedFix` (recommended): `{ description: string, patch?: unknown }`

---

## Verifying Compliance with the Conformance Suite

Use the built-in `runCheckConformanceSuite` helper in your test suite:

```ts
import { describe, it, expect } from 'vitest';
import { runCheckConformanceSuite } from 'mcp-doctor';
import { noEmptyEnumCheck } from './no-empty-enums.js';

describe('noEmptyEnumCheck conformance', () => {
  it('conforms strictly to mcp-doctor check interface', async () => {
    const result = await runCheckConformanceSuite(noEmptyEnumCheck);
    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
  });
});
```

---

## Package Naming & Distribution

Publish your package to npm using the `mcp-doctor-check-*` naming convention:

```bash
npm install -D mcp-doctor-check-strict-types
```
