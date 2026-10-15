import { expect, test } from '@playwright/test';

const campaignId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const combatantId = '33333333-3333-4333-8333-333333333333';
const tokenId = '44444444-4444-4444-8444-444444444444';
const timestamp = '2026-09-28T09:00:00.000Z';

test('campaign owner can drag any token to another grid cell', async ({ page }) => {
  const snapshot = {
    campaignId,
    role: 'OWNER',
    scene: {
      id: sceneId,
      campaignId,
      name: 'Проверка перемещения',
      status: 'LIVE',
      shape: 'RECTANGLE',
      gridColumns: 16,
      gridRows: 10,
      backgroundAttachmentId: null,
      terrainTheme: 'DUNGEON',
      backgroundPreset: 'DUNGEON_STONE',
      lightingTheme: 'BRIGHT',
      weatherTheme: 'CLEAR',
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
        name: 'Чужой маркер',
        kind: 'MONSTER',
        initiative: 10,
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
        nameVisibility: 'EXACT',
        hpVisibility: 'EXACT',
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
        imageAttachmentId: null,
        hasImage: false,
        x: 8,
        y: 5,
        size: 1,
        color: '#ef5350',
        revision: 0,
      },
    ],
    obstacles: [],
    objects: [],
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
      await route.fulfill({ json: snapshot });
      return;
    }
    if (pathname === `/api/battle-tokens/${tokenId}/move`) {
      const body = request.postDataJSON() as { x: number; y: number };
      snapshot.tokens[0]!.x = body.x;
      snapshot.tokens[0]!.y = body.y;
      snapshot.tokens[0]!.revision += 1;
      await route.fulfill({ json: snapshot });
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
  const board = page.getByLabel('Поле боя');
  const token = page.getByRole('button', { name: 'Выбрать Чужой маркер' });
  await expect(token).toBeVisible();
  await token.scrollIntoViewIfNeeded();
  const boardBox = await board.boundingBox();
  const tokenBox = await token.boundingBox();
  expect(boardBox).not.toBeNull();
  expect(tokenBox).not.toBeNull();

  const moveRequest = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === `/api/battle-tokens/${tokenId}/move` &&
      request.method() === 'POST',
  );
  await page.mouse.move(tokenBox!.x + tokenBox!.width / 2, tokenBox!.y + tokenBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    boardBox!.x + (boardBox!.width * 3.5) / 16,
    boardBox!.y + (boardBox!.height * 2.5) / 10,
    { steps: 8 },
  );
  await page.mouse.up();

  const request = await moveRequest;
  expect(request.postDataJSON()).toMatchObject({ expectedRevision: 0, x: 3, y: 2 });
  await expect.poll(() => token.evaluate((element) => element.style.left)).toBe('18.75%');
});
