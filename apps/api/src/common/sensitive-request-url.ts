const CHARACTER_SHARE_TOKEN_IN_PATH =
  /(\/(?:character-shares|share\/characters)\/)[A-Za-z0-9_-]{43}(?=\/|[?#]|$)/g;

export function redactSensitiveRequestUrl(url: string | undefined): string | undefined {
  return url?.replace(CHARACTER_SHARE_TOKEN_IN_PATH, '$1[REDACTED]');
}
