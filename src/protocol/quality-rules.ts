/**
 * Protocol-version-aware quality rules.
 *
 * Some things a quality check might flag are genuine protocol violations
 * for a given negotiated MCP version (hard requirement/prohibition); others
 * are ecosystem recommendations that happen to be entirely valid per spec.
 * Mixing these up means a check can wrongly call a style preference a
 * "protocol violation," or (worse) miss a real one because the version
 * that defines it was never consulted.
 *
 * This module is the single place that answers "does this negotiated
 * version define a hard constraint here?" so quality checks don't each
 * have to know MCP spec history — and so a future protocol version that
 * *does* add a constraint only needs a new entry here, not a rewrite of
 * every check that uses it.
 *
 * Current state of research (see src/protocol/versions.ts for the same
 * source): every version in SUPPORTED_PROTOCOL_VERSIONS (2024-11-05
 * through 2025-11-25) defines `Tool.name` as a plain `string` with no
 * documented length or character-pattern constraint. So today, every
 * version returns the same (empty) rule set — this module exists for the
 * abstraction, not because any current version actually differs from
 * another.
 */

export interface ToolNameProtocolRules {
  /** A hard maximum length the negotiated version's spec actually defines
   * for `Tool.name`, if any. Exceeding it is a protocol violation, not a
   * style recommendation. `undefined` = the spec defines no such limit for
   * this version — length-based feedback should be a quality warning, not
   * an error. */
  maxLength?: number;
  /** A hard character-pattern the negotiated version's spec actually
   * requires `Tool.name` to match, if any. `undefined` = no such
   * constraint — character-based feedback should be a quality warning. */
  pattern?: RegExp;
}

export interface ProtocolQualityRules {
  toolName: ToolNameProtocolRules;
}

/** No currently-supported MCP version defines a hard length/pattern
 * constraint on Tool.name — see the module doc comment. */
const NO_HARD_CONSTRAINTS: ProtocolQualityRules = { toolName: {} };

/**
 * Returns the protocol-defined (hard) quality rules for a negotiated MCP
 * version. `version` is normally `MCPConnection.protocolVersion.negotiated`.
 * An unknown or absent version gets the same "no hard constraints" rules
 * as every currently-supported version, rather than guessing.
 */
export function getProtocolQualityRules(version: string | undefined): ProtocolQualityRules {
  void version; // reserved for when a supported version actually defines a constraint
  return NO_HARD_CONSTRAINTS;
}
