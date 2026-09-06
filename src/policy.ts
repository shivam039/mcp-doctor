import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Check, MCPConnection, DiagnosticResult, TransportType } from './types.js';

export interface MCPMedicPolicy {
  bannedTransports?: TransportType[];
  allowedDomains?: string[];
  minDescriptionLength?: number;
  requireToolDescriptions?: boolean;
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

  return checks;
}
