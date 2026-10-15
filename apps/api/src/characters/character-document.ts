import type { CharacterDocumentV2, CharacterSheetData } from '@fog-of-lore/contracts';
import { characterDocumentV2Schema, characterSheetDataSchema } from '@fog-of-lore/contracts';
import {
  migrateCharacterSheetDataV1,
  projectCharacterDocumentV2ToV1,
  type CharacterCreationMode,
} from '@fog-of-lore/domain';

export function readStoredCharacterDocument(
  data: unknown,
  documentVersion: number,
  creationMode: CharacterCreationMode,
): CharacterDocumentV2 | undefined {
  if (documentVersion === 1) {
    const parsed = characterSheetDataSchema.safeParse(data);
    return parsed.success
      ? characterDocumentV2Schema.parse(
          migrateCharacterSheetDataV1(parsed.data, creationMode).document,
        )
      : undefined;
  }
  if (documentVersion === 2) {
    const parsed = characterDocumentV2Schema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
  }
  return undefined;
}

export function projectStoredCharacterData(
  data: unknown,
  documentVersion: number,
): CharacterSheetData | undefined {
  if (documentVersion === 1) {
    const parsed = characterSheetDataSchema.safeParse(data);
    return parsed.success ? parsed.data : undefined;
  }
  if (documentVersion === 2) {
    const parsed = characterDocumentV2Schema.safeParse(data);
    return parsed.success
      ? characterSheetDataSchema.parse(
          projectCharacterDocumentV2ToV1(parsed.data as CharacterDocumentV2),
        )
      : undefined;
  }
  return undefined;
}
