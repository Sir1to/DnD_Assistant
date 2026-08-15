CREATE TYPE "public"."lore_audience" AS ENUM('MASTER', 'ALL_PLAYERS', 'SELECTED_PLAYERS');--> statement-breakpoint
CREATE TYPE "public"."lore_category" AS ENUM('GENERAL', 'PERSON', 'PLACE', 'EVENT', 'ITEM', 'HANDOUT');--> statement-breakpoint
CREATE TYPE "public"."lore_status" AS ENUM('DRAFT', 'PUBLISHED');--> statement-breakpoint
CREATE TABLE "lore_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"author_id" uuid,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"category" "lore_category" DEFAULT 'GENERAL' NOT NULL,
	"status" "lore_status" DEFAULT 'DRAFT' NOT NULL,
	"audience" "lore_audience" DEFAULT 'MASTER' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lore_entries_title_length" CHECK (char_length("lore_entries"."title") between 1 and 160),
	CONSTRAINT "lore_entries_content_length" CHECK (char_length("lore_entries"."content") <= 100000),
	CONSTRAINT "lore_entries_revision_nonnegative" CHECK ("lore_entries"."revision" >= 0)
);
--> statement-breakpoint
CREATE TABLE "lore_entry_recipients" (
	"lore_entry_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lore_entry_recipients_lore_entry_id_user_id_pk" PRIMARY KEY("lore_entry_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "lore_entries" ADD CONSTRAINT "lore_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_entries" ADD CONSTRAINT "lore_entries_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_entry_recipients" ADD CONSTRAINT "lore_entry_recipients_lore_entry_id_lore_entries_id_fk" FOREIGN KEY ("lore_entry_id") REFERENCES "public"."lore_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_entry_recipients" ADD CONSTRAINT "lore_entry_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_entries_campaign_id_index" ON "lore_entries" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "lore_entries_campaign_status_index" ON "lore_entries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "lore_entry_recipients_user_id_index" ON "lore_entry_recipients" USING btree ("user_id");