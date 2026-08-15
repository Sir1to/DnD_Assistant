import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compress: true,
  output: 'standalone',
  poweredByHeader: false,
  transpilePackages: ['@fog-of-lore/contracts', '@fog-of-lore/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
          },
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
