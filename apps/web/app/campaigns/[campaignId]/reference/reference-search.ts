import type { CharacterOptionsResponse, Dnd5eMonsterSummary } from '@fog-of-lore/contracts';
import type { Dnd5eFormulaGroup } from '@fog-of-lore/domain';

export type ReferenceSearchCategory = 'MONSTER' | 'SPELL' | 'EQUIPMENT' | 'RULE';

export type ReferenceSearchResult = {
  category: ReferenceSearchCategory;
  id: string;
  title: string;
  eyebrow: string;
  description: string;
};

export type ReferenceSearchSource = {
  monsters: Dnd5eMonsterSummary[];
  spells: CharacterOptionsResponse['spells'];
  equipment: CharacterOptionsResponse['equipment'];
  formulaGroups: Dnd5eFormulaGroup[];
};

export type ReferenceSearchGroup = {
  category: ReferenceSearchCategory;
  total: number;
  results: ReferenceSearchResult[];
};

export type ReferenceSearchResponse = {
  query: string;
  total: number;
  groups: ReferenceSearchGroup[];
};

type SearchCandidate = ReferenceSearchResult & {
  searchable: string;
};

const categoryOrder: ReferenceSearchCategory[] = ['MONSTER', 'SPELL', 'EQUIPMENT', 'RULE'];

export function searchReference(
  query: string,
  source: ReferenceSearchSource,
  limitPerCategory = 5,
): ReferenceSearchResponse {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return { query: '', total: 0, groups: [] };

  const tokens = [...new Set(normalizedQuery.split(/\s+/).filter(Boolean))];
  const candidates = buildCandidates(source);
  const groups = categoryOrder.flatMap((category): ReferenceSearchGroup[] => {
    const matches = candidates
      .filter((candidate) => candidate.category === category)
      .flatMap((candidate) => {
        const score = scoreCandidate(candidate, normalizedQuery, tokens);
        return score === null ? [] : [{ candidate, score }];
      })
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.candidate.title.localeCompare(right.candidate.title, 'ru'),
      );

    if (matches.length === 0) return [];
    return [
      {
        category,
        total: matches.length,
        results: matches.slice(0, Math.max(1, limitPerCategory)).map(({ candidate }) => ({
          category: candidate.category,
          id: candidate.id,
          title: candidate.title,
          eyebrow: candidate.eyebrow,
          description: candidate.description,
        })),
      },
    ];
  });

  return {
    query: query.trim(),
    total: groups.reduce((sum, group) => sum + group.total, 0),
    groups,
  };
}

export function referenceResultAnchor(result: Pick<ReferenceSearchResult, 'category' | 'id'>) {
  return `reference-${result.category.toLocaleLowerCase('en-US')}-${result.id}`;
}

function buildCandidates(source: ReferenceSearchSource): SearchCandidate[] {
  return [
    ...source.monsters.map((monster): SearchCandidate => ({
      category: 'MONSTER',
      id: monster.id,
      title: monster.name,
      eyebrow: `Существо · CR ${monster.challengeRating}`,
      description: `${monster.size} ${monster.type} · КД ${monster.armorClass} · ${monster.hitPoints} HP`,
      searchable: searchableText(
        monster.name,
        monster.size,
        monster.type,
        `CR ${monster.challengeRating}`,
        `${monster.experiencePoints} XP`,
      ),
    })),
    ...source.spells.map((spell): SearchCandidate => ({
      category: 'SPELL',
      id: spell.id,
      title: spell.name,
      eyebrow: spell.level === 0 ? 'Заклинание · Заговор' : `Заклинание · ${spell.level} уровень`,
      description: spell.description,
      searchable: searchableText(
        spell.name,
        spell.description,
        spell.level === 0 ? 'заговор' : `${spell.level} уровень`,
        ...spell.classIds,
      ),
    })),
    ...source.equipment.map((item): SearchCandidate => ({
      category: 'EQUIPMENT',
      id: item.id,
      title: item.name,
      eyebrow: `Предмет · ${equipmentCategoryLabel(item.category)} · ${item.cost}`,
      description: item.description,
      searchable: searchableText(
        item.name,
        item.description,
        item.category,
        equipmentCategoryLabel(item.category),
        item.cost,
      ),
    })),
    ...source.formulaGroups.flatMap((group) =>
      group.formulas.map((formula): SearchCandidate => ({
        category: 'RULE',
        id: formula.id,
        title: formula.title,
        eyebrow: `Правило · ${group.title}`,
        description: `${formula.formula} — ${formula.explanation}`,
        searchable: searchableText(
          group.title,
          group.summary,
          formula.title,
          formula.formula,
          formula.explanation,
          formula.note,
        ),
      })),
    ),
  ];
}

function scoreCandidate(candidate: SearchCandidate, query: string, tokens: string[]) {
  const title = normalizeSearchText(candidate.title);
  if (!tokens.every((token) => candidate.searchable.includes(token))) return null;

  let score = 0;
  if (title === query) score += 1_000;
  else if (title.startsWith(query)) score += 700;
  else if (title.includes(query)) score += 450;

  for (const token of tokens) {
    if (title === token) score += 160;
    else if (title.startsWith(token)) score += 120;
    else if (title.includes(token)) score += 80;
    else score += 20;
  }
  return score;
}

function searchableText(...values: Array<string | number | undefined>) {
  return normalizeSearchText(values.filter((value) => value !== undefined).join(' '));
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replaceAll('ё', 'е')
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}/+]+/gu, ' ')
    .trim();
}

function equipmentCategoryLabel(
  category: CharacterOptionsResponse['equipment'][number]['category'],
) {
  return {
    WEAPON: 'Оружие',
    ARMOR: 'Доспех',
    GEAR: 'Снаряжение',
    FOCUS: 'Фокус',
  }[category];
}
