const SAFE_NONCE = /^[A-Za-z0-9_-]+$/;

export interface ContentSecurityPolicyOptions {
  apiUrl: string;
  isDevelopment: boolean;
  requestUrl: string;
}

function originFor(value: string): URL | undefined {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return undefined;
    }

    return url;
  } catch {
    return undefined;
  }
}

function websocketOrigin(url: URL): string {
  const websocketUrl = new URL(url.origin);
  websocketUrl.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return websocketUrl.origin;
}

function uniqueSources(sources: Array<string | undefined>): string {
  return [...new Set(sources.filter((source): source is string => Boolean(source)))].join(' ');
}

export function createContentSecurityPolicy(
  nonce: string,
  { apiUrl, isDevelopment, requestUrl }: ContentSecurityPolicyOptions,
): string {
  if (!SAFE_NONCE.test(nonce)) {
    throw new Error('CSP nonce contains unsupported characters');
  }

  const requestOrigin = originFor(requestUrl);
  const apiOrigin = originFor(apiUrl);
  const httpSources = uniqueSources([requestOrigin?.origin, apiOrigin?.origin]);
  const websocketSources = uniqueSources([
    requestOrigin ? websocketOrigin(requestOrigin) : undefined,
    apiOrigin ? websocketOrigin(apiOrigin) : undefined,
  ]);
  const nonceSource = `'nonce-${nonce}'`;
  const directives = [
    `default-src 'self'`,
    `script-src 'self' ${nonceSource} 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ''}`,
    `script-src-attr 'none'`,
    `style-src 'self' ${nonceSource}`,
    // The tactical table positions and themes elements with React style attributes.
    `style-src-attr 'unsafe-inline'`,
    `img-src 'self' data: blob:${httpSources ? ` ${httpSources}` : ''}`,
    `font-src 'self'`,
    `connect-src 'self'${httpSources ? ` ${httpSources}` : ''}${
      websocketSources ? ` ${websocketSources}` : ''
    }`,
    `media-src 'self' blob:${httpSources ? ` ${httpSources}` : ''}`,
    `worker-src 'self' blob:`,
    `manifest-src 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ];

  if (!isDevelopment) {
    directives.push('upgrade-insecure-requests');
  }

  return `${directives.join('; ')};`;
}
