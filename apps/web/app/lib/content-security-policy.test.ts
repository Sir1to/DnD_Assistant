import { describe, expect, it } from 'vitest';

import { createContentSecurityPolicy } from './content-security-policy';

describe('createContentSecurityPolicy', () => {
  it('creates a strict production policy for the page and configured API origins', () => {
    const policy = createContentSecurityPolicy('request_nonce-123', {
      apiUrl: 'https://table.example.test/api',
      isDevelopment: false,
      requestUrl: 'https://table.example.test/campaigns/example',
    });

    expect(policy).toContain("script-src 'self' 'nonce-request_nonce-123' 'strict-dynamic';");
    expect(policy).toContain("script-src-attr 'none';");
    expect(policy).toContain("style-src 'self' 'nonce-request_nonce-123';");
    expect(policy).toContain("style-src-attr 'unsafe-inline';");
    expect(policy).toContain(
      "connect-src 'self' https://table.example.test wss://table.example.test;",
    );
    expect(policy).toContain('upgrade-insecure-requests;');
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toMatch(/[\r\n]/);
  });

  it('allows only the development evaluator and configured local socket origins', () => {
    const policy = createContentSecurityPolicy('local-nonce', {
      apiUrl: 'http://localhost:4000/api',
      isDevelopment: true,
      requestUrl: 'http://localhost:3000/login',
    });

    expect(policy).toContain(
      "script-src 'self' 'nonce-local-nonce' 'strict-dynamic' 'unsafe-eval';",
    );
    expect(policy).toContain(
      "connect-src 'self' http://localhost:3000 http://localhost:4000 ws://localhost:3000 ws://localhost:4000;",
    );
    expect(policy).not.toContain('upgrade-insecure-requests');
  });

  it('does not interpolate invalid nonce characters into a header', () => {
    expect(() =>
      createContentSecurityPolicy('bad;<nonce>', {
        apiUrl: 'http://localhost:4000/api',
        isDevelopment: true,
        requestUrl: 'http://localhost:3000',
      }),
    ).toThrow('CSP nonce contains unsupported characters');
  });
});
