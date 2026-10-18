import { expect, test } from '@playwright/test';

const token = 'a'.repeat(43);
const timestamp = '2026-10-17T12:00:00.000Z';

test('public character card renders only the sections selected by its grant', async ({ page }) => {
  await page.route(`**/api/character-shares/${token}`, async (route) => {
    await route.fulfill({
      json: {
        name: 'Лира Серебряный Щит',
        ruleset: 'dnd5e-srd-5.2.1',
        rulesetVersion: '5.2.1',
        status: 'READY',
        expiresAt: '2026-10-24T12:00:00.000Z',
        updatedAt: timestamp,
        sections: ['ABILITIES', 'COMBAT', 'SKILLS', 'PROFILE'],
        hasPortrait: false,
        identity: {
          level: 4,
          species: 'Человек',
          characterClass: 'Воин',
          background: 'Солдат',
        },
        abilities: {
          scores: {
            strength: 16,
            dexterity: 14,
            constitution: 15,
            intelligence: 10,
            wisdom: 12,
            charisma: 8,
          },
          modifiers: {
            strength: 3,
            dexterity: 2,
            constitution: 2,
            intelligence: 0,
            wisdom: 1,
            charisma: -1,
          },
        },
        combat: {
          proficiencyBonus: 2,
          armorClass: 17,
          hitPointMaximum: 36,
          initiative: 2,
          speed: 30,
          passivePerception: 13,
          spellSaveDifficultyClass: null,
          spellAttackBonus: null,
        },
        skills: ['Атлетика', 'Восприятие'],
        spells: null,
        inventory: null,
        profile: {
          personality: 'Всегда защищает слабых.',
          appearance: 'Серебряная прядь в тёмных волосах.',
          backstory: 'Служила в северном гарнизоне.',
        },
        notes: null,
        runtime: null,
      },
    });
  });

  await page.goto(`/share/characters/${token}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Лира Серебряный Щит' })).toBeVisible();
  await expect(page.getByText('Человек · Воин · уровень 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Характеристики' })).toBeVisible();
  await expect(page.getByText('Атлетика')).toBeVisible();
  await expect(page.getByText('Служила в северном гарнизоне.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Инвентарь' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Заметки' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Текущее состояние' })).toHaveCount(0);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex.*nofollow.*nocache/,
  );
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

test('invalid public character link shows a safe read-only error state', async ({ page }) => {
  await page.route(`**/api/character-shares/${token}`, async (route) => {
    await route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Ссылка недействительна' } },
    });
  });

  await page.goto(`/share/characters/${token}`);

  await expect(page.getByText('Ссылка недействительна', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link')).toHaveCount(0);
});
