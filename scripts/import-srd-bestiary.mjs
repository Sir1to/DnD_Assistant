import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = process.argv[2];
const outputPath = resolve(projectRoot, 'packages/domain/src/data/dnd5e-srd-5.2.1-bestiary.json');

if (!inputPath) {
  throw new Error('Usage: node scripts/import-srd-bestiary.mjs <monsters.json>');
}

const source = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
if (!Array.isArray(source.monsters) || source.monsters.length === 0) {
  throw new Error('The source file does not contain a monsters array');
}

const ids = new Set();
const monsters = source.monsters.map((monster) => {
  if (monster.source !== 'srd-5.2.1' || monster.attribution !== 'SRD 5.2.1 / CC-BY 4.0') {
    throw new Error(`Unexpected source metadata for ${monster.id ?? monster.name ?? 'unknown'}`);
  }
  if (ids.has(monster.id)) throw new Error(`Duplicate monster id: ${monster.id}`);
  ids.add(monster.id);

  const statBlock = monster.stat_block_json ?? {};
  return {
    id: monster.id,
    name: monster.name,
    size: monster.size,
    type: monster.type,
    challengeRating: monster.cr,
    armorClass: monster.armor_class,
    hitPoints: monster.hp_max,
    hitPointFormula: monster.hp_formula,
    initiativeModifier: monster.initiative_modifier,
    abilityScores: statBlock.ability_scores,
    speed: statBlock.speed ?? {},
    savingThrows: statBlock.saving_throws ?? {},
    skills: statBlock.skills ?? {},
    senses: statBlock.senses ?? {},
    languages: statBlock.languages ?? [],
    damageVulnerabilities: statBlock.damage_vulnerabilities ?? [],
    damageResistances: statBlock.damage_resistances ?? [],
    damageImmunities: statBlock.damage_immunities ?? [],
    conditionImmunities: statBlock.condition_immunities ?? [],
    traits: statBlock.traits ?? [],
    actions: (statBlock.actions ?? []).map((action) => ({
      name: action.name,
      description: action.description,
      ...(action.attack_bonus === undefined ? {} : { attackBonus: action.attack_bonus }),
      ...(action.damage === undefined ? {} : { damage: action.damage }),
    })),
    reactions: statBlock.reactions ?? [],
    legendaryActions: statBlock.legendary_actions
      ? {
          description: statBlock.legendary_actions.description,
          perRound: statBlock.legendary_actions.per_round,
          actions: statBlock.legendary_actions.actions,
        }
      : null,
  };
});

monsters.sort((left, right) => left.name.localeCompare(right.name, 'en'));

const output = {
  schemaVersion: 1,
  ruleset: 'dnd5e-srd-5.2.1',
  source: 'SRD 5.2.1',
  license: 'CC-BY-4.0',
  attribution:
    'This work includes material from the System Reference Document 5.2.1 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. Structured source data was republished by Open5e and retrieved from https://github.com/adkinn/srd-5.2.1.',
  monsters,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`Imported ${monsters.length} SRD monsters into ${outputPath}`);
