CREATE TYPE "public"."board_view_audience" AS ENUM('MASTER', 'PLAYERS');--> statement-breakpoint
CREATE TABLE "campaign_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"created_by_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"role" "campaign_role" DEFAULT 'PLAYER' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_invitations_player_role" CHECK ("campaign_invitations"."role" = 'PLAYER')
);
--> statement-breakpoint
ALTER TABLE "board_views" ADD COLUMN "audience" "board_view_audience" DEFAULT 'MASTER' NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invitations" ADD CONSTRAINT "campaign_invitations_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invitations_token_hash_unique" ON "campaign_invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "campaign_invitations_campaign_id_index" ON "campaign_invitations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_invitations_expires_at_index" ON "campaign_invitations" USING btree ("expires_at");