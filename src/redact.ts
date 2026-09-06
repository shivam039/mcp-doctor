/**
 * Secret redaction for anything that ends up in a report, diff, or log line.
 *
 * mcp-medic's `MCPServerConfig` can carry live credentials — HTTP headers
 * (`Authorization: Bearer ...`), stdio process env vars (`API_KEY=...`),
 * and OAuth `tokenRefreshBody` fields (`client_secret`, ...). None of that
 * should ever reach `--json`/`--export-json` output, `diff` output, or
 * `--verbose` logs verbatim — those are routinely pasted into CI logs,
 * issue trackers, and Slack.
 */

const REDACTED = '[REDACTED]';

/** Matches key names that conventionally carry secret values. Intentionally
 * broad — false positives (redacting a harmless key) are safe; false
 * negatives (leaking a secret) are not. */
const SECRET_KEY_PATTERN =
  /(authorization|auth|token|secret|password|passwd|pwd|api[-_]?key|apikey|cookie|credential|bearer|session|private[-_]?key|client[-_]?secret)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

/** Redacts values of secret-looking keys in a flat string-keyed record.
 * Non-secret keys (e.g. `Content-Type`, `NODE_ENV`) are left untouched so
 * the output stays useful for debugging. */
export function redactRecord(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) return record;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = isSecretKey(key) ? REDACTED : value;
  }
  return result;
}

/** Redacts secret-looking keys anywhere in an arbitrary JSON-like value
 * (objects/arrays nested to any depth). Used for loosely-typed structures
 * such as `tokenRefreshBody`. */
export function redactDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactDeep);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSecretKey(key) ? REDACTED : redactDeep(v);
    }
    return result;
  }
  return value;
}

/** Shape-preserving subset of `MCPServerConfig`'s secret-carrying fields —
 * kept local (rather than importing the real type) so this module has no
 * dependency on `types.ts` and can't accidentally widen what it touches. */
interface SanitizableServerConfig {
  headers?: Record<string, string>;
  env?: Record<string, string>;
  tokenRefreshBody?: Record<string, unknown>;
}

/** Returns a shallow copy of a server config with `headers`, `env`, and
 * `tokenRefreshBody` secret-looking values redacted. Safe to call before
 * a connection result is stored in a report or diff — no built-in check
 * reads these fields' values (only `name`/`transport`/`url`), so redacting
 * them here doesn't change diagnostic behavior. */
export function sanitizeServerConfig<T extends SanitizableServerConfig>(server: T): T {
  return {
    ...server,
    ...(server.headers !== undefined ? { headers: redactRecord(server.headers) } : {}),
    ...(server.env !== undefined ? { env: redactRecord(server.env) } : {}),
    ...(server.tokenRefreshBody !== undefined
      ? { tokenRefreshBody: redactDeep(server.tokenRefreshBody) as Record<string, unknown> }
      : {}),
  };
}
