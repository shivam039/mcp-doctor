import { describe, expect, it } from 'vitest';
import { isSecretKey, redactRecord, redactDeep, sanitizeServerConfig } from '../src/redact.js';

describe('isSecretKey', () => {
  it('flags common secret-carrying key names, case-insensitively', () => {
    for (const key of [
      'Authorization',
      'authorization',
      'X-Api-Key',
      'apiKey',
      'API_KEY',
      'Cookie',
      'client_secret',
      'password',
      'Bearer',
      'PRIVATE_KEY',
    ]) {
      expect(isSecretKey(key)).toBe(true);
    }
  });

  it('does not flag ordinary key names', () => {
    for (const key of ['Content-Type', 'Accept', 'NODE_ENV', 'PORT', 'name', 'url']) {
      expect(isSecretKey(key)).toBe(false);
    }
  });
});

describe('redactRecord', () => {
  it('redacts only secret-looking values, leaving the rest intact', () => {
    const result = redactRecord({
      Authorization: 'Bearer sk-supersecret',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual({ Authorization: '[REDACTED]', 'Content-Type': 'application/json' });
  });

  it('passes through undefined', () => {
    expect(redactRecord(undefined)).toBeUndefined();
  });
});

describe('redactDeep', () => {
  it('redacts secret keys at any nesting depth', () => {
    const result = redactDeep({
      grant_type: 'client_credentials',
      client_secret: 'sekret',
      nested: { refresh_token: 'abc', ok: 1 },
      list: [{ password: 'x' }, { fine: 'y' }],
    });
    expect(result).toEqual({
      grant_type: 'client_credentials',
      client_secret: '[REDACTED]',
      nested: { refresh_token: '[REDACTED]', ok: 1 },
      list: [{ password: '[REDACTED]' }, { fine: 'y' }],
    });
  });
});

describe('sanitizeServerConfig', () => {
  it('redacts headers, env, and tokenRefreshBody secret values without mutating the input', () => {
    const server = {
      name: 'remote',
      transport: 'http' as const,
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer xyz', Accept: 'application/json' },
      env: { API_KEY: 'sk-live-123', NODE_ENV: 'production' },
      tokenRefreshBody: { client_secret: 'shh', grant_type: 'refresh_token' },
    };
    const sanitized = sanitizeServerConfig(server);

    expect(sanitized.headers).toEqual({ Authorization: '[REDACTED]', Accept: 'application/json' });
    expect(sanitized.env).toEqual({ API_KEY: '[REDACTED]', NODE_ENV: 'production' });
    expect(sanitized.tokenRefreshBody).toEqual({
      client_secret: '[REDACTED]',
      grant_type: 'refresh_token',
    });
    // Non-secret fields pass through untouched.
    expect(sanitized.name).toBe('remote');
    expect(sanitized.url).toBe('https://example.com/mcp');
    // The original object is never mutated — callers may still need real values.
    expect(server.headers.Authorization).toBe('Bearer xyz');
  });

  it('leaves servers with no secret-carrying fields untouched', () => {
    const server = { name: 'local', transport: 'stdio' as const, command: 'node' };
    expect(sanitizeServerConfig(server)).toEqual(server);
  });
});
