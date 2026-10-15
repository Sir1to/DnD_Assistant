import { expect, test } from '@playwright/test';

const campaignId = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-04T12:00:00.000Z';

test('reference search finds every catalogue type and opens a result', async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === `/api/campaigns/${campaignId}`) {
      await route.fulfill({
        json: {
          id: campaignId,
          name: 'Тестовая кампания',
          description: '',
          role: 'OWNER',
          boards: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
      return;
    }
    if (pathname === '/api/rulesets/dnd5e/character-options') {
      await route.fulfill({
        json: {
          ruleset: 'dnd5e-srd-5.2.1',
          attribution: 'SRD 5.2.1 · CC BY 4.0',
          classes: [],
          species: [],
          backgrounds: [],
          skills: [],
          spells: [
            {
              id: 'fire-bolt',
              name: 'Огненный снаряд',
              description: 'Дальнобойная атака огнём.',
              level: 0,
              classIds: ['wizard'],
            },
          ],
          equipment: [
            {
              id: 'longsword',
              name: 'Длинный меч',
              description: '1к8 рубящего урона.',
              category: 'WEAPON',
              cost: '15 зм',
            },
          ],
          builds: [],
        },
      });
      return;
    }
    if (pathname === '/api/rulesets/dnd5e/monsters') {
      await route.fulfill({
        json: {
          ruleset: 'dnd5e-srd-5.2.1',
          source: 'SRD 5.2.1',
          license: 'CC-BY-4.0',
          attribution: 'SRD 5.2.1 · CC BY 4.0',
          monsters: [
            {
              id: 'srd:goblin',
              name: 'Goblin',
              size: 'Small',
              type: 'humanoid',
              challengeRating: '1/4',
              experiencePoints: 50,
              armorClass: 15,
              hitPoints: 7,
              hitPointFormula: '2d6',
              initiativeModifier: 2,
            },
          ],
        },
      });
      return;
    }
    await route.abort();
  });

  await page.goto(`/campaigns/${campaignId}/reference`);
  const search = page.getByRole('searchbox', { name: 'Единый поиск в справочнике' });

  await search.fill('Goblin');
  await expect(page.getByRole('heading', { name: 'Существа' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Goblin/ })).toBeVisible();

  await search.fill('огненный');
  await expect(page.getByRole('heading', { name: 'Заклинания' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Огненный снаряд/ })).toBeVisible();

  await search.fill('урона');
  await expect(page.getByRole('heading', { name: 'Предметы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Правила и формулы' })).toBeVisible();

  await search.fill('длинный меч');
  await page.getByRole('button', { name: /Длинный меч/ }).click();
  await expect(page.getByRole('heading', { name: 'Цены и предметы' })).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(page.getByText('1к8 рубящего урона.')).toBeVisible();
});
