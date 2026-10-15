import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compress: true,
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_VERSION ?? '0.1.0',
    NEXT_PUBLIC_APP_COMMIT:
      process.env.NEXT_PUBLIC_APP_COMMIT ??
      process.env.APP_COMMIT ??
      process.env.GITHUB_SHA ??
      'development',
    NEXT_PUBLIC_APP_BUILD_TIME:
      process.env.NEXT_PUBLIC_APP_BUILD_TIME ?? process.env.APP_BUILD_TIME ?? '',
  },
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@fog-of-lore/contracts', '@fog-of-lore/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
