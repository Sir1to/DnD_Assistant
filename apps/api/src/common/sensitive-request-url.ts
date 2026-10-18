const CHARACTER_SHARE_TOKEN_IN_PATH =
  /(\/(?:character-shares|share\/characters)\/)[A-Za-z0-9_-]{43}(?=\/|[?#]|$)/g;
const CHARACTER_SHARE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function redactSensitiveRequestUrl(url: string | undefined): string | undefined {
  return url?.replace(CHARACTER_SHARE_TOKEN_IN_PATH, '$1[REDACTED]');
}

export function redactSensitiveRequestParams(value: unknown): unknown {
  if (typeof value === 'string') {
    return CHARACTER_SHARE_TOKEN.test(value) ? '[REDACTED]' : redactSensitiveRequestUrl(value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitiveRequestParams(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSensitiveRequestParams(item)]),
    );
  }
  return value;
}
