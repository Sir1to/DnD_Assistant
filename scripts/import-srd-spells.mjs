import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [inputPath, russianReferencePath] = process.argv.slice(2);
const outputPath = resolve(projectRoot, 'packages/domain/src/data/dnd5e-srd-5.2.1-spells.json');

if (!inputPath) {
  throw new Error(
    'Usage: node scripts/import-srd-spells.mjs <srd-spells.json> [russian-reference.json]',
  );
}

const source = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
if (!Array.isArray(source) || source.length === 0) {
  throw new Error('The source file does not contain a spell array');
}

const russianReference = russianReferencePath
  ? JSON.parse(await readFile(resolve(russianReferencePath), 'utf8'))
  : [];
const russianByEnglishName = new Map(
  russianReference
    .filter((spell) => spell?.name_en && spell?.name_ru)
    .map((spell) => [normalizeName(spell.name_en), spell]),
);
const idOverrides = new Map([
  ['hunter-s-mark', 'hunters-mark'],
  ['shield', 'shield-spell'],
]);
const ids = new Set();
const spells = source.map((spell) => {
  const normalizedName = normalizeName(spell.name);
  const generatedId = slugify(spell.name);
  const id = idOverrides.get(generatedId) ?? generatedId;
  if (ids.has(id)) throw new Error(`Duplicate spell id: ${id}`);
  ids.add(id);

  const russian = russianByEnglishName.get(normalizedName);
  const classIds = [...new Set((spell.classes ?? []).map((name) => slugify(name)))].sort();
  return {
    id,
    name: russian?.name_ru ?? spell.name,
    englishName: spell.name,
    level: Number(spell.level),
    classIds,
    description: russian
      ? `Официальное заклинание SRD 5.2.1. Полное русское описание доступно в справочнике dnd.su.`
      : 'Официальное заклинание SRD 5.2.1; русское название пока не сопоставлено.',
    referenceUrl: russian?.url ?? 'https://www.dndbeyond.com/srd',
  };
});

spells.sort(
  (left, right) =>
    left.level - right.level ||
    left.name.localeCompare(right.name, 'ru') ||
    left.englishName.localeCompare(right.englishName, 'en'),
);

const output = {
  schemaVersion: 1,
  ruleset: 'dnd5e-srd-5.2.1',
  source: 'SRD 5.2.1',
  license: 'CC-BY-4.0',
  attribution:
    'Rules data: D&D System Reference Document 5.2.1 by Wizards of the Coast LLC, CC BY 4.0. Russian names and reference links are matched against dnd.su.',
  spells,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Imported ${spells.length} SRD spells into ${outputPath}`);

function normalizeName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[’‘`]/gu, "'")
    .replace(/[^a-z0-9]+/giu, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}

function slugify(value) {
  return normalizeName(value).replaceAll(' ', '-').replaceAll("'", '');
}
