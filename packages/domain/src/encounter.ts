export type ParticipantGroup = 'PLAYER' | 'ALLY' | 'ENEMY';

export interface EncounterParticipant {
  id: string;
  name: string;
  group: ParticipantGroup;
  initiative: number;
  currentHp: number;
  maxHp: number;
  armorClass: number | null;
  temporaryHp: number;
  conditions: string[];
  note: string;
  hidden: boolean;
  order: number;
}

export interface EncounterState {
  name: string;
  status: 'ACTIVE' | 'FINISHED';
  participants: EncounterParticipant[];
  activeParticipantId: string | null;
  round: number;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface EncounterSimulationInput {
  encounter: EncounterState;
  iterations: number;
}

export interface EncounterSimulationResult {
  completedIterations: number;
  summary: Record<string, number>;
}

export interface EncounterSimulator {
  simulate(input: EncounterSimulationInput): Promise<EncounterSimulationResult>;
}

export function sortParticipants(
  participants: readonly EncounterParticipant[],
): EncounterParticipant[] {
  return [...participants].sort(
    (left, right) => right.initiative - left.initiative || left.order - right.order,
  );
}

export function nextTurn(state: EncounterState, now: Date): EncounterState {
  const participants = sortParticipants(state.participants);
  if (participants.length === 0) return { ...state, activeParticipantId: null };
  const activeIndex = participants.findIndex(({ id }) => id === state.activeParticipantId);
  const nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % participants.length;
  const wrapped = activeIndex >= 0 && nextIndex === 0;
  return {
    ...state,
    status: 'ACTIVE',
    participants,
    activeParticipantId: participants[nextIndex]?.id ?? null,
    round: wrapped ? state.round + 1 : Math.max(1, state.round),
    startedAt: state.startedAt ?? now.toISOString(),
    finishedAt: null,
  };
}

export function previousTurn(state: EncounterState): EncounterState {
  const participants = sortParticipants(state.participants);
  if (participants.length === 0) return { ...state, activeParticipantId: null };
  const activeIndex = participants.findIndex(({ id }) => id === state.activeParticipantId);
  const previousIndex =
    activeIndex < 0
      ? participants.length - 1
      : (activeIndex - 1 + participants.length) % participants.length;
  const wrapped = activeIndex === 0;
  return {
    ...state,
    participants,
    activeParticipantId: participants[previousIndex]?.id ?? null,
    round: wrapped ? Math.max(1, state.round - 1) : Math.max(1, state.round),
  };
}

export function removeParticipant(state: EncounterState, participantId: string): EncounterState {
  const participants = sortParticipants(
    state.participants.filter(({ id }) => id !== participantId),
  );
  if (state.activeParticipantId !== participantId) return { ...state, participants };
  return {
    ...state,
    participants,
    activeParticipantId: participants[0]?.id ?? null,
  };
}

export function applyDamage(
  participant: EncounterParticipant,
  amount: number,
): EncounterParticipant {
  const absorbed = Math.min(participant.temporaryHp, amount);
  return {
    ...participant,
    temporaryHp: participant.temporaryHp - absorbed,
    currentHp: Math.max(0, participant.currentHp - (amount - absorbed)),
  };
}

export function applyHealing(
  participant: EncounterParticipant,
  amount: number,
): EncounterParticipant {
  return {
    ...participant,
    currentHp: Math.min(participant.maxHp, participant.currentHp + amount),
  };
}

export function moveParticipantWithinInitiative(
  state: EncounterState,
  participantId: string,
  direction: 'UP' | 'DOWN',
): EncounterState {
  const participants = sortParticipants(state.participants);
  const index = participants.findIndex(({ id }) => id === participantId);
  const targetIndex = direction === 'UP' ? index - 1 : index + 1;
  const participant = participants[index];
  const target = participants[targetIndex];
  if (!participant || !target || participant.initiative !== target.initiative) return state;

  const left = { ...participant, order: target.order };
  const right = { ...target, order: participant.order };
  return {
    ...state,
    participants: sortParticipants(
      participants.map((item) =>
        item.id === left.id ? left : item.id === right.id ? right : item,
      ),
    ),
  };
}
