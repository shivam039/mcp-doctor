import type { Check, MCPConnection, DiagnosticResult } from '../types.js';
import { HEURISTIC_DISCLAIMER } from './security-shared.js';

function toHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://');
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);

function isIpLiteralHost(hostname: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true; // IPv4
  if (hostname.includes(':') && /^[0-9a-fA-F:]+$/.test(hostname)) return true; // IPv6 (URL strips brackets)
  return false;
}

export const securityUntrustedRemoteCheck: Check = {
  id: 'security.untrusted-remote',
  description: `For SSE/HTTP servers, flags non-HTTPS URLs or raw IP-address hosts instead of domain names (${HEURISTIC_DISCLAIMER}).`,
  run(connection: MCPConnection): DiagnosticResult[] {
    const results: DiagnosticResult[] = [];
    try {
      const { server } = connection;
      if (server.transport !== 'sse' && server.transport !== 'http') return results;
      if (typeof server.url !== 'string' || server.url.length === 0) return results;

      let parsed: URL;
      try {
        parsed = new URL(server.url);
      } catch {
        return results; // malformed URLs are the config-loader/protocol layer's concern, not this check's
      }

      if (parsed.protocol === 'http:') {
        results.push({
          checkId: 'security.untrusted-remote',
          severity: 'warning',
          message:
            `Server "${server.name}" connects over unencrypted "http://"; requests, responses, and any headers ` +
            `(including auth tokens) travel in plaintext. Not blocking — legitimate local dev configs exist. ` +
            `(${HEURISTIC_DISCLAIMER})`,
          serverName: server.name,
          details: { url: server.url, reason: 'non-https' },
          suggestedFix: {
            description: `Switch to "${toHttps(server.url)}" if the server supports TLS.`,
            patch: { serverName: server.name, set: { url: toHttps(server.url) } },
          },
        });
      }

      if (isIpLiteralHost(parsed.hostname) && !LOOPBACK_HOSTS.has(parsed.hostname)) {
        results.push({
          checkId: 'security.untrusted-remote',
          severity: 'warning',
          message:
            `Server "${server.name}" points at a raw IP address ("${parsed.hostname}") instead of a domain name, ` +
            `making it hard to verify who actually operates the endpoint or notice if it changes hands. ` +
            `Not blocking — legitimate local dev configs exist. (${HEURISTIC_DISCLAIMER})`,
          serverName: server.name,
          details: { url: server.url, reason: 'ip-literal-host' },
          suggestedFix: {
            description: 'Point this server at a stable domain name you control or trust, if one is available.',
          },
        });
      }
    } catch (err) {
      results.push({
        checkId: 'security.untrusted-remote',
        severity: 'error',
        message: `check failed internally: ${err instanceof Error ? err.message : String(err)}`,
        serverName: connection.server.name,
      });
    }
    return results;
  },
};
