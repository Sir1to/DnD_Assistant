import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { createContentSecurityPolicy } from './app/lib/content-security-policy';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

export function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID();
  const contentSecurityPolicy = createContentSecurityPolicy(nonce, {
    apiUrl,
    isDevelopment: process.env.NODE_ENV !== 'production',
    requestUrl: request.url,
  });
  const requestHeaders = new Headers(request.headers);

  // Next.js reads both headers while rendering and applies the nonce to its own scripts.
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set('Content-Security-Policy', contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|assets/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
