import { z } from 'zod';

export const timerModeSchema = z.enum(['COUNTDOWN', 'STOPWATCH']);
export const timerStatusSchema = z.enum(['IDLE', 'RUNNING', 'PAUSED']);
export const timerConfigSchema = z.object({
  soundEnabled: z.boolean().default(false),
});
export const timerStateSchema = z.object({
  mode: timerModeSchema,
  status: timerStatusSchema,
  durationMs: z.int().min(1_000).max(604_800_000),
  accumulatedMs: z.int().nonnegative().max(2_592_000_000),
  startedAt: z.iso.datetime().nullable(),
  lastChangedAt: z.iso.datetime(),
});

export const diceHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['DICE', 'TABLE']),
  label: z.string().max(200),
  result: z.string().max(500),
  details: z.array(z.int()).max(100),
  occurredAt: z.iso.datetime(),
});
export const diceConfigSchema = z.object({});
export const diceStateSchema = z.object({
  history: z.array(diceHistoryEntrySchema).max(30),
  tableItems: z.array(z.string().trim().min(1).max(200)).max(100),
});

export const participantGroupSchema = z.enum(['PLAYER', 'ALLY', 'ENEMY']);
export const encounterParticipantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  group: participantGroupSchema,
  initiative: z.number().finite().min(-1000).max(1000),
  currentHp: z.int().min(-999_999).max(999_999),
  maxHp: z.int().positive().max(999_999),
  armorClass: z.int().min(-1000).max(1000).nullable(),
  temporaryHp: z.int().nonnegative().max(999_999),
  conditions: z.array(z.string().trim().min(1).max(80)).max(30),
  note: z.string().max(2000),
  hidden: z.boolean(),
  order: z.int().nonnegative(),
});
export const combatConfigSchema = z.object({});
export const combatStateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  status: z.enum(['ACTIVE', 'FINISHED']),
  participants: z.array(encounterParticipantSchema).max(200),
  activeParticipantId: z.string().uuid().nullable(),
  round: z.int().positive(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});

export const newParticipantSchema = encounterParticipantSchema.omit({ id: true, order: true });
export const participantChangesSchema = newParticipantSchema.partial();

export const timerCommandRequestSchema = z.object({
  widgetType: z.literal('TIMER'),
  expectedRevision: z.int().nonnegative(),
  command: z.enum([
    'TIMER_START',
    'TIMER_PAUSE',
    'TIMER_RESET',
    'TIMER_SET_DURATION',
    'TIMER_SET_MODE',
  ]),
  durationMs: z.int().min(1_000).max(604_800_000).optional(),
  mode: timerModeSchema.optional(),
});

export const diceCommandRequestSchema = z.object({
  widgetType: z.literal('DICE'),
  expectedRevision: z.int().nonnegative(),
  command: z.enum(['DICE_ROLL', 'DICE_CLEAR', 'DICE_SET_TABLE', 'DICE_PICK_TABLE']),
  expression: z.string().trim().min(1).max(16).optional(),
  tableItems: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
});

export const combatCommandRequestSchema = z.object({
  widgetType: z.literal('COMBAT'),
  expectedRevision: z.int().nonnegative(),
  command: z.enum([
    'COMBAT_ADD_PARTICIPANT',
    'COMBAT_UPDATE_PARTICIPANT',
    'COMBAT_REMOVE_PARTICIPANT',
    'COMBAT_MOVE_PARTICIPANT',
    'COMBAT_NEXT_TURN',
    'COMBAT_PREVIOUS_TURN',
    'COMBAT_DAMAGE',
    'COMBAT_HEAL',
    'COMBAT_SET_TEMP_HP',
    'COMBAT_FINISH',
    'COMBAT_REOPEN',
    'COMBAT_RENAME',
  ]),
  participant: newParticipantSchema.optional(),
  participantId: z.string().uuid().optional(),
  changes: participantChangesSchema.optional(),
  direction: z.enum(['UP', 'DOWN']).optional(),
  amount: z.int().nonnegative().max(999_999).optional(),
  name: z.string().trim().min(1).max(160).optional(),
});

export const widgetCommandRequestSchema = z.discriminatedUnion('widgetType', [
  timerCommandRequestSchema,
  diceCommandRequestSchema,
  combatCommandRequestSchema,
]);

export type TimerMode = z.infer<typeof timerModeSchema>;
export type TimerState = z.infer<typeof timerStateSchema>;
export type DiceHistoryEntry = z.infer<typeof diceHistoryEntrySchema>;
export type DiceState = z.infer<typeof diceStateSchema>;
export type EncounterParticipant = z.infer<typeof encounterParticipantSchema>;
export type CombatState = z.infer<typeof combatStateSchema>;
export type TimerCommandRequest = z.infer<typeof timerCommandRequestSchema>;
export type DiceCommandRequest = z.infer<typeof diceCommandRequestSchema>;
export type CombatCommandRequest = z.infer<typeof combatCommandRequestSchema>;
export type WidgetCommandRequest = z.infer<typeof widgetCommandRequestSchema>;
