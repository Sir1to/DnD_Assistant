import 'dotenv/config';

import argon2 from 'argon2';
import { and, eq, ne } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import { campaignMembers, campaigns, users } from './schema';

const requestedUsersSchema = z
  .array(
    z.object({
      login: z
        .string()
        .trim()
        .regex(/^[a-z0-9_-]{1,40}$/i),
      password: z.string().min(1).max(128),
      displayName: z.string().trim().min(1).max(80),
      campaignRole: z.enum(['GM', 'PLAYER']),
    }),
  )
  .min(1)
  .max(20);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const serializedUsers = process.env.FOG_BOOTSTRAP_USERS;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  if (!serializedUsers) throw new Error('FOG_BOOTSTRAP_USERS is required');
  const requestedUsers = requestedUsersSchema.parse(JSON.parse(serializedUsers));
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle(pool);
  try {
    const campaignRows = await database.select({ id: campaigns.id }).from(campaigns);
    for (const requested of requestedUsers) {
      const email = `${requested.login.toLowerCase()}@fog.local`;
      const passwordHash = await argon2.hash(requested.password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      await database.transaction(async (transaction) => {
        const [account] = await transaction
          .insert(users)
          .values({
            email,
            emailNormalized: email,
            passwordHash,
            displayName: requested.displayName,
          })
          .onConflictDoUpdate({
            target: users.emailNormalized,
            set: { passwordHash, displayName: requested.displayName, updatedAt: new Date() },
          })
          .returning({ id: users.id });
        if (!account) throw new Error(`Could not provision ${requested.login}`);
        for (const campaign of campaignRows) {
          await transaction
            .insert(campaignMembers)
            .values({
              campaignId: campaign.id,
              userId: account.id,
              role: requested.campaignRole,
            })
            .onConflictDoNothing();
          await transaction
            .update(campaignMembers)
            .set({ role: requested.campaignRole })
            .where(
              and(
                eq(campaignMembers.campaignId, campaign.id),
                eq(campaignMembers.userId, account.id),
                ne(campaignMembers.role, 'OWNER'),
              ),
            );
        }
      });
      process.stdout.write(`Provisioned ${requested.login} as ${requested.campaignRole}\n`);
    }
  } finally {
    await pool.end();
  }
}

void main();
