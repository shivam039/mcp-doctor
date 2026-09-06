import type { Check, MCPConnection, DiagnosticResult } from '../types.js';

export const DEFAULT_MAX_TOOLS_WARNING_THRESHOLD = 100;

function normalizeForSimilarity(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Factory rather than a static Check, so the tool-count threshold can be
 * overridden by policy (see `policy.ts`'s `quality.maxTools`) without
 * needing a second, parallel check — same pattern `createPolicyChecks`
 * already uses for configurable org rules.
 */
export function createToolSurfaceCheck(options: { maxTools?: number } = {}): Check {
  const maxTools = options.maxTools ?? DEFAULT_MAX_TOOLS_WARNING_THRESHOLD;

  return {
    id: 'quality.tool-surface',
    description: `Flags excessive tool counts (default warning threshold: ${DEFAULT_MAX_TOOLS_WARNING_THRESHOLD}) and near-duplicate tool names/descriptions.`,
    run(connection: MCPConnection): DiagnosticResult[] {
      const results: DiagnosticResult[] = [];
      try {
        const tools = connection.tools;
        if (!tools || !Array.isArray(tools) || tools.length === 0) {
          return results;
        }

        if (tools.length > maxTools) {
          results.push({
            checkId: 'quality.tool-surface',
            severity: 'warning',
            message: `Server exposes ${tools.length} tools, exceeding the ${maxTools}-tool threshold. Large tool surfaces can increase agent/tool-selection complexity.`,
            serverName: connection.server.name,
            category: 'quality',
            details: { toolCount: tools.length, threshold: maxTools },
            suggestedFix: {
              description: 'Consider splitting this server, consolidating overlapping tools, or raising the policy threshold if this is intentional.',
            },
          });
        }

        // Near-duplicate names: same normalized form but not byte-identical.
        // (Exact duplicates are quality.tool-name's job.)
        const byNormalized = new Map<string, string[]>();
        for (const tool of tools) {
          const key = normalizeForSimilarity(tool.name);
          if (!key) continue;
          const group = byNormalized.get(key) ?? [];
          group.push(tool.name);
          byNormalized.set(key, group);
        }
        for (const group of byNormalized.values()) {
          const distinct = [...new Set(group)];
          if (distinct.length > 1) {
            results.push({
              checkId: 'quality.tool-surface',
              severity: 'warning',
              message: `Tools ${distinct.map((n) => `"${n}"`).join(', ')} have near-identical names — this can confuse tool selection.`,
              serverName: connection.server.name,
              category: 'quality',
              details: { similarNames: distinct },
              suggestedFix: { description: 'Rename these tools to be clearly distinct from one another.' },
            });
          }
        }

        // Repeated, non-trivial descriptions shared by 3+ tools.
        const byDescription = new Map<string, string[]>();
        for (const tool of tools) {
          const desc = tool.description?.trim();
          if (!desc || desc.length < 15) continue; // trivial/short strings collide legitimately
          const names = byDescription.get(desc) ?? [];
          names.push(tool.name);
          byDescription.set(desc, names);
        }
        for (const [desc, names] of byDescription) {
          if (names.length >= 3) {
            results.push({
              checkId: 'quality.tool-surface',
              severity: 'warning',
              message: `${names.length} tools (${names.map((n) => `"${n}"`).join(', ')}) share the exact same description — each tool should describe its own specific behavior.`,
              serverName: connection.server.name,
              category: 'quality',
              details: { sharedDescription: desc, toolNames: names },
              suggestedFix: { description: 'Write a distinct, specific description for each of these tools.' },
            });
          }
        }
      } catch (err) {
        results.push({
          checkId: 'quality.tool-surface',
          severity: 'error',
          message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
          serverName: connection.server.name,
          category: 'quality',
        });
      }
      return results;
    },
  };
}

/** Default instance (threshold 100) for the standard `allChecks` list. */
export const qualityToolSurfaceCheck: Check = createToolSurfaceCheck();
