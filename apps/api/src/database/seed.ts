import 'dotenv/config';

import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import {
  boardViews,
  boards,
  campaignMembers,
  campaigns,
  users,
  widgetInstances,
  widgetPlacements,
} from './schema';

const ids = {
  user: 'a1662b79-dade-4f7d-8d35-81dcb92a25bd',
  campaign: '7c05ce7c-95a1-4d3d-9347-18645598fc6e',
  board: '340a136a-bf87-4df5-ac19-89929a4fb877',
  view: '33d12252-ea6d-4b28-b8e5-259c368efea9',
  notes: '3b482d0e-7013-4c42-9c65-581910eb03c6',
  timer: 'e391b925-e81e-4d55-b153-b326323ff00b',
  dice: 'c26191d9-b494-4bd3-877d-e63795d48458',
  combat: '1d418607-ad8e-490a-a40d-a3e60851626c',
  notesPlacement: '21fbb758-37ca-4d07-b437-c551e29a2c4d',
  timerPlacement: '48a6600f-3354-4479-af3a-fd6d03f1f058',
  dicePlacement: '9dc29a43-5f79-458e-97eb-0082b358218e',
  combatPlacement: 'b8df812b-5c6f-4ace-971e-48c27353b8ac',
} as const;

async function seed(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const demoPassword = process.env.DEMO_PASSWORD;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  if (!demoPassword || demoPassword.length < 12) {
    throw new Error('DEMO_PASSWORD must contain at least 12 characters');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  const passwordHash = await argon2.hash(demoPassword, { type: argon2.argon2id });

  try {
    await database.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({
          id: ids.user,
          email: 'keeper@example.test',
          emailNormalized: 'keeper@example.test',
          passwordHash,
          displayName: 'Хранитель историй',
        })
        .onConflictDoNothing();

      await transaction
        .insert(campaigns)
        .values({
          id: ids.campaign,
          name: 'Пепельный предел',
          description: 'Нейтральная демонстрационная кампания.',
          ownerId: ids.user,
        })
        .onConflictDoNothing();

      await transaction
        .insert(campaignMembers)
        .values({
          campaignId: ids.campaign,
          userId: ids.user,
          role: 'OWNER',
        })
        .onConflictDoNothing();

      await transaction
        .insert(boards)
        .values({
          id: ids.board,
          campaignId: ids.campaign,
          name: 'Мастерская',
        })
        .onConflictDoNothing();

      await transaction
        .insert(boardViews)
        .values({
          id: ids.view,
          boardId: ids.board,
          name: 'Ноутбук мастера',
          slug: 'gm-laptop',
          description: 'Основной демонстрационный вид.',
        })
        .onConflictDoNothing();

      await transaction
        .insert(widgetInstances)
        .values([
          {
            id: ids.notes,
            boardId: ids.board,
            type: 'NOTES',
            title: 'Нити расследования',
            config: { markdown: true },
            state: {
              content:
                '# Перед началом\n\n- Представить старый тракт\n- Напомнить о серебряном тумане\n- Записать решения группы',
            },
          },
          {
            id: ids.timer,
            boardId: ids.board,
            type: 'TIMER',
            title: 'Таймер сцены',
            config: { soundEnabled: false },
            state: {
              mode: 'COUNTDOWN',
              status: 'IDLE',
              durationMs: 300_000,
              accumulatedMs: 0,
              startedAt: null,
              lastChangedAt: '2026-01-01T00:00:00.000Z',
            },
          },
          {
            id: ids.dice,
            boardId: ids.board,
            type: 'DICE',
            title: 'Случайности',
            config: {},
            state: {
              history: [],
              tableItems: ['Таинственный след', 'Неожиданный союзник', 'Опасная находка'],
            },
          },
          {
            id: ids.combat,
            boardId: ids.board,
            type: 'COMBAT',
            title: 'Встреча у старого моста',
            config: {},
            state: {
              name: 'Встреча у старого моста',
              status: 'ACTIVE',
              participants: [],
              activeParticipantId: null,
              round: 1,
              startedAt: null,
              finishedAt: null,
            },
          },
        ])
        .onConflictDoNothing();

      await transaction
        .insert(widgetPlacements)
        .values([
          {
            id: ids.notesPlacement,
            boardViewId: ids.view,
            widgetInstanceId: ids.notes,
            x: 0,
            y: 0,
            width: 5,
            height: 5,
            minimumWidth: 3,
            minimumHeight: 3,
          },
          {
            id: ids.timerPlacement,
            boardViewId: ids.view,
            widgetInstanceId: ids.timer,
            x: 5,
            y: 0,
            width: 4,
            height: 4,
            minimumWidth: 3,
            minimumHeight: 3,
          },
          {
            id: ids.dicePlacement,
            boardViewId: ids.view,
            widgetInstanceId: ids.dice,
            x: 0,
            y: 5,
            width: 5,
            height: 5,
            minimumWidth: 4,
            minimumHeight: 4,
          },
          {
            id: ids.combatPlacement,
            boardViewId: ids.view,
            widgetInstanceId: ids.combat,
            x: 5,
            y: 5,
            width: 7,
            height: 7,
            minimumWidth: 6,
            minimumHeight: 5,
          },
        ])
        .onConflictDoNothing();
    });
  } finally {
    await pool.end();
  }
}

void seed();
