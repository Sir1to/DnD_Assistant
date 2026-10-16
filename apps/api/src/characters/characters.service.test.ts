import { createDnd5eGuidedCharacterDocument } from '@fog-of-lore/domain';
import { describe, expect, it } from 'vitest';

import { changedCharacterDocumentPaths } from './characters.service';

describe('character document audit paths', () => {
  it('records leaf fields and treats list changes as one auditable field', () => {
    const current = createDnd5eGuidedCharacterDocument();
    const next = structuredClone(current);
    next.identity.level = 2;
    next.profile.backstory = 'Новая история';
    next.choices.skillIds = ['athletics'];

    expect(
      changedCharacterDocumentPaths(current, next, 'Герой', 'Герой', 'DRAFT', 'READY'),
    ).toEqual(['/choices/skillIds', '/identity/level', '/profile/backstory', '/status']);
  });

  it('includes a renamed sheet and omits unchanged documents', () => {
    const document = createDnd5eGuidedCharacterDocument();
    expect(
      changedCharacterDocumentPaths(
        document,
        structuredClone(document),
        'До',
        'После',
        'DRAFT',
        'DRAFT',
      ),
    ).toEqual(['/name']);
  });
});
