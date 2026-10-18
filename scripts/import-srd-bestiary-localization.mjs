import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [bestiaryPath, ...referencePaths] = process.argv.slice(2);
const outputPath = resolve(
  projectRoot,
  'packages/domain/src/data/dnd5e-srd-5.2.1-bestiary-ru.json',
);

if (!bestiaryPath || referencePaths.length === 0) {
  throw new Error(
    'Usage: node scripts/import-srd-bestiary-localization.mjs <bestiary.json> <russian-reference.json> [...]',
  );
}

const bestiary = JSON.parse(await readFile(resolve(bestiaryPath), 'utf8'));
const references = (
  await Promise.all(referencePaths.map((path) => readFile(resolve(path), 'utf8')))
).flatMap((content) => JSON.parse(content));
const byEnglishName = new Map();
for (const entry of references) {
  if (!entry?.name_en || !entry?.name_ru) continue;
  const key = normalizeName(entry.name_en);
  if (!byEnglishName.has(key)) byEnglishName.set(key, entry);
}

const monsters = bestiary.monsters.map((monster) => {
  const reference = byEnglishName.get(normalizeName(monster.name));
  const mechanicsMatch =
    reference &&
    Number(reference.ac) === Number(monster.armorClass) &&
    Number(reference.hp?.avg) === Number(monster.hitPoints) &&
    String(reference.cr) === String(monster.challengeRating);
  const sections = new Map((reference?.sections ?? []).map((section) => [section.key, section]));
  const traits = mechanicsMatch ? translatedRules(monster.traits, sections.get('traits')) : null;
  const actions = mechanicsMatch ? translatedRules(monster.actions, sections.get('actions')) : null;
  const reactions = mechanicsMatch
    ? translatedRules(monster.reactions, sections.get('reactions'))
    : null;
  const legendarySection = sections.get('legendary_actions');
  const legendaryActions =
    mechanicsMatch && monster.legendaryActions && legendarySection
      ? {
          description: legendarySection.intro ?? monster.legendaryActions.description,
          actions: translatedRules(monster.legendaryActions.actions, legendarySection),
        }
      : null;
  return {
    id: monster.id,
    englishName: monster.name,
    name: reference?.name_ru ?? transliterateFallback(monster.name),
    referenceUrl: reference?.url ?? 'https://dnd.su/bestiary/',
    ...(traits ? { traits } : {}),
    ...(actions ? { actions } : {}),
    ...(reactions ? { reactions } : {}),
    ...(legendaryActions ? { legendaryActions } : {}),
  };
});

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      ruleset: 'dnd5e-srd-5.2.1',
      source: 'dnd.su name index',
      monsters,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(
  `Matched ${monsters.filter(({ referenceUrl }) => referenceUrl !== 'https://dnd.su/bestiary/').length} of ${monsters.length} monster names`,
);

function normalizeName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[’‘`]/gu, "'")
    .replace(/[^a-z0-9]+/giu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function translatedRules(original, section) {
  const translated = section?.items ?? [];
  if (!Array.isArray(original) || original.length !== translated.length) return null;
  return original.map((_, index) => ({
    name: translated[index].name,
    description: translated[index].text,
  }));
}

function transliterateFallback(value) {
  const pairs = [
    ['sh', 'ш'],
    ['ch', 'ч'],
    ['th', 'т'],
    ['ph', 'ф'],
    ['qu', 'кв'],
    ['ck', 'к'],
    ['a', 'а'],
    ['b', 'б'],
    ['c', 'к'],
    ['d', 'д'],
    ['e', 'е'],
    ['f', 'ф'],
    ['g', 'г'],
    ['h', 'х'],
    ['i', 'и'],
    ['j', 'дж'],
    ['k', 'к'],
    ['l', 'л'],
    ['m', 'м'],
    ['n', 'н'],
    ['o', 'о'],
    ['p', 'п'],
    ['q', 'к'],
    ['r', 'р'],
    ['s', 'с'],
    ['t', 'т'],
    ['u', 'у'],
    ['v', 'в'],
    ['w', 'в'],
    ['x', 'кс'],
    ['y', 'й'],
    ['z', 'з'],
  ];
  let result = value.toLocaleLowerCase('en-US');
  for (const [from, to] of pairs) result = result.replaceAll(from, to);
  return result.charAt(0).toLocaleUpperCase('ru-RU') + result.slice(1);
}
