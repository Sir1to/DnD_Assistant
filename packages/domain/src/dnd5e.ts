import spellData from './data/dnd5e-srd-5.2.1-spells.json';

export const abilityKeys = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export type AbilityKey = (typeof abilityKeys)[number];
export type AbilityScores = Record<AbilityKey, number>;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

const pointBuyCosts: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointBuySpent(scores: AbilityScores): number | null {
  let spent = 0;
  for (const key of abilityKeys) {
    const cost = pointBuyCosts[scores[key]];
    if (cost === undefined) return null;
    spent += cost;
  }
  return spent;
}

export interface Option {
  id: string;
  name: string;
  description: string;
}
export interface ClassOption extends Option {
  hitDie: number;
  primaryAbilities: AbilityKey[];
  skillChoices: number;
  allowedSkillIds: string[];
  starterSpellIds: string[];
  starterEquipmentIds: string[];
}

const skill = (id: string, name: string, ability: string): Option => ({
  id,
  name,
  description: ability,
});
export const dnd5eSkills = [
  skill('acrobatics', 'Акробатика', 'Ловкость'),
  skill('animal-handling', 'Уход за животными', 'Мудрость'),
  skill('arcana', 'Магия', 'Интеллект'),
  skill('athletics', 'Атлетика', 'Сила'),
  skill('deception', 'Обман', 'Харизма'),
  skill('history', 'История', 'Интеллект'),
  skill('insight', 'Проницательность', 'Мудрость'),
  skill('intimidation', 'Запугивание', 'Харизма'),
  skill('investigation', 'Анализ', 'Интеллект'),
  skill('medicine', 'Медицина', 'Мудрость'),
  skill('nature', 'Природа', 'Интеллект'),
  skill('perception', 'Внимательность', 'Мудрость'),
  skill('performance', 'Выступление', 'Харизма'),
  skill('persuasion', 'Убеждение', 'Харизма'),
  skill('religion', 'Религия', 'Интеллект'),
  skill('sleight-of-hand', 'Ловкость рук', 'Ловкость'),
  skill('stealth', 'Скрытность', 'Ловкость'),
  skill('survival', 'Выживание', 'Мудрость'),
];

const allSkills = dnd5eSkills.map(({ id }) => id);
const cls = (value: ClassOption): ClassOption => value;
export const dnd5eClasses: ClassOption[] = [
  cls({
    id: 'barbarian',
    name: 'Варвар',
    description: 'Стойкий боец, полагающийся на силу и ярость.',
    hitDie: 12,
    primaryAbilities: ['strength'],
    skillChoices: 2,
    allowedSkillIds: [
      'animal-handling',
      'athletics',
      'intimidation',
      'nature',
      'perception',
      'survival',
    ],
    starterSpellIds: [],
    starterEquipmentIds: ['greataxe', 'handaxe', 'explorers-pack'],
  }),
  cls({
    id: 'bard',
    name: 'Бард',
    description: 'Гибкий герой, поддержка группы и знаток магии.',
    hitDie: 8,
    primaryAbilities: ['charisma'],
    skillChoices: 3,
    allowedSkillIds: allSkills,
    starterSpellIds: ['healing-word', 'vicious-mockery', 'dissonant-whispers'],
    starterEquipmentIds: ['rapier', 'leather-armor', 'lute'],
  }),
  cls({
    id: 'cleric',
    name: 'Жрец',
    description: 'Божественный заклинатель, защита и лечение.',
    hitDie: 8,
    primaryAbilities: ['wisdom'],
    skillChoices: 2,
    allowedSkillIds: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    starterSpellIds: ['guidance', 'sacred-flame', 'cure-wounds', 'bless'],
    starterEquipmentIds: ['mace', 'scale-mail', 'shield', 'holy-symbol'],
  }),
  cls({
    id: 'druid',
    name: 'Друид',
    description: 'Маг природы с лечением и превращениями.',
    hitDie: 8,
    primaryAbilities: ['wisdom'],
    skillChoices: 2,
    allowedSkillIds: [
      'arcana',
      'animal-handling',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
    starterSpellIds: ['guidance', 'produce-flame', 'cure-wounds', 'entangle'],
    starterEquipmentIds: ['quarterstaff', 'leather-armor', 'druidic-focus'],
  }),
  cls({
    id: 'fighter',
    name: 'Воин',
    description: 'Универсальный мастер оружия и доспехов.',
    hitDie: 10,
    primaryAbilities: ['strength', 'dexterity'],
    skillChoices: 2,
    allowedSkillIds: [
      'acrobatics',
      'animal-handling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'perception',
      'survival',
    ],
    starterSpellIds: [],
    starterEquipmentIds: ['longsword', 'chain-mail', 'shield', 'light-crossbow'],
  }),
  cls({
    id: 'monk',
    name: 'Монах',
    description: 'Подвижный боец без тяжёлых доспехов.',
    hitDie: 8,
    primaryAbilities: ['dexterity', 'wisdom'],
    skillChoices: 2,
    allowedSkillIds: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    starterSpellIds: [],
    starterEquipmentIds: ['quarterstaff', 'explorers-pack'],
  }),
  cls({
    id: 'paladin',
    name: 'Паладин',
    description: 'Защитник передовой с клятвой и божественной магией.',
    hitDie: 10,
    primaryAbilities: ['strength', 'charisma'],
    skillChoices: 2,
    allowedSkillIds: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    starterSpellIds: ['bless', 'cure-wounds', 'divine-favor'],
    starterEquipmentIds: ['longsword', 'chain-mail', 'shield', 'holy-symbol'],
  }),
  cls({
    id: 'ranger',
    name: 'Следопыт',
    description: 'Разведчик и охотник, владеющий природной магией.',
    hitDie: 10,
    primaryAbilities: ['dexterity', 'wisdom'],
    skillChoices: 3,
    allowedSkillIds: [
      'animal-handling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
    starterSpellIds: ['cure-wounds', 'hunters-mark', 'ensnaring-strike'],
    starterEquipmentIds: ['longbow', 'shortsword', 'leather-armor', 'explorers-pack'],
  }),
  cls({
    id: 'rogue',
    name: 'Плут',
    description: 'Специалист по навыкам, скрытности и точным ударам.',
    hitDie: 8,
    primaryAbilities: ['dexterity'],
    skillChoices: 4,
    allowedSkillIds: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'performance',
      'persuasion',
      'sleight-of-hand',
      'stealth',
    ],
    starterSpellIds: [],
    starterEquipmentIds: ['rapier', 'shortbow', 'leather-armor', 'thieves-tools'],
  }),
  cls({
    id: 'sorcerer',
    name: 'Чародей',
    description: 'Заклинатель с врождённым источником силы.',
    hitDie: 6,
    primaryAbilities: ['charisma'],
    skillChoices: 2,
    allowedSkillIds: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    starterSpellIds: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield-spell'],
    starterEquipmentIds: ['light-crossbow', 'arcane-focus', 'explorers-pack'],
  }),
  cls({
    id: 'warlock',
    name: 'Колдун',
    description: 'Магия, полученная через договор с могущественным покровителем.',
    hitDie: 8,
    primaryAbilities: ['charisma'],
    skillChoices: 2,
    allowedSkillIds: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
    starterSpellIds: ['eldritch-blast', 'mage-hand', 'hex', 'armor-of-agathys'],
    starterEquipmentIds: ['light-crossbow', 'leather-armor', 'arcane-focus'],
  }),
  cls({
    id: 'wizard',
    name: 'Волшебник',
    description: 'Учёный маг с широким выбором заклинаний.',
    hitDie: 6,
    primaryAbilities: ['intelligence'],
    skillChoices: 2,
    allowedSkillIds: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    starterSpellIds: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield-spell', 'sleep'],
    starterEquipmentIds: ['quarterstaff', 'spellbook', 'arcane-focus'],
  }),
];

export function maximumDnd5eSpellLevel(classId: string, characterLevel: number): number {
  if (!Number.isInteger(characterLevel) || characterLevel < 1) return -1;
  if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].includes(classId)) {
    return Math.min(9, Math.ceil(characterLevel / 2));
  }
  if (classId === 'warlock') return Math.min(5, Math.ceil(characterLevel / 2));
  if (['paladin', 'ranger'].includes(classId)) {
    return characterLevel < 2 ? -1 : Math.min(5, Math.ceil(characterLevel / 4));
  }
  return -1;
}

export const dnd5eSpecies = [
  {
    id: 'human',
    name: 'Человек',
    description: 'Разносторонний и приспособляемый герой.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'dwarf',
    name: 'Дварф',
    description: 'Стойкий народ с тёмным зрением.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'elf',
    name: 'Эльф',
    description: 'Ловкий народ с острыми чувствами.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'halfling',
    name: 'Полурослик',
    description: 'Маленький, отважный и удачливый герой.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'dragonborn',
    name: 'Драконорождённый',
    description: 'Наследник драконьей силы с дыхательным оружием.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'gnome',
    name: 'Гном',
    description: 'Изобретательный герой с магической стойкостью.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'goliath',
    name: 'Голиаф',
    description: 'Могучий потомок великанов.',
    speed: 35,
    source: 'SRD 5.2.1',
  },
  {
    id: 'orc',
    name: 'Орк',
    description: 'Крепкий и неутомимый воин.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  {
    id: 'tiefling',
    name: 'Тифлинг',
    description: 'Герой с потусторонним наследием и магией.',
    speed: 30,
    source: 'SRD 5.2.1',
  },
  ...[
    ['aarakocra', 'Ааракокра', 'Крылатый народ со стихийным наследием.', 30, 'MPMM'],
    ['aasimar', 'Аасимар', 'Герой, отмеченный силой Небесных планов.', 30, 'MPMM'],
    ['bugbear', 'Багбир', 'Скрытный и сильный представитель гоблиноидов.', 30, 'MPMM'],
    ['centaur', 'Кентавр', 'Быстрый фейский народ с телом коня.', 40, 'MPMM'],
    ['changeling', 'Чейнджлинг', 'Меняет внешность благодаря природной способности.', 30, 'MPMM'],
    ['deep-gnome', 'Глубинный гном', 'Подземный гном, стойкий к магии.', 30, 'MPMM'],
    ['duergar', 'Дуэргар', 'Подземный дварф с псионическими дарами.', 30, 'MPMM'],
    ['eladrin', 'Эладрин', 'Эльф Страны Фей, связанный с временами года.', 30, 'MPMM'],
    ['fairy', 'Фэйри', 'Маленький летающий народ Страны Фей.', 30, 'MPMM'],
    ['firbolg', 'Фирболг', 'Уединённый великанородный хранитель природы.', 30, 'MPMM'],
    ['genasi', 'Дженази', 'Герой с наследием одного из стихийных планов.', 30, 'MPMM'],
    ['githyanki', 'Гитъянки', 'Астральный воитель с псионическими дарами.', 30, 'MPMM'],
    ['githzerai', 'Гитцерай', 'Дисциплинированный псионик из хаоса Лимбо.', 30, 'MPMM'],
    ['goblin', 'Гоблин', 'Проворный и находчивый гоблиноид.', 30, 'MPMM'],
    ['harengon', 'Зайцегон', 'Прыгучий фейский народ с быстрой реакцией.', 30, 'MPMM'],
    ['kenku', 'Кенку', 'Птичий народ, искусный в подражании.', 30, 'MPMM'],
    ['kobold', 'Кобольд', 'Маленький драконообразный герой.', 30, 'MPMM'],
    ['lizardfolk', 'Людоящер', 'Выносливый рептилоид, приспособленный к воде.', 30, 'MPMM'],
    ['minotaur', 'Минотавр', 'Могучий рогатый герой лабиринтов.', 30, 'MPMM'],
    ['satyr', 'Сатир', 'Жизнерадостный фейский народ.', 35, 'MPMM'],
    ['sea-elf', 'Морской эльф', 'Эльф, приспособленный к жизни под водой.', 30, 'MPMM'],
    ['shadar-kai', 'Шадар-кай', 'Эльф, связанный с Царством Теней.', 30, 'MPMM'],
    ['shifter', 'Шифтер', 'Герой с оборотническим наследием.', 30, 'MPMM'],
    ['tabaxi', 'Табакси', 'Кошачий народ исследователей и странников.', 30, 'MPMM'],
    ['tortle', 'Тортл', 'Черепахоподобный народ с природным панцирем.', 30, 'MPMM'],
    ['triton', 'Тритон', 'Подводный народ защитников морских глубин.', 30, 'MPMM'],
    ['yuan-ti', 'Юань-ти', 'Герой со змеиным наследием.', 30, 'MPMM'],
    ['half-elf', 'Полуэльф', 'Наследник человеческой и эльфийской культур.', 30, 'PH14'],
    ['half-orc', 'Полуорк', 'Стойкий герой с орочьим наследием.', 30, 'PH14'],
    ['warforged', 'Кованый', 'Искусственно созданный живой конструкт.', 30, 'RLW'],
    ['kalashtar', 'Калаштар', 'Герой, связанный с духом из мира снов.', 30, 'RLW'],
  ].map(([id, name, description, speed, source]) => ({
    id: id as string,
    name: name as string,
    description: description as string,
    speed: speed as number,
    source: source as string,
  })),
];

export const dnd5eBackgrounds = [
  {
    id: 'acolyte',
    name: 'Послушник',
    description: 'Служение в храме и знание религии.',
    skillIds: ['insight', 'religion'],
    equipmentIds: ['holy-symbol', 'scholars-pack'],
  },
  {
    id: 'criminal',
    name: 'Преступник',
    description: 'Связи в теневом мире и привычка действовать скрытно.',
    skillIds: ['deception', 'stealth'],
    equipmentIds: ['thieves-tools', 'crowbar'],
  },
  {
    id: 'sage',
    name: 'Мудрец',
    description: 'Годы учёбы, исследования и поиска знаний.',
    skillIds: ['arcana', 'history'],
    equipmentIds: ['scholars-pack', 'ink'],
  },
  {
    id: 'soldier',
    name: 'Солдат',
    description: 'Военная служба, дисциплина и выносливость.',
    skillIds: ['athletics', 'intimidation'],
    equipmentIds: ['healers-kit', 'gaming-set'],
  },
  {
    id: 'charlatan',
    name: 'Шарлатан',
    description: 'Мастер чужих личин, уловок и убедительных подделок.',
    skillIds: ['deception', 'sleight-of-hand'],
    equipmentIds: ['gaming-set', 'ink'],
  },
  {
    id: 'entertainer',
    name: 'Артист',
    description: 'Сценическая жизнь, яркие выступления и дорога от города к городу.',
    skillIds: ['acrobatics', 'performance'],
    equipmentIds: ['lute', 'gaming-set'],
  },
  {
    id: 'folk-hero',
    name: 'Народный герой',
    description: 'Защитник простых людей, прославившийся смелым поступком.',
    skillIds: ['animal-handling', 'survival'],
    equipmentIds: ['healers-kit', 'crowbar'],
  },
  {
    id: 'guild-artisan',
    name: 'Гильдейский ремесленник',
    description: 'Опыт мастерской, торговли и жизни в профессиональном братстве.',
    skillIds: ['insight', 'persuasion'],
    equipmentIds: ['scholars-pack', 'gaming-set'],
  },
  {
    id: 'hermit',
    name: 'Отшельник',
    description: 'Годы уединения, размышлений и поисков скрытой истины.',
    skillIds: ['medicine', 'religion'],
    equipmentIds: ['healers-kit', 'scholars-pack'],
  },
  {
    id: 'noble',
    name: 'Благородный',
    description: 'Знатное происхождение, образование и привычка к высшему обществу.',
    skillIds: ['history', 'persuasion'],
    equipmentIds: ['gaming-set', 'ink'],
  },
  {
    id: 'outlander',
    name: 'Чужеземец',
    description: 'Жизнь вдали от городов, знание дорог и дикой природы.',
    skillIds: ['athletics', 'survival'],
    equipmentIds: ['explorers-pack', 'lute'],
  },
  {
    id: 'sailor',
    name: 'Моряк',
    description: 'Служба на корабле, тяжёлая работа и чутьё на опасность.',
    skillIds: ['athletics', 'perception'],
    equipmentIds: ['crowbar', 'explorers-pack'],
  },
  {
    id: 'urchin',
    name: 'Беспризорник',
    description: 'Уличная жизнь научила незаметности, ловкости и находчивости.',
    skillIds: ['sleight-of-hand', 'stealth'],
    equipmentIds: ['thieves-tools', 'crowbar'],
  },
];

const spell = (
  id: string,
  name: string,
  level: number,
  classIds: string[],
  description: string,
) => ({ id, name, level, classIds, description });
const curatedDnd5eSpells = [
  spell(
    'guidance',
    'Указание',
    0,
    ['cleric', 'druid'],
    'Помогает союзнику с проверкой характеристики.',
  ),
  spell(
    'sacred-flame',
    'Священное пламя',
    0,
    ['cleric'],
    'Лучистый урон по цели, провалившей спасбросок.',
  ),
  spell(
    'produce-flame',
    'Сотворение пламени',
    0,
    ['druid'],
    'Создаёт свет и позволяет атаковать пламенем.',
  ),
  spell(
    'vicious-mockery',
    'Злая насмешка',
    0,
    ['bard'],
    'Психический урон и помеха следующей атаке цели.',
  ),
  spell('fire-bolt', 'Огненный снаряд', 0, ['sorcerer', 'wizard'], 'Дальнобойная атака огнём.'),
  spell(
    'mage-hand',
    'Волшебная рука',
    0,
    ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Призрачная рука для простых действий на расстоянии.',
  ),
  spell(
    'eldritch-blast',
    'Мистический заряд',
    0,
    ['warlock'],
    'Дальнобойная атака силовой энергией.',
  ),
  spell(
    'cure-wounds',
    'Лечение ран',
    1,
    ['bard', 'cleric', 'druid', 'paladin', 'ranger'],
    'Восстанавливает хиты существу рядом.',
  ),
  spell(
    'healing-word',
    'Лечащее слово',
    1,
    ['bard', 'cleric', 'druid'],
    'Быстрое лечение союзника на расстоянии.',
  ),
  spell(
    'bless',
    'Благословение',
    1,
    ['cleric', 'paladin'],
    'Усиливает атаки и спасброски нескольких союзников.',
  ),
  spell(
    'magic-missile',
    'Волшебная стрела',
    1,
    ['sorcerer', 'wizard'],
    'Снаряды, которые автоматически попадают в цель.',
  ),
  spell('shield-spell', 'Щит', 1, ['sorcerer', 'wizard'], 'Реакция, временно повышающая КД.'),
  spell('sleep', 'Сон', 1, ['bard', 'sorcerer', 'wizard'], 'Усыпляет существ в области.'),
  spell('hex', 'Сглаз', 1, ['warlock'], 'Проклятие, усиливающее урон по выбранной цели.'),
  spell(
    'armor-of-agathys',
    'Доспех Агатиса',
    1,
    ['warlock'],
    'Временные хиты и ответный урон холодом.',
  ),
  spell(
    'hunters-mark',
    'Метка охотника',
    1,
    ['ranger'],
    'Помечает добычу и усиливает урон по ней.',
  ),
  spell('ensnaring-strike', 'Опутывающий удар', 1, ['ranger'], 'Удар может опутать цель лозами.'),
  spell('entangle', 'Опутывание', 1, ['druid'], 'Растения удерживают существ в области.'),
  spell(
    'divine-favor',
    'Божественное благоволение',
    1,
    ['paladin'],
    'Добавляет лучистый урон атакам оружием.',
  ),
  spell(
    'dissonant-whispers',
    'Диссонирующий шёпот',
    1,
    ['bard'],
    'Психический урон и вынужденное отступление.',
  ),
  spell(
    'misty-step',
    'Туманный шаг',
    2,
    ['sorcerer', 'warlock', 'wizard'],
    'Коротко переносит заклинателя сквозь пространство.',
  ),
  spell(
    'hold-person',
    'Удержание личности',
    2,
    ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Парализует гуманоидную цель, если та не выдержит спасбросок.',
  ),
  spell(
    'invisibility',
    'Невидимость',
    2,
    ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Скрывает цель от зрения до атаки или сотворения заклинания.',
  ),
  spell(
    'spiritual-weapon',
    'Духовное оружие',
    2,
    ['cleric'],
    'Создаёт призрачное оружие, атакующее рядом с врагом.',
  ),
  spell(
    'web',
    'Паутина',
    2,
    ['sorcerer', 'wizard'],
    'Заполняет область липкими нитями и сковывает неосторожных существ.',
  ),
  spell(
    'counterspell',
    'Контрзаклинание',
    3,
    ['sorcerer', 'warlock', 'wizard'],
    'Реакцией пытается сорвать чужое заклинание.',
  ),
  spell(
    'dispel-magic',
    'Рассеивание магии',
    3,
    ['bard', 'cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Заканчивает действующие магические эффекты.',
  ),
  spell(
    'fireball',
    'Огненный шар',
    3,
    ['sorcerer', 'wizard'],
    'Взрыв пламени в области; цель спасается Ловкостью.',
  ),
  spell('fly', 'Полёт', 3, ['sorcerer', 'warlock', 'wizard'], 'Дарует цели скорость полёта.'),
  spell(
    'revivify',
    'Оживление',
    3,
    ['cleric', 'paladin'],
    'Возвращает к жизни существо, умершее совсем недавно.',
  ),
  spell(
    'banishment',
    'Изгнание',
    4,
    ['cleric', 'paladin', 'sorcerer', 'warlock', 'wizard'],
    'Временно убирает цель с поля боя в другое измерение.',
  ),
  spell(
    'dimension-door',
    'Дверь в измерение',
    4,
    ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Переносит заклинателя и спутника на большое расстояние.',
  ),
  spell(
    'greater-invisibility',
    'Высшая невидимость',
    4,
    ['bard', 'sorcerer', 'wizard'],
    'Позволяет оставаться невидимым даже во время атаки.',
  ),
  spell(
    'polymorph',
    'Превращение',
    4,
    ['bard', 'druid', 'sorcerer', 'wizard'],
    'Меняет облик и возможности существа на время действия.',
  ),
  spell(
    'wall-of-fire',
    'Стена огня',
    4,
    ['druid', 'sorcerer', 'wizard'],
    'Создаёт опасную огненную преграду.',
  ),
  spell(
    'cloudkill',
    'Смертоносное облако',
    5,
    ['sorcerer', 'wizard'],
    'Ядовитый туман медленно заполняет участок поля боя.',
  ),
  spell(
    'cone-of-cold',
    'Конус холода',
    5,
    ['sorcerer', 'wizard'],
    'Ледяной конус поражает существ перед заклинателем.',
  ),
  spell(
    'greater-restoration',
    'Высшее восстановление',
    5,
    ['bard', 'cleric', 'druid'],
    'Снимает тяжёлые ослабляющие эффекты.',
  ),
  spell(
    'raise-dead',
    'Поднять мёртвого',
    5,
    ['bard', 'cleric', 'paladin'],
    'Возвращает к жизни умершего в более широком временном окне.',
  ),
  spell(
    'telekinesis',
    'Телекинез',
    5,
    ['sorcerer', 'wizard'],
    'Двигает существо или предмет силой мысли.',
  ),
  spell(
    'chain-lightning',
    'Цепная молния',
    6,
    ['sorcerer', 'wizard'],
    'Молния перескакивает между несколькими целями.',
  ),
  spell(
    'disintegrate',
    'Распад',
    6,
    ['sorcerer', 'wizard'],
    'Разрушительный луч наносит огромный урон при провале спасброска.',
  ),
  spell(
    'heal',
    'Исцеление',
    6,
    ['cleric', 'druid'],
    'Мгновенно восстанавливает большой запас хитов и снимает часть состояний.',
  ),
  spell(
    'sunbeam',
    'Солнечный луч',
    6,
    ['druid', 'sorcerer', 'wizard'],
    'Яркий луч обжигает и может ослепить противников.',
  ),
  spell(
    'true-seeing',
    'Истинное зрение',
    6,
    ['bard', 'cleric', 'sorcerer', 'warlock', 'wizard'],
    'Позволяет видеть скрытую магией реальность.',
  ),
  spell(
    'finger-of-death',
    'Перст смерти',
    7,
    ['sorcerer', 'warlock', 'wizard'],
    'Некротический луч наносит тяжёлый урон одной цели.',
  ),
  spell(
    'plane-shift',
    'Смена плана',
    7,
    ['cleric', 'druid', 'sorcerer', 'warlock', 'wizard'],
    'Переносит существ на другой план бытия.',
  ),
  spell(
    'regenerate',
    'Регенерация',
    7,
    ['bard', 'cleric', 'druid'],
    'Постепенно лечит цель и восстанавливает утраченные части тела.',
  ),
  spell(
    'reverse-gravity',
    'Обратная гравитация',
    7,
    ['druid', 'sorcerer', 'wizard'],
    'Меняет направление притяжения в большой области.',
  ),
  spell(
    'teleport',
    'Телепортация',
    7,
    ['bard', 'sorcerer', 'wizard'],
    'Переносит группу на огромное расстояние.',
  ),
  spell(
    'antimagic-field',
    'Поле антимагии',
    8,
    ['cleric', 'wizard'],
    'Подавляет магические эффекты в окружающей области.',
  ),
  spell(
    'dominate-monster',
    'Подчинение чудовища',
    8,
    ['bard', 'sorcerer', 'wizard'],
    'Позволяет управлять существом, если оно не выдержит спасбросок.',
  ),
  spell(
    'earthquake',
    'Землетрясение',
    8,
    ['cleric', 'druid', 'sorcerer'],
    'Сотрясает землю, рушит строения и меняет поле боя.',
  ),
  spell('maze', 'Лабиринт', 8, ['wizard'], 'Запирает цель в межпространственном лабиринте.'),
  spell(
    'sunburst',
    'Солнечная вспышка',
    8,
    ['druid', 'sorcerer', 'wizard'],
    'Вспышка света наносит лучистый урон и может ослепить.',
  ),
  spell(
    'foresight',
    'Предвидение',
    9,
    ['bard', 'druid', 'warlock', 'wizard'],
    'Дарует цели исключительное предчувствие опасности.',
  ),
  spell(
    'meteor-swarm',
    'Метеоритный дождь',
    9,
    ['sorcerer', 'wizard'],
    'Четыре огненных метеора обрушиваются на выбранные точки.',
  ),
  spell(
    'power-word-kill',
    'Слово силы: смерть',
    9,
    ['bard', 'sorcerer', 'warlock', 'wizard'],
    'Слово мгновенно убивает достаточно ослабленную цель.',
  ),
  spell(
    'time-stop',
    'Остановка времени',
    9,
    ['sorcerer', 'wizard'],
    'Заклинатель получает несколько мгновений вне обычного хода времени.',
  ),
  spell(
    'wish',
    'Исполнение желаний',
    9,
    ['sorcerer', 'wizard'],
    'Самая могущественная магия: может воспроизвести или изменить эффект по воле заклинателя.',
  ),
];

type StoredSpellCatalogue = {
  schemaVersion: number;
  ruleset: string;
  source: string;
  license: string;
  attribution: string;
  spells: Array<{
    id: string;
    name: string;
    englishName: string;
    level: number;
    classIds: string[];
    description: string;
    referenceUrl: string;
  }>;
};

const storedSpellCatalogue = spellData as StoredSpellCatalogue;
if (
  storedSpellCatalogue.schemaVersion !== 1 ||
  storedSpellCatalogue.ruleset !== 'dnd5e-srd-5.2.1' ||
  storedSpellCatalogue.source !== 'SRD 5.2.1' ||
  storedSpellCatalogue.license !== 'CC-BY-4.0'
) {
  throw new Error('Unsupported D&D 5e spell dataset');
}

const curatedSpellById = new Map(curatedDnd5eSpells.map((entry) => [entry.id, entry]));
const officialSpellIds = new Set(storedSpellCatalogue.spells.map(({ id }) => id));

export const dnd5eSpells = [
  ...storedSpellCatalogue.spells.map((entry) => {
    const curated = curatedSpellById.get(entry.id);
    return curated
      ? { ...entry, name: curated.name, description: curated.description }
      : { ...entry };
  }),
  ...curatedDnd5eSpells
    .filter(({ id }) => !officialSpellIds.has(id))
    .map((entry) => ({
      ...entry,
      englishName: entry.name,
      referenceUrl: 'https://dnd.su/spells/',
    })),
];

const gear = (
  id: string,
  name: string,
  category: 'WEAPON' | 'ARMOR' | 'GEAR' | 'FOCUS',
  cost: string,
  description: string,
) => ({ id, name, category, cost, description });
export const dnd5eEquipment = [
  gear('longsword', 'Длинный меч', 'WEAPON', '15 зм', '1к8 рубящего урона.'),
  gear('greataxe', 'Секира', 'WEAPON', '30 зм', '1к12 рубящего урона.'),
  gear('rapier', 'Рапира', 'WEAPON', '25 зм', '1к8 колющего урона, фехтовальное.'),
  gear('quarterstaff', 'Боевой посох', 'WEAPON', '2 см', '1к6 дробящего урона.'),
  gear('mace', 'Булава', 'WEAPON', '5 зм', '1к6 дробящего урона.'),
  gear('handaxe', 'Ручной топор', 'WEAPON', '5 зм', 'Лёгкое метательное оружие.'),
  gear('shortsword', 'Короткий меч', 'WEAPON', '10 зм', '1к6 колющего урона.'),
  gear('shortbow', 'Короткий лук', 'WEAPON', '25 зм', 'Дальнобойное оружие.'),
  gear('longbow', 'Длинный лук', 'WEAPON', '50 зм', 'Дальнобойное оружие.'),
  gear(
    'light-crossbow',
    'Лёгкий арбалет',
    'WEAPON',
    '25 зм',
    'Дальнобойное оружие с перезарядкой.',
  ),
  gear('leather-armor', 'Кожаный доспех', 'ARMOR', '10 зм', 'Лёгкий доспех.'),
  gear('scale-mail', 'Чешуйчатый доспех', 'ARMOR', '50 зм', 'Средний доспех.'),
  gear('chain-mail', 'Кольчуга', 'ARMOR', '75 зм', 'Тяжёлый доспех.'),
  gear('shield', 'Щит', 'ARMOR', '10 зм', 'Повышает КД на 2.'),
  gear('explorers-pack', 'Набор путешественника', 'GEAR', '10 зм', 'Базовые припасы для дороги.'),
  gear(
    'scholars-pack',
    'Набор учёного',
    'GEAR',
    '40 зм',
    'Письменные и исследовательские принадлежности.',
  ),
  gear(
    'thieves-tools',
    'Воровские инструменты',
    'GEAR',
    '25 зм',
    'Инструменты для замков и ловушек.',
  ),
  gear('healers-kit', 'Набор целителя', 'GEAR', '5 зм', 'Средства первой помощи.'),
  gear('crowbar', 'Ломик', 'GEAR', '2 зм', 'Даёт рычаг там, где нужна сила.'),
  gear('ink', 'Чернила', 'GEAR', '10 зм', 'Флакон письменных чернил.'),
  gear('gaming-set', 'Игровой набор', 'GEAR', '1 зм', 'Один распространённый набор для игры.'),
  gear('lute', 'Лютня', 'FOCUS', '35 зм', 'Музыкальный инструмент барда.'),
  gear('holy-symbol', 'Священный символ', 'FOCUS', '5 зм', 'Фокус божественной магии.'),
  gear('druidic-focus', 'Фокус друида', 'FOCUS', '1 зм', 'Фокус природной магии.'),
  gear('arcane-focus', 'Магическая фокусировка', 'FOCUS', '10 зм', 'Фокус тайной магии.'),
  gear('spellbook', 'Книга заклинаний', 'GEAR', '50 зм', 'Книга для заклинаний волшебника.'),
];

export const dnd5eBuilds = [
  {
    id: 'guardian-fighter',
    name: 'Защитник группы',
    summary: 'Простой воин передовой: держит удар и прикрывает союзников.',
    classId: 'fighter',
    speciesId: 'dwarf',
    backgroundId: 'soldier',
    abilities: {
      strength: 15,
      dexterity: 10,
      constitution: 14,
      intelligence: 8,
      wisdom: 12,
      charisma: 13,
    },
    skillIds: ['athletics', 'perception'],
    spellIds: [],
    equipmentIds: ['longsword', 'chain-mail', 'shield'],
  },
  {
    id: 'field-cleric',
    name: 'Полевой лекарь',
    summary: 'Жрец поддержки: лечит, усиливает и остаётся рядом с передовой.',
    classId: 'cleric',
    speciesId: 'human',
    backgroundId: 'acolyte',
    abilities: {
      strength: 13,
      dexterity: 10,
      constitution: 14,
      intelligence: 8,
      wisdom: 15,
      charisma: 12,
    },
    skillIds: ['insight', 'medicine'],
    spellIds: ['guidance', 'sacred-flame', 'healing-word', 'bless'],
    equipmentIds: ['mace', 'scale-mail', 'shield', 'holy-symbol'],
  },
  {
    id: 'quiet-scout',
    name: 'Тихий разведчик',
    summary: 'Плут для исследования: замечает опасность, обходит ловушки и атакует из укрытия.',
    classId: 'rogue',
    speciesId: 'halfling',
    backgroundId: 'criminal',
    abilities: {
      strength: 8,
      dexterity: 15,
      constitution: 13,
      intelligence: 12,
      wisdom: 14,
      charisma: 10,
    },
    skillIds: ['stealth', 'perception', 'investigation', 'sleight-of-hand'],
    spellIds: [],
    equipmentIds: ['rapier', 'shortbow', 'leather-armor', 'thieves-tools'],
  },
  {
    id: 'careful-wizard',
    name: 'Осторожный маг',
    summary: 'Волшебник для контроля поля и надёжного урона с расстояния.',
    classId: 'wizard',
    speciesId: 'elf',
    backgroundId: 'sage',
    abilities: {
      strength: 8,
      dexterity: 14,
      constitution: 13,
      intelligence: 15,
      wisdom: 12,
      charisma: 10,
    },
    skillIds: ['arcana', 'investigation'],
    spellIds: ['fire-bolt', 'mage-hand', 'magic-missile', 'shield-spell', 'sleep'],
    equipmentIds: ['quarterstaff', 'spellbook', 'arcane-focus'],
  },
];

export const dnd5eAttribution =
  'This work includes material from the System Reference Document 5.2.1 by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export { dnd5eCharacterOptions } from './dnd5e-character-creation';
