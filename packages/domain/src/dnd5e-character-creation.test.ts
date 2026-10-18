import { describe, expect, it } from 'vitest';

import {
  applyDnd5eGuidedIdentity,
  createDnd5eAutomaticCharacterDocument,
  createDnd5eGuidedCharacterDocument,
  createDnd5eManualCharacterDocument,
  dnd5eCharacterOptions,
  recommendDnd5eBuilds,
  recordDnd5eGuidedDecisions,
  resolveDnd5eGuidedChoices,
} from './dnd5e-character-creation';

describe('D&D 5e guided character creation', () => {
  it('publishes a versioned, ordered decision graph with every supported ability method', () => {
    const guided = dnd5eCharacterOptions().guided;

    expect(guided.version).toBe(1);
    expect(guided.steps.map(({ id }) => id)).toEqual([
      'concept',
      'origin',
      'class',
      'abilities',
      'skills',
      'spells',
      'equipment',
      'story',
      'review',
    ]);
    expect(guided.abilityMethods.map(({ id }) => id)).toEqual([
      'STANDARD_ARRAY',
      'POINT_BUY',
      'ROLL',
      'MANUAL',
      'CAMPAIGN',
    ]);
  });

  it('keeps dependent guided choices compatible when background or class changes', () => {
    let document = createDnd5eGuidedCharacterDocument();
    document = applyDnd5eGuidedIdentity(document, 'backgroundId', 'soldier');
    document = applyDnd5eGuidedIdentity(document, 'classId', 'fighter');
    document = {
      ...document,
      choices: {
        skillIds: ['athletics', 'intimidation', 'perception'],
        spellIds: ['fire-bolt'],
      },
    };

    document = applyDnd5eGuidedIdentity(document, 'backgroundId', 'sage');
    expect(document.choices.skillIds).toEqual(['perception', 'arcana', 'history']);

    document = applyDnd5eGuidedIdentity(document, 'classId', 'wizard');
    expect(document.choices.skillIds).toEqual(['arcana', 'history']);
    expect(document.choices.spellIds).toEqual(['fire-bolt']);
    expect(resolveDnd5eGuidedChoices(document)).toMatchObject({
      backgroundSkillIds: ['arcana', 'history'],
      maxClassSkills: 2,
    });
  });

  it('records stable decisions without modifying the working document choices', () => {
    const document = applyDnd5eGuidedIdentity(
      applyDnd5eGuidedIdentity(createDnd5eGuidedCharacterDocument(), 'classId', 'wizard'),
      'backgroundId',
      'sage',
    );
    const recorded = recordDnd5eGuidedDecisions({
      ...document,
      choices: { skillIds: ['arcana', 'history'], spellIds: ['fire-bolt'] },
    });

    expect(recorded.creation).toEqual({
      mode: 'GUIDED',
      decisions: expect.arrayContaining([
        { stepId: 'class', optionIds: ['wizard'] },
        { stepId: 'skills', optionIds: ['arcana', 'history'] },
        { stepId: 'spells', optionIds: ['fire-bolt'] },
      ]),
    });
    expect(recorded.choices).toEqual({ skillIds: ['arcana', 'history'], spellIds: ['fire-bolt'] });
  });

  it('creates a blank manual draft and never rewrites its creation mode as guided', () => {
    const document = createDnd5eManualCharacterDocument();
    const recorded = recordDnd5eGuidedDecisions(document);

    expect(document).toMatchObject({
      creation: { mode: 'MANUAL', decisions: [] },
      abilities: {
        method: 'MANUAL',
        scores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
      },
    });
    expect(recorded).toBe(document);
  });

  it('builds an automatic v2 document with explained decisions and background choices', () => {
    const document = createDnd5eAutomaticCharacterDocument(
      'guardian-fighter',
      'human',
      'STANDARD_ARRAY',
      { goal: 'FRONTLINE', complexity: 'SIMPLE' },
    );

    expect(document).toMatchObject({
      creation: {
        mode: 'AUTOMATIC',
        decisions: [
          { stepId: 'beginner-goal', optionIds: ['FRONTLINE'] },
          { stepId: 'beginner-complexity', optionIds: ['SIMPLE'] },
          { stepId: 'party-role', optionIds: ['guardian-fighter'] },
          { stepId: 'species', optionIds: ['human'] },
          { stepId: 'ability-method', optionIds: ['STANDARD_ARRAY'] },
        ],
      },
      identity: { classId: 'fighter', speciesId: 'human', backgroundId: 'soldier' },
    });
    expect(document?.choices.skillIds).toEqual(
      expect.arrayContaining(['athletics', 'intimidation', 'perception']),
    );
    expect(document?.inventory.equipment.map(({ optionId }) => optionId)).toEqual(
      expect.arrayContaining(['longsword', 'chain-mail', 'shield', 'healers-kit', 'gaming-set']),
    );
  });

  it('ranks several beginner builds and explains the selected play style', () => {
    const simpleFrontline = recommendDnd5eBuilds({ goal: 'FRONTLINE', complexity: 'SIMPLE' });
    const tacticalMagic = recommendDnd5eBuilds({ goal: 'MAGIC', complexity: 'TACTICAL' });

    expect(simpleFrontline).toHaveLength(dnd5eCharacterOptions().builds.length);
    expect(simpleFrontline[0]).toMatchObject({
      buildId: 'guardian-fighter',
      reasons: expect.arrayContaining([
        expect.stringContaining('передовую'),
        expect.stringContaining('понятный ход'),
      ]),
    });
    expect(tacticalMagic[0]).toMatchObject({
      buildId: 'careful-wizard',
      reasons: expect.arrayContaining([
        expect.stringContaining('заклинаниями'),
        expect.stringContaining('выбора заклинаний'),
      ]),
    });
    expect(new Set(tacticalMagic.map(({ buildId }) => buildId)).size).toBe(tacticalMagic.length);
  });

  it('rejects unknown automatic-build inputs without creating a partial document', () => {
    expect(createDnd5eAutomaticCharacterDocument('missing-build', 'human', 'STANDARD_ARRAY')).toBe(
      null,
    );
    expect(
      createDnd5eAutomaticCharacterDocument(
        'guardian-fighter',
        'missing-species',
        'STANDARD_ARRAY',
      ),
    ).toBe(null);
  });

  it('keeps automatic decisions intact when the document is opened in the editor', () => {
    const document = createDnd5eAutomaticCharacterDocument(
      'guardian-fighter',
      'human',
      'STANDARD_ARRAY',
    );

    expect(document).not.toBeNull();
    expect(recordDnd5eGuidedDecisions(document!)).toBe(document);
    expect(document?.creation.mode).toBe('AUTOMATIC');
  });

  it('publishes the complete SRD spell catalogue and expanded official species list', () => {
    const options = dnd5eCharacterOptions();

    expect(options.spells.length).toBeGreaterThanOrEqual(339);
    expect(options.species.map(({ id }) => id)).toEqual(
      expect.arrayContaining(['aasimar', 'tabaxi', 'tortle', 'half-elf', 'warforged']),
    );
    expect(options.species.every(({ source }) => source.length > 0)).toBe(true);
  });

  it('keeps guided equipment inside the selected class and background package', () => {
    let document = createDnd5eGuidedCharacterDocument();
    document = applyDnd5eGuidedIdentity(document, 'classId', 'fighter');
    document = applyDnd5eGuidedIdentity(document, 'backgroundId', 'soldier');

    expect(document.inventory.equipment.map(({ optionId }) => optionId)).toEqual(
      expect.arrayContaining([
        'longsword',
        'chain-mail',
        'shield',
        'light-crossbow',
        'healers-kit',
        'gaming-set',
      ]),
    );
    expect(resolveDnd5eGuidedChoices(document).availableEquipmentIds).toEqual(
      document.inventory.equipment.map(({ optionId }) => optionId),
    );
  });

  it('does not offer half-caster spells before the class gains spellcasting', () => {
    let document = createDnd5eGuidedCharacterDocument();
    document = applyDnd5eGuidedIdentity(document, 'classId', 'paladin');

    expect(resolveDnd5eGuidedChoices(document).availableSpellIds).toEqual([]);

    document = applyDnd5eGuidedIdentity(document, 'level', 2);
    expect(resolveDnd5eGuidedChoices(document).availableSpellIds).toContain('bless');
  });
});
