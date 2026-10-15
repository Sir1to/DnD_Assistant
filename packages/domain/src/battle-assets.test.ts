import { describe, expect, it } from 'vitest';

import {
  BATTLE_SYSTEM_ASSET_PACK,
  battleSystemAssetById,
  battleSystemAssets,
  battleSystemAssetsFor,
  defaultBattleSystemAssetId,
} from './battle-assets';

describe('battle system asset catalog', () => {
  it('keeps the starter catalog stable, unique and fully attributed', () => {
    expect(battleSystemAssets).toHaveLength(64);
    expect(new Set(battleSystemAssets.map(({ id }) => id)).size).toBe(64);
    expect(battleSystemAssets.map(({ id }) => id)).toContain('starter.background.forest.clearing');
    expect(battleSystemAssets.map(({ id }) => id)).toContain('starter.token.urban.captain');

    for (const asset of battleSystemAssets) {
      expect(asset.packId).toBe(BATTLE_SYSTEM_ASSET_PACK.id);
      expect(asset.packVersion).toBe(BATTLE_SYSTEM_ASSET_PACK.version);
      expect(asset.source).toBeTruthy();
      expect(asset.license).toBeTruthy();
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(battleSystemAssetById(asset.id)).toBe(asset);
    }
  });

  it('filters by kind and terrain and chooses deterministic defaults', () => {
    const forestTokens = battleSystemAssetsFor('TOKEN', 'FOREST');
    expect(forestTokens).toHaveLength(2);
    expect(
      forestTokens.every(({ kind, terrain }) => kind === 'TOKEN' && terrain === 'FOREST'),
    ).toBe(true);
    expect(defaultBattleSystemAssetId('TOKEN', 'FOREST', 0)).toBe(forestTokens[0]!.id);
    expect(defaultBattleSystemAssetId('TOKEN', 'FOREST', 2)).toBe(forestTokens[0]!.id);
    expect(defaultBattleSystemAssetId('TOKEN', 'FOREST', 3)).toBe(forestTokens[1]!.id);
    expect(battleSystemAssetById('starter.prop.missing')).toBeNull();
  });
});
