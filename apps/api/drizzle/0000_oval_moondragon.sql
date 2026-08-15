CREATE TYPE "public"."campaign_role" AS ENUM('OWNER', 'GM', 'PLAYER');--> statement-breakpoint
CREATE TABLE "board_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_views_name_length" CHECK (char_length("board_views"."name") between 1 and 120),
	CONSTRAINT "board_views_slug_format" CHECK ("board_views"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "board_views_description_length" CHECK (char_length("board_views"."description") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_name_length" CHECK (char_length("boards"."name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "campaign_members" (
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "campaign_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_members_campaign_id_user_id_pk" PRIMARY KEY("campaign_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_name_length" CHECK (char_length("campaigns"."name") between 1 and 120),
	CONSTRAINT "campaigns_description_length" CHECK (char_length("campaigns"."description") <= 4000)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_length" CHECK (char_length("users"."email") between 3 and 320),
	CONSTRAINT "users_display_name_length" CHECK (char_length("users"."display_name") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "widget_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"type" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"title" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_instances_type_length" CHECK (char_length("widget_instances"."type") between 1 and 80),
	CONSTRAINT "widget_instances_title_length" CHECK (char_length("widget_instances"."title") between 1 and 160),
	CONSTRAINT "widget_instances_schema_version_positive" CHECK ("widget_instances"."schema_version" > 0),
	CONSTRAINT "widget_instances_revision_nonnegative" CHECK ("widget_instances"."revision" >= 0),
	CONSTRAINT "widget_instances_config_size" CHECK (pg_column_size("widget_instances"."config") <= 65536),
	CONSTRAINT "widget_instances_state_size" CHECK (pg_column_size("widget_instances"."state") <= 262144)
);
--> statement-breakpoint
CREATE TABLE "widget_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_view_id" uuid NOT NULL,
	"widget_instance_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"minimum_width" integer DEFAULT 1 NOT NULL,
	"minimum_height" integer DEFAULT 1 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_placements_x_nonnegative" CHECK ("widget_placements"."x" >= 0),
	CONSTRAINT "widget_placements_y_nonnegative" CHECK ("widget_placements"."y" >= 0),
	CONSTRAINT "widget_placements_width_positive" CHECK ("widget_placements"."width" > 0),
	CONSTRAINT "widget_placements_height_positive" CHECK ("widget_placements"."height" > 0),
	CONSTRAINT "widget_placements_minimum_width_positive" CHECK ("widget_placements"."minimum_width" > 0),
	CONSTRAINT "widget_placements_minimum_height_positive" CHECK ("widget_placements"."minimum_height" > 0)
);
--> statement-breakpoint
ALTER TABLE "board_views" ADD CONSTRAINT "board_views_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_members" ADD CONSTRAINT "campaign_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_instances" ADD CONSTRAINT "widget_instances_board_id_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_placements" ADD CONSTRAINT "widget_placements_board_view_id_board_views_id_fk" FOREIGN KEY ("board_view_id") REFERENCES "public"."board_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_placements" ADD CONSTRAINT "widget_placements_widget_instance_id_widget_instances_id_fk" FOREIGN KEY ("widget_instance_id") REFERENCES "public"."widget_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_views_board_slug_unique" ON "board_views" USING btree ("board_id","slug");--> statement-breakpoint
CREATE INDEX "board_views_board_id_index" ON "board_views" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "boards_campaign_id_index" ON "boards" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_members_user_id_index" ON "campaign_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campaigns_owner_id_index" ON "campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_index" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_unique" ON "users" USING btree ("email_normalized");--> statement-breakpoint
CREATE INDEX "widget_instances_board_id_index" ON "widget_instances" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "widget_instances_board_type_index" ON "widget_instances" USING btree ("board_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "widget_placements_view_widget_unique" ON "widget_placements" USING btree ("board_view_id","widget_instance_id");--> statement-breakpoint
CREATE INDEX "widget_placements_view_id_index" ON "widget_placements" USING btree ("board_view_id");--> statement-breakpoint
CREATE INDEX "widget_placements_widget_id_index" ON "widget_placements" USING btree ("widget_instance_id");