import { expect, test, type Page } from '@playwright/test';

const campaignId = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-10T12:00:00.000Z';

const viewports = [
  { name: 'desktop-1280', width: 1280, height: 900, stacked: false },
  { name: 'tablet-landscape-1024', width: 1024, height: 768, stacked: false },
  { name: 'tablet-portrait-768', width: 768, height: 1024, stacked: true },
  { name: 'mobile-390', width: 390, height: 844, stacked: true },
] as const;

async function mockEmptyBattle(page: Page) {
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === `/api/campaigns/${campaignId}`) {
      await route.fulfill({
        json: {
          id: campaignId,
          name: 'Кампания для проверки интерфейса',
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
        json: {
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

    await route.abort();
  });
}

function entityId(prefix: string, index: number) {
  return `${prefix}000000-0000-4000-8000-${index.toString().padStart(12, '0')}`;
}

function populatedBattle() {
  const sceneId = '22222222-2222-4222-8222-222222222222';
  const names = [
    'Аэларион Серебряный Ветер, хранитель северной заставы',
    'Капитан Брунгильда Железная Клятва из Дальнего Гарнизона',
    'Архимаг Теодорик фон Штормград, исследователь невозможного',
    'Следопытка Лианна Тихий Шаг и её верный сокол',
    'Жрец Ордена Неугасимого Рассвета Максимилиан',
    'Разъярённый болотный тролль с обломком старой башни',
    'Предводительница кобольдов Красная Искра Третья',
    'Древний страж подземного святилища безымянного короля',
    'Наёмник по прозвищу Никогда-Не-Отступает-Даже-В-Бурю',
    'Призрачная советница последней королевы Затонувшего Города',
    'Механический рыцарь экспериментальной серии «Гром-17»',
    'Огромный пещерный медведь, потревоженный слишком громкой песней',
  ];
  const combatants = names.map((name, index) => {
    const id = entityId('30', index + 1);
    const maxHp = 24 + index * 7;
    const currentHp = Math.max(1, maxHp - index * 3);
    return {
      id,
      sceneId,
      name,
      kind: index < 5 ? ('PLAYER' as const) : ('MONSTER' as const),
      initiative: 24 - index,
      currentHp,
      maxHp,
      hpPercent: Math.round((currentHp / maxHp) * 100),
      hpState: index < 3 ? ('UNHARMED' as const) : ('HURT' as const),
      temporaryHp: index === 0 ? 5 : 0,
      armorClass: 13 + (index % 6),
      speed: 6,
      movementSpent: index % 4,
      className: index < 5 ? 'Мультиклассовый искатель приключений высокого уровня' : null,
      species: index < 5 ? 'Необычайно длинное название народа из дальних земель' : 'Монстр',
      conditions: index % 3 === 0 ? ['Благословение', 'Концентрация', 'Окружён'] : [],
      hidden: false,
      nameVisibility: 'EXACT' as const,
      hpVisibility: 'BAR' as const,
      showArmorClass: true,
      showClassName: index < 5,
      showSpecies: true,
      conditionsVisibility: 'ALL' as const,
      revision: 3,
    };
  });

  return {
    campaignId,
    role: 'OWNER',
    scene: {
      id: sceneId,
      campaignId,
      name: 'Осада очень длинно названной крепости у края известного мира',
      status: 'PAUSED',
      shape: 'RECTANGLE',
      gridColumns: 18,
      gridRows: 12,
      backgroundAttachmentId: null,
      terrainTheme: 'RUINS',
      backgroundPreset: 'RUINS_COURTYARD',
      lightingTheme: 'DIM',
      weatherTheme: 'RAIN',
      activeCombatantId: combatants[0]!.id,
      round: 7,
      revision: 12,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    combatants,
    tokens: combatants.map((combatant, index) => ({
      id: entityId('40', index + 1),
      sceneId,
      combatantId: combatant.id,
      ownerUserId: null,
      imageAttachmentId: null,
      systemAssetId: null,
      hasImage: false,
      x: 1 + (index % 6) * 2,
      y: 1 + Math.floor(index / 6) * 4,
      size: 1,
      color: index < 5 ? '#7c5cff' : '#d24d57',
      revision: 2,
    })),
    obstacles: [],
    objects: [],
  };
}

async function mockPopulatedBattle(page: Page) {
  const battle = populatedBattle();

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (pathname === `/api/campaigns/${campaignId}`) {
      await route.fulfill({
        json: {
          id: campaignId,
          name: 'Кампания с очень длинным названием для проверки переполнения интерфейса',
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
      await route.fulfill({ json: battle });
      return;
    }

    if (
      pathname === `/api/campaigns/${campaignId}/battle-saves` ||
      pathname === `/api/campaigns/${campaignId}/battle-combatant-presets`
    ) {
      await route.fulfill({ json: [] });
      return;
    }

    if (pathname === `/api/campaigns/${campaignId}/members`) {
      await route.fulfill({ json: { members: [] } });
      return;
    }

    if (pathname === `/api/campaigns/${campaignId}/lore`) {
      await route.fulfill({ json: { entries: [] } });
      return;
    }

    if (pathname === `/api/campaigns/${campaignId}/characters`) {
      await route.fulfill({ json: { sheets: [] } });
      return;
    }

    await route.abort();
  });
}

async function expectNoPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.body.clientWidth,
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(overflow.body).toBeLessThanOrEqual(1);
  expect(overflow.document).toBeLessThanOrEqual(1);
}

for (const viewport of viewports) {
  test(`empty battle layout remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockEmptyBattle(page);
    await page.goto(`/campaigns/${campaignId}/battle`);

    const navigation = page.getByRole('navigation', { name: 'Навигация кампании' });
    const emptyState = page.locator('.battle-empty-state');
    await expect(navigation).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Создайте первую боевую сцену' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Создать карту быстро' })).toBeVisible();

    const [navigationBox, emptyStateBox] = await Promise.all([
      navigation.boundingBox(),
      emptyState.boundingBox(),
    ]);
    expect(navigationBox).not.toBeNull();
    expect(emptyStateBox).not.toBeNull();

    if (viewport.stacked) {
      expect(emptyStateBox!.y).toBeGreaterThanOrEqual(navigationBox!.y + navigationBox!.height - 1);
    } else {
      expect(emptyStateBox!.x).toBeGreaterThanOrEqual(navigationBox!.x + navigationBox!.width - 1);
    }

    await expectNoPageOverflow(page);

    await page
      .locator('.campaign-build-stamp, nextjs-portal')
      .evaluateAll((elements) => elements.forEach((element) => element.remove()));
    await expect(page).toHaveScreenshot(`empty-battle-${viewport.name}.png`, {
      animations: 'disabled',
      fullPage: true,
      maxDiffPixelRatio: 0.04,
    });
  });

  test(`populated master workshop remains usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockPopulatedBattle(page);
    await page.goto(`/campaigns/${campaignId}/battle`);

    await expect(page.getByLabel('Поле боя')).toBeVisible();
    await expect(page.locator('.battle-master-combatant')).toHaveCount(12);
    await expectNoPageOverflow(page);

    const firstCombatant = page.locator('.battle-master-combatant').first();
    await firstCombatant.getByText('Характеристики и видимость').click();
    await expect(firstCombatant.getByLabel('Имя для игроков')).toBeVisible();
    await firstCombatant.scrollIntoViewIfNeeded();
    await expectNoPageOverflow(page);

    const panel = page.locator('.battle-master-panel');
    const panelBox = await panel.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(-1);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport.width + 1);

    await page
      .locator('.campaign-build-stamp, nextjs-portal')
      .evaluateAll((elements) => elements.forEach((element) => element.remove()));
    await expect(page).toHaveScreenshot(`populated-workshop-${viewport.name}.png`, {
      animations: 'disabled',
      maxDiffPixelRatio: 0.04,
    });
  });
}
