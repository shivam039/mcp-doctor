/**
 * Pure logic for `mcp-doctor fix`: applying a DiagnosticResult's
 * `suggestedFix.patch` to the raw (untyped) config JSON that was read from
 * disk. Deliberately has no file I/O or prompting — see src/cli.ts for the
 * interactive `fix` command that wires this up to reads/writes/confirmation.
 *
 * `SuggestedFix.patch` is typed `unknown` in CONTRACT.md so any check can
 * carry one without a CONTRACT change; this module defines and validates
 * the one shape mcp-doctor's own checks emit and `fix` knows how to apply:
 * a named-server, shallow field patch.
 */

export interface ConfigPatch {
  /** Matches MCPServerConfig.name / config.servers[i].name in the raw JSON. */
  serverName: string;
  /** Shallow field values to merge into that server's raw config object. */
  set: Record<string, unknown>;
}

export function isConfigPatch(value: unknown): value is ConfigPatch {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.serverName === 'string' &&
    v.serverName.length > 0 &&
    typeof v.set === 'object' &&
    v.set !== null &&
    !Array.isArray(v.set)
  );
}

export interface RawMcpConfig {
  servers: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export function isRawMcpConfig(value: unknown): value is RawMcpConfig {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as Record<string, unknown>).servers)
  );
}

function findServer(config: RawMcpConfig, serverName: string): Record<string, unknown> | undefined {
  return config.servers.find(
    (s) => typeof s === 'object' && s !== null && !Array.isArray(s) && (s as Record<string, unknown>).name === serverName,
  ) as Record<string, unknown> | undefined;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Computes what a patch would change, without mutating `rawConfig`.
 * Returns [] when the target server can't be found, or when every field in
 * `patch.set` already matches — i.e. the config is already fixed. This is
 * what makes `fix` idempotent: applying an already-applied patch is a no-op
 * with nothing to confirm.
 */
export function diffConfigPatch(rawConfig: unknown, patch: ConfigPatch): FieldDiff[] {
  if (!isRawMcpConfig(rawConfig)) return [];
  const server = findServer(rawConfig, patch.serverName);
  if (!server) return [];

  const diffs: FieldDiff[] = [];
  for (const [field, after] of Object.entries(patch.set)) {
    const before = server[field];
    if (!deepEqual(before, after)) {
      diffs.push({ field, before, after });
    }
  }
  return diffs;
}

/**
 * Returns a new raw config with `patch.set` fields merged into the named
 * server. Never mutates `rawConfig`. Throws only on a structurally invalid
 * config (not a config-shaped object) — callers should have already run it
 * through loadConfig() before ever reaching a patch.
 */
export function applyConfigPatch(rawConfig: unknown, patch: ConfigPatch): RawMcpConfig {
  if (!isRawMcpConfig(rawConfig)) {
    throw new Error('applyConfigPatch: expected a config object with a "servers" array');
  }
  return {
    ...rawConfig,
    servers: rawConfig.servers.map((s) => {
      if (typeof s === 'object' && s !== null && !Array.isArray(s) && (s as Record<string, unknown>).name === patch.serverName) {
        return { ...(s as Record<string, unknown>), ...patch.set };
      }
      return s;
    }),
  };
}

export function formatFieldDiff(diff: FieldDiff): string {
  return `  - ${diff.field}: ${JSON.stringify(diff.before)}\n  + ${diff.field}: ${JSON.stringify(diff.after)}`;
}
