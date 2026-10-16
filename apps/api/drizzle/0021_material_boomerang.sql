CREATE TYPE "public"."character_document_revision_kind" AS ENUM('CREATED', 'UPDATED', 'RESTORED', 'MIGRATED');--> statement-breakpoint
CREATE TYPE "public"."character_revision_actor_kind" AS ENUM('PLAYER', 'GAME_MASTER', 'SYSTEM');--> statement-breakpoint
CREATE TABLE "character_document_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sheet_id" uuid NOT NULL,
	"document_revision" integer NOT NULL,
	"name" text NOT NULL,
	"status" character_sheet_status NOT NULL,
	"document" jsonb NOT NULL,
	"master_corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"changed_by_user_id" uuid NOT NULL,
	"actor_kind" character_revision_actor_kind NOT NULL,
	"kind" character_document_revision_kind NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_document_revisions_revision_nonnegative" CHECK ("character_document_revisions"."document_revision" >= 0),
	CONSTRAINT "character_document_revisions_name_length" CHECK (char_length("character_document_revisions"."name") between 1 and 160),
	CONSTRAINT "character_document_revisions_document_object" CHECK (jsonb_typeof("character_document_revisions"."document") = 'object'),
	CONSTRAINT "character_document_revisions_document_size" CHECK (pg_column_size("character_document_revisions"."document") <= 262144),
	CONSTRAINT "character_document_revisions_master_corrections_array" CHECK (jsonb_typeof("character_document_revisions"."master_corrections") = 'array'),
	CONSTRAINT "character_document_revisions_summary_length" CHECK ("character_document_revisions"."summary" is null or char_length("character_document_revisions"."summary") between 1 and 500)
);
--> statement-breakpoint
ALTER TABLE "character_sheets" ADD COLUMN "master_corrections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "character_document_revisions" ADD CONSTRAINT "character_document_revisions_sheet_id_character_sheets_id_fk" FOREIGN KEY ("sheet_id") REFERENCES "public"."character_sheets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_document_revisions" ADD CONSTRAINT "character_document_revisions_changed_by_user_id_users_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_document_revisions_sheet_revision_unique" ON "character_document_revisions" USING btree ("sheet_id","document_revision");--> statement-breakpoint
CREATE INDEX "character_document_revisions_sheet_created_index" ON "character_document_revisions" USING btree ("sheet_id","created_at");--> statement-breakpoint
ALTER TABLE "character_sheets" ADD CONSTRAINT "character_sheets_master_corrections_array" CHECK (jsonb_typeof("character_sheets"."master_corrections") = 'array');--> statement-breakpoint
INSERT INTO "character_document_revisions" (
	"sheet_id",
	"document_revision",
	"name",
	"status",
	"document",
	"master_corrections",
	"changed_by_user_id",
	"actor_kind",
	"kind",
	"summary",
	"created_at"
)
SELECT
	"id",
	"revision",
	"name",
	"status",
	"data",
	'[]'::jsonb,
	"created_by_user_id",
	'SYSTEM'::character_revision_actor_kind,
	'MIGRATED'::character_document_revision_kind,
	'Исходный снимок при включении истории',
	"updated_at"
FROM "character_sheets"
WHERE "document_version" = 2
ON CONFLICT ("sheet_id", "document_revision") DO NOTHING;
