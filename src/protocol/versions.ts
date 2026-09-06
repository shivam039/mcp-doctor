/**
 * MCP protocol version support, centralized so it isn't scattered across
 * the transport implementation.
 *
 * Source of truth: the official MCP specification's versioned schema
 * directories, https://github.com/modelcontextprotocol/modelcontextprotocol/tree/main/schema
 * (checked directly rather than assumed — do not add a version here
 * without confirming it against that list).
 *
 * `SUPPORTED_PROTOCOL_VERSIONS` lists every version whose wire shape this
 * client's transport (an `initialize` request, a `notifications/initialized`
 * notification, then `tools/list`) can correctly speak. `2024-11-05`
 * through `2025-11-25` are additive on top of that same handshake model —
 * this client doesn't implement every feature each of them adds (OAuth
 * flows, icons, elicitation, tasks, ...), but it doesn't need to: it only
 * ever sends `initialize`/`notifications/initialized`/`tools/list`, and a
 * spec-compliant server response to those three calls has the same shape
 * across all four versions (any additive fields in between are safely
 * ignored by a client that never reads them).
 */
export const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
] as const;

export type SupportedProtocolVersion = (typeof SUPPORTED_PROTOCOL_VERSIONS)[number];

/** The version requested when the caller asks for "auto" (or specifies nothing). */
export const LATEST_SUPPORTED_PROTOCOL_VERSION: SupportedProtocolVersion = SUPPORTED_PROTOCOL_VERSIONS[0];

/**
 * Real MCP protocol versions that exist but use a wire shape this client
 * does not implement, keyed by version string, valued by why. Requesting
 * one of these fails fast with an explicit reason instead of attempting
 * (and inevitably failing) an `initialize` call the server was never going
 * to understand the way this client sends it.
 */
export const KNOWN_UNSUPPORTED_PROTOCOL_VERSIONS: Readonly<Record<string, string>> = {
  '2026-07-28':
    "removes the initialize/notifications-initialized handshake entirely in favor of a stateless " +
    "per-request model (a server/discover RPC, protocol version and capabilities carried per-request " +
    "in _meta fields) — a different wire protocol this client doesn't implement yet",
};

export function isSupportedProtocolVersion(version: string): version is SupportedProtocolVersion {
  return (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version);
}

/** Resolves a user-facing `--protocol-version` value ("auto" or a literal version) to the version to request. */
export function resolveRequestedProtocolVersion(preference: string | undefined): string {
  const trimmed = preference?.trim();
  if (!trimmed || trimmed === 'auto') {
    return LATEST_SUPPORTED_PROTOCOL_VERSION;
  }
  return trimmed;
}

export interface ProtocolVersionNegotiation {
  /** The protocolVersion this client sent in `initialize`. */
  requested: string;
  /** The protocolVersion the server returned in its `initialize` response, if it sent a valid one. */
  negotiated?: string;
  /** Whether `negotiated` is a version this client's transport can actually speak. */
  compatible: boolean;
}
