import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Check, MCPConnection, DiagnosticResult, TransportType } from './types.js';

export interface MCPMedicPolicy {
  bannedTransports?: TransportType[];
  allowedDomains?: string[];
  minDescriptionLength?: number;
  /** @deprecated use `quality.requireToolDescriptions` — kept for backward compatibility, same effect. */
  requireToolDescriptions?: boolean;
  quality?: {
    /** Gate: `check`/`check-all` fail (an error diagnostic is added) if the computed MCP quality score falls below this. */
    minimumScore?: number;
    /** Overrides quality.tool-surface's default 100-tool warning threshold with an org-enforced error threshold. */
    maxTools?: number;
    /** Same effect as the top-level (deprecated) `requireToolDescriptions`; this nested form takes precedence if both are set. */
    requireToolDescriptions?: boolean;
  };
}

export type MCPDoctorPolicy = MCPMedicPolicy;

/**
 * Loads a policy from a file path, or auto-discovers .mcp-medic-policy.json (or .mcp-doctor-policy.json) in cwd.
 */
export function loadPolicy(
  policyPath?: string,
  cwd: string = process.cwd(),
): MCPMedicPolicy | undefined {
  let targetPath = policyPath ? resolve(policyPath) : resolve(cwd, '.mcp-medic-policy.json');
  if (!policyPath && !existsSync(targetPath)) {
    const fallbackPath = resolve(cwd, '.mcp-doctor-policy.json');
    if (existsSync(fallbackPath)) {
      targetPath = fallbackPath;
    }
  }

  if (!existsSync(targetPath)) {
    return undefined;
  }

  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = JSON.parse(raw) as MCPMedicPolicy;
    return parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse policy file at ${targetPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Creates composable Check instances from an organization policy.
 * Policy checks seamlessly integrate with the standard Check interface.
 */
export function createPolicyChecks(policy: MCPDoctorPolicy): Check[] {
  const checks: Check[] = [];

  // 1. Banned transport check
  if (policy.bannedTransports && policy.bannedTransports.length > 0) {
    const banned = new Set(policy.bannedTransports);
    checks.push({
      id: 'policy.banned-transport',
      description: 'Enforces organizational policies on allowed connection transports.',
      run(connection: MCPConnection): DiagnosticResult[] {
        const results: DiagnosticResult[] = [];
        try {
          if (banned.has(connection.server.transport)) {
            results.push({
              checkId: 'policy.banned-transport',
              severity: 'error',
              message: `Transport "${connection.server.transport}" is banned by organizational policy.`,
              serverName: connection.server.name,
              details: {
                transport: connection.server.transport,
                bannedTransports: Array.from(banned),
              },
              suggestedFix: {
                description: `Migrate server "${connection.server.name}" to an allowed transport.`,
              },
            });
          }
        } catch (err) {
          results.push({
            checkId: 'policy.banned-transport',
            severity: 'error',
            message: `policy check failed internally: ${err instanceof Error ? err.message : String(err)}`,
            serverName: connection.server.name,
          });
        }
        return results;
      },
    });
  }

  // 2. Allowed domain allowlist check
  if (policy.allowedDomains && policy.allowedDomains.length > 0) {
    const allowed = policy.allowedDomains.map((d) => d.toLowerCase());
    checks.push({
      id: 'policy.domain-allowlist',
      description: 'Ensures remote SSE/HTTP servers connect only to approved domains.',
      run(connection: MCPConnection): DiagnosticResult[] {
        const results: DiagnosticResult[] = [];
        try {
          if (connection.server.url) {
            const parsedUrl = new URL(connection.server.url);
            const hostname = parsedUrl.hostname.toLowerCase();
            const isAllowed = allowed.some(
              (dom) => hostname === dom || hostname.endsWith(`.${dom}`),
            );

            if (!isAllowed) {
              results.push({
                checkId: 'policy.domain-allowlist',
                severity: 'error',
                message: `Server URL domain "${hostname}" is not in organizational allowlist [${allowed.join(', ')}].`,
                serverName: connection.server.name,
                details: { hostname, allowedDomains: allowed, url: connection.server.url },
                suggestedFix: {
                  description: `Configure server "${connection.server.name}" to use an approved domain or update policy configuration.`,
                },
              });
            }
          }
        } catch (err) {
          results.push({
            checkId: 'policy.domain-allowlist',
            severity: 'error',
            message: `policy check failed internally: ${err instanceof Error ? err.message : String(err)}`,
            serverName: connection.server.name,
          });
        }
        return results;
      },
    });
  }

  // 3. Minimum description length check
  if (typeof policy.minDescriptionLength === 'number' && policy.minDescriptionLength > 0) {
    const minLen = policy.minDescriptionLength;
    checks.push({
      id: 'policy.description-length',
      description: `Enforces minimum tool description length of ${minLen} characters.`,
      run(connection: MCPConnection): DiagnosticResult[] {
        const results: DiagnosticResult[] = [];
        try {
          if (!connection.tools) return results;

          for (const tool of connection.tools) {
            const desc = tool.description?.trim() || '';
            if (desc.length < minLen) {
              results.push({
                checkId: 'policy.description-length',
                severity: 'warning',
                message: `Tool "${tool.name}" description is too brief (${desc.length} chars, policy requires minimum ${minLen}).`,
                serverName: connection.server.name,
                toolName: tool.name,
                details: { currentLength: desc.length, requiredLength: minLen },
                suggestedFix: {
                  description: `Expand tool "${tool.name}" description to at least ${minLen} characters to assist model tool selection.`,
                },
              });
            }
          }
        } catch (err) {
          results.push({
            checkId: 'policy.description-length',
            severity: 'error',
            message: `policy check failed internally: ${err instanceof Error ? err.message : String(err)}`,
            serverName: connection.server.name,
          });
        }
        return results;
      },
    });
  }

  // 4. Require tool descriptions (nested quality.requireToolDescriptions takes
  // precedence over the deprecated top-level field; either enables this).
  const requireToolDescriptions = policy.quality?.requireToolDescriptions ?? policy.requireToolDescriptions;
  if (requireToolDescriptions) {
    checks.push({
      id: 'policy.require-tool-descriptions',
      description: 'Organizational policy: every tool must have a non-empty description.',
      run(connection: MCPConnection): DiagnosticResult[] {
        const results: DiagnosticResult[] = [];
        try {
          if (!connection.tools) return results;
          for (const tool of connection.tools) {
            if (!tool.description || tool.description.trim() === '') {
              results.push({
                checkId: 'policy.require-tool-descriptions',
                severity: 'error',
                message: `Tool "${tool.name}" has no description — organizational policy requires one.`,
                serverName: connection.server.name,
                toolName: tool.name,
                category: 'configuration',
                suggestedFix: { description: `Add a description to tool "${tool.name}".` },
              });
            }
          }
        } catch (err) {
          results.push({
            checkId: 'policy.require-tool-descriptions',
            severity: 'error',
            message: `policy check failed internally: ${err instanceof Error ? err.message : String(err)}`,
            serverName: connection.server.name,
          });
        }
        return results;
      },
    });
  }

  // 5. Max tools (org-enforced hard limit; distinct from quality.tool-surface's
  // default 100-tool *warning*, which stays a recommendation, not a policy gate).
  if (typeof policy.quality?.maxTools === 'number' && policy.quality.maxTools > 0) {
    const maxTools = policy.quality.maxTools;
    checks.push({
      id: 'policy.max-tools',
      description: `Organizational policy: a server may expose at most ${maxTools} tools.`,
      run(connection: MCPConnection): DiagnosticResult[] {
        const results: DiagnosticResult[] = [];
        try {
          const count = connection.tools?.length ?? 0;
          if (count > maxTools) {
            results.push({
              checkId: 'policy.max-tools',
              severity: 'error',
              message: `Server exposes ${count} tools, exceeding organizational policy limit of ${maxTools}.`,
              serverName: connection.server.name,
              category: 'configuration',
              details: { toolCount: count, maxTools },
            });
          }
        } catch (err) {
          results.push({
            checkId: 'policy.max-tools',
            severity: 'error',
            message: `policy check failed internally: ${err instanceof Error ? err.message : String(err)}`,
            serverName: connection.server.name,
          });
        }
        return results;
      },
    });
  }

  return checks;
}
