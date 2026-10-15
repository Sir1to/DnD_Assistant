import { expect, test } from '@playwright/test';

test('owner can register, create a campaign and open a battle scene', async ({ page }) => {
  const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const campaignName = `E2E campaign ${uniqueId}`;

  await page.goto('/register');
  await page.getByLabel('Как к вам обращаться').fill('E2E Master');
  await page.getByLabel('Электронная почта').fill(`e2e-${uniqueId}@example.test`);
  await page.getByLabel('Пароль').fill('e2e-password-that-is-long-enough');
  await page.getByRole('button', { name: 'Создать учётную запись' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('E2E Master')).toBeVisible();

  await page.getByRole('button', { name: 'Создать кампанию' }).click();
  await page.getByLabel('Название').fill(campaignName);
  await page.getByLabel('Краткое описание').fill('Автоматическая проверка критического пути.');
  await page.getByRole('button', { name: 'Создать и открыть' }).click();

  await expect(page).toHaveURL(/\/campaigns\/[0-9a-f-]+$/);
  await expect(page.getByRole('navigation', { name: 'Навигация кампании' })).toBeVisible();

  await page.getByRole('link', { name: /Поле боя/ }).click();
  await expect(page.getByRole('heading', { name: 'Создайте первую боевую сцену' })).toBeVisible();
  await page.getByRole('button', { name: 'Создать карту быстро' }).click();
  await expect(page.getByRole('dialog', { name: 'Замысел' })).toBeVisible();
  await page.getByLabel('Название карты').fill('E2E случайная карта');
  await page.getByLabel('Местность').selectOption('FOREST');
  await page.getByLabel('Краткое описание').fill('Лесная засада для автоматической проверки.');
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByRole('button', { name: 'Далее' }).click();
  await page.getByRole('button', { name: 'Проверить ответы' }).click();
  await expect(page.getByText('автоматический подбор врагов')).toBeVisible();
  await page.getByRole('button', { name: 'Создать черновик' }).click();

  await expect(page.getByLabel('Поле боя')).toBeVisible();
  await expect(page.getByText('Черновик создан генератором')).toBeVisible();
  await expect(page.locator('.battle-toolbar')).toContainText(/Раунд\s*1/);
});
