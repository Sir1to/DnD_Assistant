import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const campaignRole = pgEnum('campaign_role', ['OWNER', 'GM', 'PLAYER']);
export const boardViewAudience = pgEnum('board_view_audience', ['MASTER', 'PLAYERS']);
export const loreCategory = pgEnum('lore_category', [
  'GENERAL',
  'CLUE',
  'FACT',
  'MAP',
  'PERSON',
  'PLACE',
  'EVENT',
  'ITEM',
  'HANDOUT',
]);
export const loreStatus = pgEnum('lore_status', ['DRAFT', 'PUBLISHED']);
export const loreAudience = pgEnum('lore_audience', ['MASTER', 'ALL_PLAYERS', 'SELECTED_PLAYERS']);
export const battleSceneStatus = pgEnum('battle_scene_status', [
  'DRAFT',
  'LIVE',
  'PAUSED',
  'ARCHIVED',
]);
export const battleSceneShape = pgEnum('battle_scene_shape', [
  'RECTANGLE',
  'CIRCLE',
  'HEXAGON',
  'OCTAGON',
]);
export const battleCombatantKind = pgEnum('battle_combatant_kind', [
  'PLAYER',
  'ALLY',
  'NPC',
  'MONSTER',
  'OBJECT',
]);
export const battleNameVisibility = pgEnum('battle_name_visibility', [
  'EXACT',
  'GENERIC',
  'HIDDEN',
]);
export const battleHpVisibility = pgEnum('battle_hp_visibility', [
  'EXACT',
  'BAR',
  'STATE',
  'HIDDEN',
]);
export const battleConditionsVisibility = pgEnum('battle_conditions_visibility', ['ALL', 'HIDDEN']);
export const battleObstacleKind = pgEnum('battle_obstacle_kind', [
  'WALL',
  'OBSTACLE',
  'DIFFICULT_TERRAIN',
]);
export const battleSceneObjectKind = pgEnum('battle_scene_object_kind', ['PROP', 'CLUE']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('users_email_normalized_unique').on(table.emailNormalized),
    check('users_email_length', sql`char_length(${table.email}) between 3 and 320`),
    check('users_display_name_length', sql`char_length(${table.displayName}) between 1 and 80`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_index').on(table.userId),
    index('sessions_expires_at_index').on(table.expiresAt),
  ],
);

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    index('campaigns_owner_id_index').on(table.ownerId),
    check('campaigns_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('campaigns_description_length', sql`char_length(${table.description}) <= 4000`),
  ],
);

export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: campaignRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.campaignId, table.userId] }),
    index('campaign_members_user_id_index').on(table.userId),
  ],
);

export const campaignInvitations = pgTable(
  'campaign_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    createdById: uuid('created_by_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    role: campaignRole('role').notNull().default('PLAYER'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedById: uuid('accepted_by_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('campaign_invitations_token_hash_unique').on(table.tokenHash),
    index('campaign_invitations_campaign_id_index').on(table.campaignId),
    index('campaign_invitations_expires_at_index').on(table.expiresAt),
    check('campaign_invitations_player_role', sql`${table.role} = 'PLAYER'`),
  ],
);

export const loreEntries = pgTable(
  'lore_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    category: loreCategory('category').notNull().default('GENERAL'),
    isPinned: boolean('is_pinned').notNull().default(false),
    status: loreStatus('status').notNull().default('DRAFT'),
    audience: loreAudience('audience').notNull().default('MASTER'),
    revision: integer('revision').notNull().default(0),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('lore_entries_campaign_id_index').on(table.campaignId),
    index('lore_entries_campaign_status_index').on(table.campaignId, table.status),
    check('lore_entries_title_length', sql`char_length(${table.title}) between 1 and 160`),
    check('lore_entries_content_length', sql`char_length(${table.content}) <= 100000`),
    check('lore_entries_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const loreEntryRecipients = pgTable(
  'lore_entry_recipients',
  {
    loreEntryId: uuid('lore_entry_id')
      .notNull()
      .references(() => loreEntries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.loreEntryId, table.userId] }),
    index('lore_entry_recipients_user_id_index').on(table.userId),
  ],
);

export const loreAttachments = pgTable(
  'lore_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loreEntryId: uuid('lore_entry_id')
      .notNull()
      .references(() => loreEntries.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lore_attachments_entry_id_index').on(table.loreEntryId),
    uniqueIndex('lore_attachments_storage_key_unique').on(table.storageKey),
    check(
      'lore_attachments_name_length',
      sql`char_length(${table.originalName}) between 1 and 255`,
    ),
    check('lore_attachments_mime_length', sql`char_length(${table.mimeType}) between 1 and 120`),
    check('lore_attachments_size_range', sql`${table.size} between 1 and 10485760`),
    check('lore_attachments_storage_key_format', sql`${table.storageKey} ~ '^[0-9a-f-]{36}$'`),
  ],
);

export const directConversations = pgTable(
  'direct_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    playerUserId: uuid('player_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    lastSequence: integer('last_sequence').notNull().default(0),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('direct_conversations_campaign_player_unique').on(
      table.campaignId,
      table.playerUserId,
    ),
    index('direct_conversations_campaign_last_message_index').on(
      table.campaignId,
      table.lastMessageAt,
    ),
    check('direct_conversations_last_sequence_nonnegative', sql`${table.lastSequence} >= 0`),
  ],
);

export const directMessages = pgTable(
  'direct_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => directConversations.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    senderUserId: uuid('sender_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    senderRole: campaignRole('sender_role').notNull(),
    clientMessageId: uuid('client_message_id').notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('direct_messages_conversation_sequence_unique').on(
      table.conversationId,
      table.sequence,
    ),
    uniqueIndex('direct_messages_idempotency_unique').on(
      table.conversationId,
      table.senderUserId,
      table.clientMessageId,
    ),
    index('direct_messages_conversation_sequence_index').on(table.conversationId, table.sequence),
    check('direct_messages_sequence_positive', sql`${table.sequence} > 0`),
    check(
      'direct_messages_body_length',
      sql`char_length(btrim(${table.body})) between 1 and 10000`,
    ),
  ],
);

export const directConversationReads = pgTable(
  'direct_conversation_reads',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => directConversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadSequence: integer('last_read_sequence').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    index('direct_conversation_reads_user_id_index').on(table.userId),
    check(
      'direct_conversation_reads_last_sequence_nonnegative',
      sql`${table.lastReadSequence} >= 0`,
    ),
  ],
);

export const characterSheets = pgTable(
  'character_sheets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    ruleset: text('ruleset').notNull().default('dnd5e-srd-5.2.1'),
    data: jsonb('data').notNull(),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('character_sheets_campaign_id_index').on(table.campaignId),
    index('character_sheets_owner_user_id_index').on(table.ownerUserId),
    index('character_sheets_campaign_owner_index').on(table.campaignId, table.ownerUserId),
    check('character_sheets_name_length', sql`char_length(${table.name}) between 1 and 160`),
    check('character_sheets_ruleset_supported', sql`${table.ruleset} = 'dnd5e-srd-5.2.1'`),
    check('character_sheets_revision_nonnegative', sql`${table.revision} >= 0`),
    check('character_sheets_data_size', sql`pg_column_size(${table.data}) <= 262144`),
  ],
);

export const battleScenes = pgTable(
  'battle_scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: battleSceneStatus('status').notNull().default('DRAFT'),
    shape: battleSceneShape('shape').notNull().default('RECTANGLE'),
    gridColumns: integer('grid_columns').notNull().default(16),
    gridRows: integer('grid_rows').notNull().default(10),
    backgroundAttachmentId: uuid('background_attachment_id').references(() => loreAttachments.id, {
      onDelete: 'set null',
    }),
    activeCombatantId: uuid('active_combatant_id'),
    round: integer('round').notNull().default(1),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('battle_scenes_campaign_id_index').on(table.campaignId),
    index('battle_scenes_campaign_status_index').on(table.campaignId, table.status),
    uniqueIndex('battle_scenes_campaign_active_unique')
      .on(table.campaignId)
      .where(sql`${table.status} <> 'ARCHIVED'`),
    check('battle_scenes_name_length', sql`char_length(${table.name}) between 1 and 160`),
    check('battle_scenes_grid_columns_range', sql`${table.gridColumns} between 4 and 60`),
    check('battle_scenes_grid_rows_range', sql`${table.gridRows} between 4 and 60`),
    check('battle_scenes_round_positive', sql`${table.round} > 0`),
    check('battle_scenes_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const battleCombatants = pgTable(
  'battle_combatants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => battleScenes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: battleCombatantKind('kind').notNull(),
    initiative: integer('initiative').notNull().default(10),
    currentHp: integer('current_hp').notNull().default(10),
    maxHp: integer('max_hp').notNull().default(10),
    temporaryHp: integer('temporary_hp').notNull().default(0),
    armorClass: integer('armor_class'),
    speed: integer('speed').notNull().default(6),
    movementSpent: integer('movement_spent').notNull().default(0),
    className: text('class_name').notNull().default(''),
    species: text('species').notNull().default(''),
    conditions: jsonb('conditions').notNull().default([]),
    note: text('note').notNull().default(''),
    hidden: boolean('hidden').notNull().default(false),
    nameVisibility: battleNameVisibility('name_visibility').notNull().default('EXACT'),
    hpVisibility: battleHpVisibility('hp_visibility').notNull().default('STATE'),
    showArmorClass: boolean('show_armor_class').notNull().default(false),
    showClassName: boolean('show_class_name').notNull().default(false),
    showSpecies: boolean('show_species').notNull().default(false),
    conditionsVisibility: battleConditionsVisibility('conditions_visibility')
      .notNull()
      .default('ALL'),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('battle_combatants_scene_id_index').on(table.sceneId),
    index('battle_combatants_scene_initiative_index').on(table.sceneId, table.initiative),
    check('battle_combatants_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('battle_combatants_current_hp_range', sql`${table.currentHp} between 0 and 999999`),
    check('battle_combatants_max_hp_range', sql`${table.maxHp} between 1 and 999999`),
    check('battle_combatants_temporary_hp_range', sql`${table.temporaryHp} between 0 and 999999`),
    check('battle_combatants_speed_range', sql`${table.speed} between 0 and 100`),
    check('battle_combatants_movement_spent_range', sql`${table.movementSpent} between 0 and 100`),
    check('battle_combatants_class_length', sql`char_length(${table.className}) <= 120`),
    check('battle_combatants_species_length', sql`char_length(${table.species}) <= 120`),
    check('battle_combatants_note_length', sql`char_length(${table.note}) <= 2000`),
    check('battle_combatants_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const battleTokens = pgTable(
  'battle_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => battleScenes.id, { onDelete: 'cascade' }),
    combatantId: uuid('combatant_id')
      .notNull()
      .references(() => battleCombatants.id, { onDelete: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    imageAttachmentId: uuid('image_attachment_id').references(() => loreAttachments.id, {
      onDelete: 'set null',
    }),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    size: integer('size').notNull().default(1),
    color: text('color').notNull().default('#7c5cff'),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('battle_tokens_combatant_unique').on(table.combatantId),
    index('battle_tokens_scene_id_index').on(table.sceneId),
    index('battle_tokens_owner_user_id_index').on(table.ownerUserId),
    check('battle_tokens_x_nonnegative', sql`${table.x} >= 0`),
    check('battle_tokens_y_nonnegative', sql`${table.y} >= 0`),
    check('battle_tokens_size_range', sql`${table.size} between 1 and 6`),
    check('battle_tokens_color_format', sql`${table.color} ~ '^#[0-9A-Fa-f]{6}$'`),
    check('battle_tokens_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const battleSceneObstacles = pgTable(
  'battle_scene_obstacles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => battleScenes.id, { onDelete: 'cascade' }),
    kind: battleObstacleKind('kind').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    width: integer('width').notNull().default(1),
    height: integer('height').notNull().default(1),
    movementCost: integer('movement_cost').notNull().default(2),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('battle_scene_obstacles_scene_id_index').on(table.sceneId),
    check('battle_scene_obstacles_x_nonnegative', sql`${table.x} >= 0`),
    check('battle_scene_obstacles_y_nonnegative', sql`${table.y} >= 0`),
    check('battle_scene_obstacles_width_range', sql`${table.width} between 1 and 60`),
    check('battle_scene_obstacles_height_range', sql`${table.height} between 1 and 60`),
    check('battle_scene_obstacles_cost_range', sql`${table.movementCost} between 1 and 5`),
    check('battle_scene_obstacles_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const battleSceneObjects = pgTable(
  'battle_scene_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => battleScenes.id, { onDelete: 'cascade' }),
    kind: battleSceneObjectKind('kind').notNull(),
    name: text('name').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    width: integer('width').notNull().default(1),
    height: integer('height').notNull().default(1),
    blocksMovement: boolean('blocks_movement').notNull().default(true),
    visibleToPlayers: boolean('visible_to_players').notNull().default(true),
    showLabel: boolean('show_label').notNull().default(false),
    imageAttachmentId: uuid('image_attachment_id').references(() => loreAttachments.id, {
      onDelete: 'set null',
    }),
    currentHp: integer('current_hp'),
    maxHp: integer('max_hp'),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('battle_scene_objects_scene_id_index').on(table.sceneId),
    check('battle_scene_objects_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('battle_scene_objects_x_nonnegative', sql`${table.x} >= 0`),
    check('battle_scene_objects_y_nonnegative', sql`${table.y} >= 0`),
    check('battle_scene_objects_width_range', sql`${table.width} between 1 and 60`),
    check('battle_scene_objects_height_range', sql`${table.height} between 1 and 60`),
    check(
      'battle_scene_objects_hp_pair',
      sql`(${table.currentHp} is null and ${table.maxHp} is null) or (${table.currentHp} between 0 and 999999 and ${table.maxHp} between 1 and 999999 and ${table.currentHp} <= ${table.maxHp})`,
    ),
    check('battle_scene_objects_revision_nonnegative', sql`${table.revision} >= 0`),
  ],
);

export const battleSceneSaves = pgTable(
  'battle_scene_saves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    sourceSceneName: text('source_scene_name').notNull(),
    sceneStatus: battleSceneStatus('scene_status').notNull(),
    gridColumns: integer('grid_columns').notNull(),
    gridRows: integer('grid_rows').notNull(),
    combatantCount: integer('combatant_count').notNull(),
    backgroundAttachmentId: uuid('background_attachment_id').references(() => loreAttachments.id, {
      onDelete: 'set null',
    }),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('battle_scene_saves_campaign_created_index').on(table.campaignId, table.createdAt),
    check('battle_scene_saves_name_length', sql`char_length(${table.name}) between 1 and 160`),
    check(
      'battle_scene_saves_source_scene_name_length',
      sql`char_length(${table.sourceSceneName}) between 1 and 160`,
    ),
    check(
      'battle_scene_saves_scene_status_restorable',
      sql`${table.sceneStatus} in ('DRAFT', 'LIVE', 'PAUSED')`,
    ),
    check('battle_scene_saves_grid_columns_range', sql`${table.gridColumns} between 4 and 60`),
    check('battle_scene_saves_grid_rows_range', sql`${table.gridRows} between 4 and 60`),
    check(
      'battle_scene_saves_combatant_count_range',
      sql`${table.combatantCount} between 0 and 500`,
    ),
    check('battle_scene_saves_payload_size', sql`pg_column_size(${table.payload}) <= 524288`),
  ],
);

export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ...timestamps,
  },
  (table) => [
    index('boards_campaign_id_index').on(table.campaignId),
    check('boards_name_length', sql`char_length(${table.name}) between 1 and 120`),
  ],
);

export const boardViews = pgTable(
  'board_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    audience: boardViewAudience('audience').notNull().default('MASTER'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('board_views_board_slug_unique').on(table.boardId, table.slug),
    index('board_views_board_id_index').on(table.boardId),
    check('board_views_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('board_views_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('board_views_description_length', sql`char_length(${table.description}) <= 1000`),
  ],
);

export const widgetInstances = pgTable(
  'widget_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    title: text('title').notNull(),
    config: jsonb('config').notNull().default({}),
    state: jsonb('state').notNull().default({}),
    revision: integer('revision').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('widget_instances_board_id_index').on(table.boardId),
    index('widget_instances_board_type_index').on(table.boardId, table.type),
    check('widget_instances_type_length', sql`char_length(${table.type}) between 1 and 80`),
    check('widget_instances_title_length', sql`char_length(${table.title}) between 1 and 160`),
    check('widget_instances_schema_version_positive', sql`${table.schemaVersion} > 0`),
    check('widget_instances_revision_nonnegative', sql`${table.revision} >= 0`),
    check('widget_instances_config_size', sql`pg_column_size(${table.config}) <= 65536`),
    check('widget_instances_state_size', sql`pg_column_size(${table.state}) <= 262144`),
  ],
);

export const widgetPlacements = pgTable(
  'widget_placements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardViewId: uuid('board_view_id')
      .notNull()
      .references(() => boardViews.id, { onDelete: 'cascade' }),
    widgetInstanceId: uuid('widget_instance_id')
      .notNull()
      .references(() => widgetInstances.id, { onDelete: 'cascade' }),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    minimumWidth: integer('minimum_width').notNull().default(1),
    minimumHeight: integer('minimum_height').notNull().default(1),
    visible: boolean('visible').notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('widget_placements_view_widget_unique').on(
      table.boardViewId,
      table.widgetInstanceId,
    ),
    index('widget_placements_view_id_index').on(table.boardViewId),
    index('widget_placements_widget_id_index').on(table.widgetInstanceId),
    check('widget_placements_x_nonnegative', sql`${table.x} >= 0`),
    check('widget_placements_y_nonnegative', sql`${table.y} >= 0`),
    check('widget_placements_width_positive', sql`${table.width} > 0`),
    check('widget_placements_height_positive', sql`${table.height} > 0`),
    check('widget_placements_minimum_width_positive', sql`${table.minimumWidth} > 0`),
    check('widget_placements_minimum_height_positive', sql`${table.minimumHeight} > 0`),
  ],
);
