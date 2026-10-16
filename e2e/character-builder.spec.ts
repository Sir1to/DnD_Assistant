import { expect, test } from '@playwright/test';

test('owner completes the guided character builder using the published decision graph', async ({
  page,
}) => {
  const uniqueId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  await page.goto('/register');
  await page.getByLabel('Как к вам обращаться').fill('Character Builder Master');
  await page.getByLabel('Электронная почта').fill(`character-builder-${uniqueId}@example.test`);
  await page.getByLabel('Пароль').fill('e2e-password-that-is-long-enough');
  await page.getByRole('button', { name: 'Создать учётную запись' }).click();

  await page.getByRole('button', { name: 'Создать кампанию' }).click();
  await page.getByLabel('Название').fill(`Character Builder ${uniqueId}`);
  await page.getByLabel('Краткое описание').fill('Проверка пошагового конструктора.');
  await page.getByRole('button', { name: 'Создать и открыть' }).click();
  await page.getByRole('link', { name: 'Персонажи' }).click();

  await page.getByRole('button', { name: 'Конструктор 2.0' }).click();
  const builder = page.getByRole('dialog', { name: 'Концепция' });
  await builder.getByLabel('Имя героя').fill('Арина');
  await builder.getByRole('button', { name: 'Дальше' }).click();

  await expect(builder.getByRole('heading', { name: 'Вид и прошлое' })).toBeVisible();
  await builder.getByLabel('Вид').selectOption('human');
  await builder.getByLabel('Предыстория').selectOption('soldier');
  await builder.getByRole('button', { name: 'Дальше' }).click();

  await builder.getByLabel('Класс').selectOption('fighter');
  for (let index = 0; index < 6; index += 1) {
    await builder.getByRole('button', { name: 'Дальше' }).click();
  }

  await expect(builder.getByRole('heading', { name: 'Проверка' })).toBeVisible();
  await expect(builder.getByText('Все правила пройдены.')).toBeVisible();
  await builder.getByRole('button', { name: 'Создать лист' }).click();

  await expect(page.getByRole('heading', { name: 'Арина' })).toBeVisible();
  await expect(page.getByText('Документ соответствует выбранному набору правил.')).toBeVisible();

  await page.getByRole('button', { name: 'Для новичка' }).click();
  const automatic = page.getByRole('dialog', { name: 'Первый персонаж' });
  await automatic.getByRole('button', { name: /Быть на передовой/ }).click();
  await automatic.getByRole('button', { name: 'Дальше' }).click();
  await automatic.getByRole('button', { name: /Хочу освоиться быстро/ }).click();
  await automatic.getByRole('button', { name: 'Дальше' }).click();
  await expect(automatic.getByText('Вот три подходящих варианта')).toBeVisible();
  await automatic.getByRole('button', { name: /Защитник группы/ }).click();
  await automatic.getByRole('button', { name: 'Дальше' }).click();
  await automatic.getByRole('button', { name: /Человек/ }).click();
  await automatic.getByRole('button', { name: 'Дальше' }).click();
  await automatic.getByRole('button', { name: /Готовый набор/ }).click();
  await automatic.getByRole('button', { name: 'Дальше' }).click();
  await automatic.getByLabel('Имя').fill('Борин');
  await automatic.getByRole('button', { name: 'Создать лист' }).click();

  await expect(page.getByRole('heading', { name: 'Борин' })).toBeVisible();
  await expect(page.getByText('Лист 2.0 · готов')).toBeVisible();

  await page.getByRole('button', { name: '+ Новый лист' }).click();
  const manual = page.getByRole('dialog', { name: 'Концепция' });
  await expect(manual.getByLabel('Режим создания')).toHaveValue('Свободный ручной лист');
  await manual.getByLabel('Имя героя').fill('Черновик героя');
  for (let index = 0; index < 8; index += 1) {
    await manual.getByRole('button', { name: 'Дальше' }).click();
  }
  await expect(manual.getByRole('heading', { name: 'Проверка' })).toBeVisible();
  await manual.getByRole('button', { name: 'Создать черновик' }).click();

  await expect(page.getByRole('heading', { name: 'Черновик героя' })).toBeVisible();
  await expect(page.getByText('Лист 2.0 · черновик')).toBeVisible();
});
