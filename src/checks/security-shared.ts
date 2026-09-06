/**
 * All security.* checks are heuristic pattern-matching over what a server
 * *declares* (config URL, tool descriptions, tool schemas) — they cannot
 * see what a server actually does. Every diagnostic they emit must say so
 * (FR3-2.4): this is not a substitute for reading a third-party MCP
 * server's source before trusting it.
 */
export const HEURISTIC_DISCLAIMER =
  "heuristic flag, not a guarantee — review this server's source before trusting it";
