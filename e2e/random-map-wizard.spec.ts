import { expect, test } from '@playwright/test';

const campaignId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const combatantId = '33333333-3333-4333-8333-333333333333';
const tokenId = '44444444-4444-4444-8444-444444444444';
const objectId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-09-27T09:00:00.000Z';

test('owner reviews and creates a deterministic random map draft', async ({ page }) => {
  let submitted: Record<string, unknown> | null = null;
  let generated = false;
  let savedTokenSystemAssetId: string | null = null;
  const generatedSnapshot = {
    campaignId,
    role: 'OWNER',
    scene: {
      id: sceneId,
      campaignId,
      name: 'Туманная засада',
      status: 'DRAFT',
      shape: 'RECTANGLE',
      gridColumns: 16,
      gridRows: 10,
      backgroundAttachmentId: null,
      terrainTheme: 'FOREST',
      backgroundPreset: 'FOREST_CLEARING',
      lightingTheme: null,
      weatherTheme: null,
      activeCombatantId: null,
      round: 1,
      revision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    combatants: [
      {
        id: combatantId,
        sceneId,
        name: 'Дикий зверь 1',
        kind: 'MONSTER',
        initiative: 12,
        currentHp: 12,
        maxHp: 12,
        hpPercent: 100,
        hpState: 'UNHARMED',
        temporaryHp: 0,
        armorClass: 13,
        speed: 6,
        movementSpent: 0,
        className: '',
        species: '',
        conditions: [],
        hidden: false,
        nameVisibility: 'GENERIC',
        hpVisibility: 'STATE',
        showArmorClass: false,
        showClassName: false,
        showSpecies: false,
        conditionsVisibility: 'ALL',
        revision: 0,
      },
    ],
    tokens: [
      {
        id: tokenId,
        sceneId,
        combatantId,
        ownerUserId: null,
        imageAttachmentId: null as string | null,
        systemAssetId: 'starter.token.forest.raider' as string | null,
        hasImage: true,
        x: 12,
        y: 5,
        size: 1,
        color: '#ef5350',
        revision: 0,
      },
    ],
    obstacles: [],
    objects: [
      {
        id: objectId,
        sceneId,
        kind: 'PROP',
        name: 'Поваленное дерево',
        x: 6,
        y: 4,
        width: 1,
        height: 1,
        blocksMovement: true,
        visibleToPlayers: true,
        showLabel: false,
        imageAttachmentId: null,
        systemAssetId: 'starter.prop.forest.fallen-tree',
        hasImage: true,
        imageAnimated: false,
        currentHp: null,
        maxHp: null,
        hpPercent: null,
        hpState: null,
        revision: 0,
      },
    ],
    generation: {
      seed: '',
      summary: 'лес, 16×10, автоматический подбор противников, цель: оборона',
      terrain: 'FOREST',
      playerStart: { x: 1, y: 5 },
      enemyStart: { x: 14, y: 5 },
    },
  };

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
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
    if (pathname === `/api/campaigns/${campaignId}/battle`) {
      await route.fulfill({
        json: generated
          ? generatedSnapshot
          : {
              campaignId,
              role: 'OWNER',
              scene: null,
              combatants: [],
              tokens: [],
              obstacles: [],
              objects: [],
            },
      });
      return;
    }
    if (pathname === `/api/campaigns/${campaignId}/battle/generate`) {
      submitted = request.postDataJSON() as Record<string, unknown>;
      generated = true;
      generatedSnapshot.scene.name = submitted.name as string;
      generatedSnapshot.generation.seed = submitted.seed as string;
      await route.fulfill({ json: generatedSnapshot });
      return;
    }
    if (pathname === `/api/battle-tokens/${tokenId}` && request.method() === 'PATCH') {
      const body = request.postDataJSON() as {
        expectedRevision: number;
        imageAttachmentId?: string | null;
        systemAssetId?: string | null;
      };
      expect(body).toMatchObject({
        expectedRevision: generatedSnapshot.tokens[0]!.revision,
        systemAssetId: 'starter.token.forest.dire-wolf',
      });
      generatedSnapshot.tokens[0]!.imageAttachmentId = body.imageAttachmentId ?? null;
      generatedSnapshot.tokens[0]!.systemAssetId = body.systemAssetId ?? null;
      generatedSnapshot.tokens[0]!.hasImage = generatedSnapshot.tokens[0]!.systemAssetId !== null;
      generatedSnapshot.tokens[0]!.revision += 1;
      await route.fulfill({ json: generatedSnapshot });
      return;
    }
    if (pathname === `/api/battle-scenes/${sceneId}/saves` && request.method() === 'POST') {
      savedTokenSystemAssetId = generatedSnapshot.tokens[0]!.systemAssetId;
      await route.fulfill({
        json: {
          id: '66666666-6666-4666-8666-666666666666',
          name: (request.postDataJSON() as { name: string }).name,
          sourceSceneName: generatedSnapshot.scene.name,
          sceneStatus: 'DRAFT',
          gridColumns: 16,
          gridRows: 10,
          combatantCount: 1,
          hasBackground: true,
          createdAt: timestamp,
        },
      });
      return;
    }
    if (pathname.endsWith('/members')) {
      await route.fulfill({ json: { members: [] } });
      return;
    }
    if (pathname.endsWith('/lore')) {
      await route.fulfill({ json: { campaignId, role: 'OWNER', entries: [] } });
      return;
    }
    if (pathname.endsWith('/battle-saves') || pathname.endsWith('/battle-combatant-presets')) {
      await route.fulfill({ json: [] });
      return;
    }
    await route.abort();
  });

  await page.goto(`/campaigns/${campaignId}/battle`);
  await page.getByRole('button', { name: 'Создать карту быстро' }).click();
  await expect(page.getByRole('dialog', { name: 'Замысел' })).toBeVisible();

  await page.getByLabel('Название карты').fill('Туманная засада');
  await page.getByLabel('Местность').selectOption('FOREST');
  await page.getByLabel('Краткое описание').fill('Лесная тропа и древний алтарь.');
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByLabel('Форма').selectOption('RECTANGLE');
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByLabel('Цель столкновения').selectOption('DEFEND');
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByLabel('Погода').selectOption('FOG');
  await page.getByLabel('Добавить опасности и ловушки').check();
  await page.getByRole('button', { name: 'Проверить ответы' }).click();

  const firstSeed = await page.locator('.random-map-review-seed code').textContent();
  expect(firstSeed).toBeTruthy();
  await page.getByRole('button', { name: 'Перемешать вариант' }).click();
  await expect(page.locator('.random-map-review-seed code')).not.toHaveText(firstSeed!);
  await page.getByRole('button', { name: 'Создать черновик' }).click();

  await expect(page.getByLabel('Поле боя')).toBeVisible();
  await expect(page.getByText('Черновик создан генератором')).toBeVisible();
  await expect(page.getByLabel('Поле боя')).toHaveCSS(
    'background-image',
    /backgrounds\/forest-clearing\.webp/,
  );
  await expect(page.locator('.battle-generated-enemy-portrait').first()).toHaveCSS(
    'background-image',
    /enemy-portraits-expanded-atlas\.png/,
  );
  await expect(page.locator('.battle-generated-environment')).toHaveCSS(
    'background-image',
    /environment-props-expanded-atlas\.png/,
  );
  const combatantCard = page.locator('.battle-master-combatant').filter({
    hasText: 'Дикий зверь 1',
  });
  await combatantCard.getByText('Характеристики и видимость').click();
  await expect(combatantCard.getByText('Встроенная библиотека')).toBeVisible();
  await combatantCard.getByRole('button', { name: /Лютоволк/ }).click();
  await expect(combatantCard.getByRole('button', { name: /Лютоволк/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.locator('.battle-master-drawer > summary').filter({ hasText: 'Сохранения' }).click();
  await page.getByLabel('Название сохранения').fill('Туманная засада · проверка ассетов');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  expect(savedTokenSystemAssetId).toBe('starter.token.forest.dire-wolf');
  expect(submitted).toMatchObject({
    name: 'Туманная засада',
    terrain: 'FOREST',
    objective: 'DEFEND',
    weather: 'FOG',
    hazards: true,
  });
  expect((submitted as Record<string, unknown> | null)?.['seed']).not.toBe(firstSeed);
});
