'use client';

import type { CampaignRole } from '@fog-of-lore/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { BuildStamp } from './build-stamp';
import { useTheme } from './theme-provider';

export function CampaignNavigation({
  campaignId,
  role,
}: {
  campaignId: string;
  role: CampaignRole;
}) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const links = [
    {
      href: `/campaigns/${campaignId}`,
      label: 'Доска',
      icon: '⌗',
      active: pathname === `/campaigns/${campaignId}`,
    },
    {
      href: `/campaigns/${campaignId}/lore`,
      label: 'Альманах',
      icon: '◇',
      active: pathname.endsWith('/lore'),
    },
    {
      href: `/campaigns/${campaignId}/battle`,
      label: 'Поле боя',
      icon: '▦',
      active: pathname.endsWith('/battle'),
    },
    {
      href: `/campaigns/${campaignId}/characters`,
      label: 'Персонажи',
      icon: '♙',
      active: pathname.endsWith('/characters'),
    },
    {
      href: `/campaigns/${campaignId}/reference`,
      label: 'Справочник',
      icon: '≡',
      active: pathname.endsWith('/reference'),
    },
    {
      href: `/campaigns/${campaignId}/messages`,
      label: 'Беседы',
      icon: '✉',
      active: pathname.endsWith('/messages'),
    },
  ];

  return (
    <nav className="campaign-navigation" aria-label="Навигация кампании">
      <Link className="campaign-navigation-brand" href="/dashboard">
        <span aria-hidden="true">F</span>Fog of Lore
      </Link>
      <div className="campaign-navigation-links">
        {links.map((link) => (
          <Link className={link.active ? 'is-active' : ''} href={link.href} key={link.href}>
            <span aria-hidden="true">{link.icon}</span>
            {link.label}
          </Link>
        ))}
        {role === 'OWNER' ? (
          <Link href={`/campaigns/${campaignId}?people=1`}>
            <span aria-hidden="true">⚙</span>Настройки
          </Link>
        ) : null}
      </div>
      <button className="theme-switch" onClick={toggleTheme} type="button">
        <span aria-hidden="true">{theme === 'tavern' ? '☀' : '☾'}</span>
        {theme === 'tavern' ? 'Светлая тема' : 'Тёмная тема'}
      </button>
      <BuildStamp className="campaign-build-stamp" />
    </nav>
  );
}
