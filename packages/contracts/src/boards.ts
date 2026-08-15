import { z } from 'zod';

export const widgetTypeSchema = z.enum(['NOTES', 'TIMER', 'DICE', 'COMBAT']);
export const boardViewAudienceSchema = z.enum(['MASTER', 'PLAYERS']);

export const notesConfigSchema = z.object({
  markdown: z.boolean().default(true),
});

export const notesStateSchema = z.object({
  content: z.string().max(100_000).default(''),
});

export const widgetCatalogItemSchema = z.object({
  type: widgetTypeSchema,
  displayName: z.string(),
  defaultTitle: z.string(),
  description: z.string(),
  schemaVersion: z.int().positive(),
  defaultWidth: z.int().positive(),
  defaultHeight: z.int().positive(),
  minimumWidth: z.int().positive(),
  minimumHeight: z.int().positive(),
});

export const boardViewDetailSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  audience: boardViewAudienceSchema,
});

export const widgetInstanceSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  type: widgetTypeSchema,
  schemaVersion: z.int().positive(),
  title: z.string(),
  config: z.record(z.string(), z.unknown()),
  state: z.record(z.string(), z.unknown()),
  revision: z.int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const widgetPlacementSchema = z.object({
  id: z.string().uuid(),
  boardViewId: z.string().uuid(),
  widgetInstanceId: z.string().uuid(),
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().positive().max(12),
  height: z.int().positive().max(50),
  minimumWidth: z.int().positive().max(12),
  minimumHeight: z.int().positive().max(50),
  visible: z.boolean(),
});

export const boardSnapshotSchema = z.object({
  board: z.object({
    id: z.string().uuid(),
    campaignId: z.string().uuid(),
    name: z.string(),
  }),
  role: z.enum(['OWNER', 'GM', 'PLAYER']),
  views: z.array(boardViewDetailSchema),
  widgets: z.array(widgetInstanceSchema),
  placements: z.array(widgetPlacementSchema),
});

export const createBoardViewRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).default(''),
  audience: boardViewAudienceSchema.default('MASTER'),
});

export const updateBoardViewRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    audience: boardViewAudienceSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined || value.description !== undefined || value.audience !== undefined,
    { message: 'At least one board view field must be provided' },
  );

export const createWidgetRequestSchema = z.object({
  type: widgetTypeSchema,
  title: z.string().trim().min(1).max(160).optional(),
  boardViewId: z.string().uuid(),
  initialState: z.record(z.string(), z.unknown()).optional(),
});

export const addWidgetPlacementRequestSchema = z.object({
  widgetInstanceId: z.string().uuid(),
  x: z.int().nonnegative().max(11).default(0),
  y: z.int().nonnegative().max(10_000).default(0),
});

export const layoutPlacementUpdateSchema = z.object({
  id: z.string().uuid(),
  x: z.int().nonnegative().max(11),
  y: z.int().nonnegative().max(10_000),
  width: z.int().positive().max(12),
  height: z.int().positive().max(50),
});

export const updateBoardLayoutRequestSchema = z.object({
  placements: z.array(layoutPlacementUpdateSchema).min(1).max(100),
});

export const updateWidgetRequestSchema = z
  .object({
    expectedRevision: z.int().nonnegative(),
    title: z.string().trim().min(1).max(160).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
    state: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.config !== undefined || value.state !== undefined,
    {
      message: 'At least one widget field must be provided',
    },
  );

export const createWidgetResultSchema = z.object({
  widget: widgetInstanceSchema,
  placement: widgetPlacementSchema,
});

export type WidgetType = z.infer<typeof widgetTypeSchema>;
export type BoardViewAudience = z.infer<typeof boardViewAudienceSchema>;
export type NotesConfig = z.infer<typeof notesConfigSchema>;
export type NotesState = z.infer<typeof notesStateSchema>;
export type WidgetCatalogItem = z.infer<typeof widgetCatalogItemSchema>;
export type BoardViewDetail = z.infer<typeof boardViewDetailSchema>;
export type WidgetInstance = z.infer<typeof widgetInstanceSchema>;
export type WidgetPlacement = z.infer<typeof widgetPlacementSchema>;
export type BoardSnapshot = z.infer<typeof boardSnapshotSchema>;
export type CreateBoardViewRequest = z.infer<typeof createBoardViewRequestSchema>;
export type UpdateBoardViewRequest = z.infer<typeof updateBoardViewRequestSchema>;
export type CreateWidgetRequest = z.infer<typeof createWidgetRequestSchema>;
export type AddWidgetPlacementRequest = z.infer<typeof addWidgetPlacementRequestSchema>;
export type UpdateBoardLayoutRequest = z.infer<typeof updateBoardLayoutRequestSchema>;
export type UpdateWidgetRequest = z.infer<typeof updateWidgetRequestSchema>;
export type CreateWidgetResult = z.infer<typeof createWidgetResultSchema>;
