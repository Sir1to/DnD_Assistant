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
              englishName: 'Fire Bolt',
              description: 'Дальнобойная атака огнём.',
              level: 0,
              classIds: ['wizard'],
              referenceUrl: 'https://dnd.su/spells/204-fire-bolt/',
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
              name: 'Гоблин',
              englishName: 'Goblin',
              referenceUrl: 'https://dnd.su/bestiary/438-goblin/',
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
    if (pathname.startsWith('/api/rulesets/dnd5e/monsters/')) {
      await route.fulfill({
        json: {
          id: 'srd:goblin',
          name: 'Гоблин',
          englishName: 'Goblin',
          referenceUrl: 'https://dnd.su/bestiary/438-goblin/',
          size: 'Small',
          type: 'humanoid',
          challengeRating: '1/4',
          experiencePoints: 50,
          armorClass: 15,
          hitPoints: 7,
          hitPointFormula: '2d6',
          initiativeModifier: 2,
          speed: { walk: 30 },
          abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
          savingThrows: { dex: 4 },
          skills: { stealth: 6 },
          damageVulnerabilities: [],
          damageResistances: [],
          damageImmunities: ['fire'],
          conditionImmunities: ['poisoned'],
          senses: { darkvision: 60, passive_perception: 9 },
          languages: ['Common', 'Goblin'],
          traits: [],
          actions: [],
          reactions: [],
          legendaryActions: null,
          source: 'SRD 5.2.1',
          license: 'CC-BY-4.0',
        },
      });
      return;
    }
    await route.abort();
  });

  await page.goto(`/campaigns/${campaignId}/reference`);
  const search = page.getByRole('searchbox', { name: 'Единый поиск в справочнике' });
  const formulaSearch = page.getByRole('searchbox', { name: 'Поиск только по формулам' });

  await expect(page.getByRole('button', { name: /Броски d20/ })).toHaveClass(/is-active/);
  await formulaSearch.fill('концентрация после урона');
  await expect(page.getByText('спасбросок Телосложения, СЛ = max')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('По запросу найдено: 1');
  await formulaSearch.fill('такой формулы нет');
  await expect(page.getByText('Такой формулы не нашлось')).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить поиск' }).click();

  await search.fill('Goblin');
  await expect(page.getByRole('heading', { name: 'Существа' })).toBeVisible();
  await page.getByRole('button', { name: /Goblin/ }).click();
  await expect(page.getByText('Скрытность +6')).toBeVisible();
  await expect(page.getByText('тёмное зрение 60 фт.')).toBeVisible();
  await expect(page.getByText('Общий, Гоблинский')).toBeVisible();
  await expect(page.getByText('огонь')).toBeVisible();
  await expect(page.getByText('отравление')).toBeVisible();

  await search.fill('огненный');
  await expect(page.getByRole('heading', { name: 'Заклинания' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Огненный снаряд/ })).toBeVisible();

  await search.fill('урона');
  await expect(page.getByRole('heading', { name: 'Предметы' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Правила и формулы' })).toBeVisible();
  await search.fill('критическое попадание');
  await page.getByRole('button', { name: /Критическое попадание/ }).click();
  await expect(page.getByRole('heading', { name: 'Атаки и защита' })).toBeVisible();
  await expect(page.getByText('бросить кости урона атаки дважды')).toBeVisible();

  await search.fill('длинный меч');
  await page.getByRole('button', { name: /Длинный меч/ }).click();
  await expect(page.getByRole('heading', { name: 'Цены и предметы' })).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(page.getByText('1к8 рубящего урона.')).toBeVisible();
});
