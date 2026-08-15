import {
  combatConfigSchema,
  combatStateSchema,
  type CombatCommandRequest,
  type CombatState,
  type EncounterParticipant,
} from '@fog-of-lore/contracts';
import {
  applyDamage,
  applyHealing,
  moveParticipantWithinInitiative,
  nextTurn,
  previousTurn,
  removeParticipant,
  sortParticipants,
} from '@fog-of-lore/domain';

import type { WidgetDefinition } from './widget-definition';

export const combatDefinition: WidgetDefinition = {
  catalog: {
    type: 'COMBAT',
    displayName: 'Трекер боя',
    defaultTitle: 'Новый бой',
    description: 'Инициатива, здоровье, состояния, раунды и активный ход.',
    schemaVersion: 1,
    defaultWidth: 8,
    defaultHeight: 7,
    minimumWidth: 6,
    minimumHeight: 5,
  },
  configSchema: combatConfigSchema,
  stateSchema: combatStateSchema,
  defaultConfig: {},
  createDefaultState: () => ({
    name: 'Новый бой',
    status: 'ACTIVE',
    participants: [],
    activeParticipantId: null,
    round: 1,
    startedAt: null,
    finishedAt: null,
  }),
  executeCommand: (rawState, rawCommand, context) => {
    const state = combatStateSchema.parse(rawState) as CombatState;
    const command = rawCommand as CombatCommandRequest;
    const turnEvent =
      command.command === 'COMBAT_NEXT_TURN' || command.command === 'COMBAT_PREVIOUS_TURN';
    let nextState: CombatState;

    switch (command.command) {
      case 'COMBAT_ADD_PARTICIPANT': {
        if (!command.participant) throw new Error('Participant data is required');
        const participant: EncounterParticipant = {
          ...command.participant,
          id: context.randomId(),
          order:
            state.participants.reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1,
        };
        nextState = {
          ...state,
          participants: sortParticipants([...state.participants, participant]),
        };
        break;
      }
      case 'COMBAT_UPDATE_PARTICIPANT':
        nextState = {
          ...state,
          participants: sortParticipants(
            state.participants.map((participant) =>
              participant.id === requireParticipantId(command)
                ? { ...participant, ...requireChanges(command) }
                : participant,
            ),
          ),
        };
        break;
      case 'COMBAT_REMOVE_PARTICIPANT':
        nextState = removeParticipant(state, requireParticipantId(command));
        break;
      case 'COMBAT_MOVE_PARTICIPANT':
        if (!command.direction) throw new Error('Move direction is required');
        nextState = moveParticipantWithinInitiative(
          state,
          requireParticipantId(command),
          command.direction,
        );
        break;
      case 'COMBAT_NEXT_TURN':
        nextState = nextTurn(state, context.now);
        break;
      case 'COMBAT_PREVIOUS_TURN':
        nextState = previousTurn(state);
        break;
      case 'COMBAT_DAMAGE':
        nextState = updateParticipant(state, requireParticipantId(command), (participant) =>
          applyDamage(participant, requireAmount(command)),
        );
        break;
      case 'COMBAT_HEAL':
        nextState = updateParticipant(state, requireParticipantId(command), (participant) =>
          applyHealing(participant, requireAmount(command)),
        );
        break;
      case 'COMBAT_SET_TEMP_HP':
        nextState = updateParticipant(state, requireParticipantId(command), (participant) => ({
          ...participant,
          temporaryHp: requireAmount(command),
        }));
        break;
      case 'COMBAT_FINISH':
        nextState = {
          ...state,
          status: 'FINISHED',
          activeParticipantId: null,
          finishedAt: context.now.toISOString(),
        };
        break;
      case 'COMBAT_REOPEN':
        nextState = { ...state, status: 'ACTIVE', finishedAt: null };
        break;
      case 'COMBAT_RENAME':
        if (!command.name) throw new Error('Encounter name is required');
        nextState = { ...state, name: command.name };
        break;
    }

    return {
      state: nextState,
      eventName: turnEvent ? 'encounter.turn.changed' : 'encounter.updated',
    };
  },
};

function requireParticipantId(command: CombatCommandRequest): string {
  if (!command.participantId) throw new Error('Participant id is required');
  return command.participantId;
}

function requireChanges(
  command: CombatCommandRequest,
): NonNullable<CombatCommandRequest['changes']> {
  if (!command.changes) throw new Error('Participant changes are required');
  return command.changes;
}

function requireAmount(command: CombatCommandRequest): number {
  if (command.amount === undefined) throw new Error('Amount is required');
  return command.amount;
}

function updateParticipant(
  state: CombatState,
  participantId: string,
  update: (participant: EncounterParticipant) => EncounterParticipant,
): CombatState {
  return {
    ...state,
    participants: state.participants.map((participant) =>
      participant.id === participantId ? update(participant) : participant,
    ),
  };
}
