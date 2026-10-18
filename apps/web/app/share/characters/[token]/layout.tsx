import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Карточка персонажа — Fog of Lore',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default function SharedCharacterLayout({ children }: { children: ReactNode }) {
  return children;
}
