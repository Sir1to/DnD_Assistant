import type { Metadata, Viewport } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { resolveTheme, themeStyle } from '@fog-of-lore/ui';

import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Fog of Lore — мастерская игровой сессии',
  description: 'Self-hosted доска мастера настольных ролевых игр.',
};

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#171b17',
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Request-scoped rendering is required so Next.js can apply the CSP nonce from proxy.ts.
  await connection();

  return (
    <html data-theme="tavern" lang="ru" style={themeStyle(resolveTheme('tavern'))}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
