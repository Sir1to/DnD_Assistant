import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  adjustBattleHpRequestSchema,
  createBattleCombatantRequestSchema,
  createBattleObstacleRequestSchema,
  createBattleSceneObjectRequestSchema,
  createBattleSceneSaveRequestSchema,
  createBattleSceneRequestSchema,
  duplicateBattleCombatantPresetRequestSchema,
  generateRandomBattleMapRequestSchema,
  importBattleEncounterRequestSchema,
  importBattleCombatantPresetRequestSchema,
  importPortableBattleCombatantPresetRequestSchema,
  placeCharacterOnBattleRequestSchema,
  moveBattleTokenRequestSchema,
  nextBattleTurnRequestSchema,
  saveBattleCombatantPresetRequestSchema,
  saveCharacterSheetAsBattlePresetRequestSchema,
  updateBattleCombatantRequestSchema,
  updateBattleCombatantPresetRequestSchema,
  updateBattleObstacleRequestSchema,
  updateBattleSceneObjectRequestSchema,
  updateBattleSceneRequestSchema,
  updateBattleTokenRequestSchema,
  type AdjustBattleHpRequest,
  type BattleSceneSnapshot,
  type BattleSceneSave,
  type BattleCombatantPreset,
  type CreateBattleCombatantRequest,
  type CreateBattleObstacleRequest,
  type CreateBattleSceneObjectRequest,
  type CreateBattleSceneSaveRequest,
  type CreateBattleSceneRequest,
  type DuplicateBattleCombatantPresetRequest,
  type GenerateRandomBattleMapRequest,
  type GeneratedRandomBattleMap,
  type ImportBattleEncounterRequest,
  type ImportBattleCombatantPresetRequest,
  type ImportPortableBattleCombatantPresetRequest,
  type PlaceCharacterOnBattleRequest,
  type MoveBattleTokenRequest,
  type NextBattleTurnRequest,
  type PortableBattleCombatantPreset,
  type SaveBattleCombatantPresetRequest,
  type SaveCharacterSheetAsBattlePresetRequest,
  type UpdateBattleCombatantRequest,
  type UpdateBattleCombatantPresetRequest,
  type UpdateBattleObstacleRequest,
  type UpdateBattleSceneObjectRequest,
  type UpdateBattleSceneRequest,
  type UpdateBattleTokenRequest,
} from '@fog-of-lore/contracts';
import type { Response } from 'express';

import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BattleService } from './battle.service';
import { LoreAttachmentsService } from './lore-attachments.service';

@Controller()
@UseGuards(SessionAuthGuard)
export class BattleController {
  public constructor(
    @Inject(BattleService) private readonly battle: BattleService,
    @Inject(LoreAttachmentsService) private readonly attachments: LoreAttachmentsService,
  ) {}

  @Get('campaigns/:campaignId/battle')
  public get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.get(user.id, campaignId);
  }

  @Post('campaigns/:campaignId/battle')
  public createScene(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(createBattleSceneRequestSchema)) input: CreateBattleSceneRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.createScene(user.id, campaignId, input);
  }

  @Post('campaigns/:campaignId/battle/encounter')
  public importEncounter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(importBattleEncounterRequestSchema))
    input: ImportBattleEncounterRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.importEncounter(user.id, campaignId, input);
  }

  @Post('campaigns/:campaignId/battle/generate')
  public generateRandomMap(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(generateRandomBattleMapRequestSchema))
    input: GenerateRandomBattleMapRequest,
  ): Promise<GeneratedRandomBattleMap> {
    return this.battle.generateRandomMap(user.id, campaignId, input);
  }

  @Get('campaigns/:campaignId/battle-saves')
  public listSaves(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<BattleSceneSave[]> {
    return this.battle.listSaves(user.id, campaignId);
  }

  @Get('campaigns/:campaignId/battle-combatant-presets')
  public listCombatantPresets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
  ): Promise<BattleCombatantPreset[]> {
    return this.battle.listCombatantPresets(user.id, campaignId);
  }

  @Post('battle-scenes/:sceneId/saves')
  public saveScene(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(createBattleSceneSaveRequestSchema))
    input: CreateBattleSceneSaveRequest,
  ): Promise<BattleSceneSave> {
    return this.battle.saveScene(user.id, sceneId, input);
  }

  @Post('battle-scene-saves/:saveId/open')
  public openSave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('saveId', new ParseUUIDPipe({ version: '4' })) saveId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.openSave(user.id, saveId);
  }

  @Delete('battle-scene-saves/:saveId')
  public async removeSave(
    @CurrentUser() user: AuthenticatedUser,
    @Param('saveId', new ParseUUIDPipe({ version: '4' })) saveId: string,
  ): Promise<void> {
    await this.battle.removeSave(user.id, saveId);
  }

  @Patch('battle-scenes/:sceneId')
  public updateScene(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(updateBattleSceneRequestSchema)) input: UpdateBattleSceneRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.updateScene(user.id, sceneId, input);
  }

  @Delete('battle-scenes/:sceneId')
  public resetScene(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.resetScene(user.id, sceneId);
  }

  @Post('battle-scenes/:sceneId/combatants')
  public addCombatant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(createBattleCombatantRequestSchema))
    input: CreateBattleCombatantRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.addCombatant(user.id, sceneId, input);
  }

  @Post('battle-scenes/:sceneId/characters/:sheetId/place')
  public placeCharacter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(placeCharacterOnBattleRequestSchema))
    input: PlaceCharacterOnBattleRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.placeCharacter(user.id, sceneId, sheetId, input);
  }

  @Post('battle-combatants/:combatantId/preset')
  public saveCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('combatantId', new ParseUUIDPipe({ version: '4' })) combatantId: string,
    @Body(new ZodValidationPipe(saveBattleCombatantPresetRequestSchema))
    input: SaveBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    return this.battle.saveCombatantPreset(user.id, combatantId, input);
  }

  @Post('characters/:sheetId/battle-combatant-preset')
  public saveCharacterSheetAsCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sheetId', new ParseUUIDPipe({ version: '4' })) sheetId: string,
    @Body(new ZodValidationPipe(saveCharacterSheetAsBattlePresetRequestSchema))
    input: SaveCharacterSheetAsBattlePresetRequest,
  ): Promise<BattleCombatantPreset> {
    return this.battle.saveCharacterSheetAsCombatantPreset(user.id, sheetId, input);
  }

  @Patch('battle-combatant-presets/:presetId')
  public updateCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('presetId', new ParseUUIDPipe({ version: '4' })) presetId: string,
    @Body(new ZodValidationPipe(updateBattleCombatantPresetRequestSchema))
    input: UpdateBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    return this.battle.updateCombatantPreset(user.id, presetId, input);
  }

  @Post('battle-combatant-presets/:presetId/duplicate')
  public duplicateCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('presetId', new ParseUUIDPipe({ version: '4' })) presetId: string,
    @Body(new ZodValidationPipe(duplicateBattleCombatantPresetRequestSchema))
    input: DuplicateBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    return this.battle.duplicateCombatantPreset(user.id, presetId, input);
  }

  @Get('battle-combatant-presets/:presetId/export')
  public exportCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('presetId', new ParseUUIDPipe({ version: '4' })) presetId: string,
  ): Promise<PortableBattleCombatantPreset> {
    return this.battle.exportCombatantPreset(user.id, presetId);
  }

  @Post('campaigns/:campaignId/battle-combatant-presets/import')
  public importPortableCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('campaignId', new ParseUUIDPipe({ version: '4' })) campaignId: string,
    @Body(new ZodValidationPipe(importPortableBattleCombatantPresetRequestSchema))
    input: ImportPortableBattleCombatantPresetRequest,
  ): Promise<BattleCombatantPreset> {
    return this.battle.importPortableCombatantPreset(user.id, campaignId, input);
  }

  @Post('battle-scenes/:sceneId/combatant-presets/:presetId/import')
  public importCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Param('presetId', new ParseUUIDPipe({ version: '4' })) presetId: string,
    @Body(new ZodValidationPipe(importBattleCombatantPresetRequestSchema))
    input: ImportBattleCombatantPresetRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.importCombatantPreset(user.id, sceneId, presetId, input);
  }

  @Delete('battle-combatant-presets/:presetId')
  @HttpCode(204)
  public async removeCombatantPreset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('presetId', new ParseUUIDPipe({ version: '4' })) presetId: string,
  ): Promise<void> {
    await this.battle.removeCombatantPreset(user.id, presetId);
  }

  @Post('battle-scenes/:sceneId/obstacles')
  public addObstacle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(createBattleObstacleRequestSchema))
    input: CreateBattleObstacleRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.addObstacle(user.id, sceneId, input);
  }

  @Delete('battle-scene-obstacles/:obstacleId')
  public removeObstacle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('obstacleId', new ParseUUIDPipe({ version: '4' })) obstacleId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.removeObstacle(user.id, obstacleId);
  }

  @Patch('battle-scene-obstacles/:obstacleId')
  public updateObstacle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('obstacleId', new ParseUUIDPipe({ version: '4' })) obstacleId: string,
    @Body(new ZodValidationPipe(updateBattleObstacleRequestSchema))
    input: UpdateBattleObstacleRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.updateObstacle(user.id, obstacleId, input);
  }

  @Post('battle-scenes/:sceneId/objects')
  public addSceneObject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(createBattleSceneObjectRequestSchema))
    input: CreateBattleSceneObjectRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.addSceneObject(user.id, sceneId, input);
  }

  @Patch('battle-scene-objects/:objectId')
  public updateSceneObject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('objectId', new ParseUUIDPipe({ version: '4' })) objectId: string,
    @Body(new ZodValidationPipe(updateBattleSceneObjectRequestSchema))
    input: UpdateBattleSceneObjectRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.updateSceneObject(user.id, objectId, input);
  }

  @Post('battle-scene-objects/:objectId/hp')
  public adjustSceneObjectHp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('objectId', new ParseUUIDPipe({ version: '4' })) objectId: string,
    @Body(new ZodValidationPipe(adjustBattleHpRequestSchema)) input: AdjustBattleHpRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.adjustSceneObjectHp(user.id, objectId, input);
  }

  @Delete('battle-scene-objects/:objectId')
  public removeSceneObject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('objectId', new ParseUUIDPipe({ version: '4' })) objectId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.removeSceneObject(user.id, objectId);
  }

  @Patch('battle-combatants/:combatantId')
  public updateCombatant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('combatantId', new ParseUUIDPipe({ version: '4' })) combatantId: string,
    @Body(new ZodValidationPipe(updateBattleCombatantRequestSchema))
    input: UpdateBattleCombatantRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.updateCombatant(user.id, combatantId, input);
  }

  @Delete('battle-combatants/:combatantId')
  public removeCombatant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('combatantId', new ParseUUIDPipe({ version: '4' })) combatantId: string,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.removeCombatant(user.id, combatantId);
  }

  @Post('battle-tokens/:tokenId/move')
  public moveToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string,
    @Body(new ZodValidationPipe(moveBattleTokenRequestSchema)) input: MoveBattleTokenRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.moveToken(user.id, tokenId, input);
  }

  @Patch('battle-tokens/:tokenId')
  public updateToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string,
    @Body(new ZodValidationPipe(updateBattleTokenRequestSchema)) input: UpdateBattleTokenRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.updateToken(user.id, tokenId, input);
  }

  @Post('battle-combatants/:combatantId/hp')
  public adjustHp(
    @CurrentUser() user: AuthenticatedUser,
    @Param('combatantId', new ParseUUIDPipe({ version: '4' })) combatantId: string,
    @Body(new ZodValidationPipe(adjustBattleHpRequestSchema)) input: AdjustBattleHpRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.adjustHp(user.id, combatantId, input);
  }

  @Post('battle-scenes/:sceneId/next-turn')
  public nextTurn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Body(new ZodValidationPipe(nextBattleTurnRequestSchema)) input: NextBattleTurnRequest,
  ): Promise<BattleSceneSnapshot> {
    return this.battle.nextTurn(user.id, sceneId, input);
  }

  @Get('battle-scenes/:sceneId/background')
  public async background(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sceneId', new ParseUUIDPipe({ version: '4' })) sceneId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const reference = await this.battle.background(user.id, sceneId);
    const { attachment, buffer } = await this.attachments.readForBattleScene(
      reference.attachmentId,
      reference.campaignId,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.size));
    response.setHeader('Cache-Control', 'private, max-age=60');
    return new StreamableFile(buffer);
  }

  @Get('battle-tokens/:tokenId/image')
  public async tokenImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tokenId', new ParseUUIDPipe({ version: '4' })) tokenId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const reference = await this.battle.tokenImage(user.id, tokenId);
    return this.streamBattleImage(reference, response);
  }

  @Get('battle-scene-objects/:objectId/image')
  public async objectImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('objectId', new ParseUUIDPipe({ version: '4' })) objectId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const reference = await this.battle.objectImage(user.id, objectId);
    return this.streamBattleImage(reference, response);
  }

  private async streamBattleImage(
    reference: { attachmentId: string; campaignId: string },
    response: Response,
  ): Promise<StreamableFile> {
    const { attachment, buffer } = await this.attachments.readForBattleScene(
      reference.attachmentId,
      reference.campaignId,
    );
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Length', String(attachment.size));
    response.setHeader('Cache-Control', 'private, max-age=60');
    return new StreamableFile(buffer);
  }
}
