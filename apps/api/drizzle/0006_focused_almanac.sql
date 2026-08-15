ALTER TYPE "public"."lore_category" ADD VALUE 'CLUE';--> statement-breakpoint
ALTER TYPE "public"."lore_category" ADD VALUE 'FACT';--> statement-breakpoint
ALTER TYPE "public"."lore_category" ADD VALUE 'MAP';--> statement-breakpoint
ALTER TABLE "lore_entries" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;
