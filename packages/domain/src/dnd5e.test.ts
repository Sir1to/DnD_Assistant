import { describe, expect, it } from 'vitest';

import { abilityModifier, dnd5eCharacterOptions, pointBuySpent } from './dnd5e';
import { dnd5eFormulaGroups } from './dnd5e-reference';

describe('D&D 5e character rules', () => {
  it('calculates modifiers using the rules formula', () => {
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(15)).toBe(2);
  });

  it('calculates a valid 27 point allocation', () => {
    expect(
      pointBuySpent({
        strength: 15,
        dexterity: 15,
        constitution: 15,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      }),
    ).toBe(27);
  });

  it('keeps references between options valid', () => {
    const options = dnd5eCharacterOptions();
    const spellIds = new Set(options.spells.map(({ id }) => id));
    const equipmentIds = new Set(options.equipment.map(({ id }) => id));
    for (const characterClass of options.classes) {
      expect(characterClass.starterSpellIds.every((id) => spellIds.has(id))).toBe(true);
      expect(characterClass.starterEquipmentIds.every((id) => equipmentIds.has(id))).toBe(true);
    }
    expect(options.spells.some((spell) => spell.level === 9)).toBe(true);
  });

  it('contains the core formula groups needed at the table', () => {
    const formulas = dnd5eFormulaGroups.flatMap((group) => group.formulas);
    expect(formulas.some((formula) => formula.id === 'weapon-attack')).toBe(true);
    expect(formulas.some((formula) => formula.id === 'falling-damage')).toBe(true);
    expect(formulas.some((formula) => formula.id === 'meteor-swarm')).toBe(true);
  });
});
