CREATE TABLE "direct_conversation_reads" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_sequence" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_conversation_reads_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id"),
	CONSTRAINT "direct_conversation_reads_last_sequence_nonnegative" CHECK ("direct_conversation_reads"."last_read_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "direct_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"player_user_id" uuid NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_conversations_last_sequence_nonnegative" CHECK ("direct_conversations"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "direct_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"sender_role" "campaign_role" NOT NULL,
	"client_message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_messages_sequence_positive" CHECK ("direct_messages"."sequence" > 0),
	CONSTRAINT "direct_messages_body_length" CHECK (char_length(btrim("direct_messages"."body")) between 1 and 10000)
);
--> statement-breakpoint
ALTER TABLE "direct_conversation_reads" ADD CONSTRAINT "direct_conversation_reads_conversation_id_direct_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversation_reads" ADD CONSTRAINT "direct_conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_player_user_id_users_id_fk" FOREIGN KEY ("player_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_direct_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."direct_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direct_conversation_reads_user_id_index" ON "direct_conversation_reads" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_conversations_campaign_player_unique" ON "direct_conversations" USING btree ("campaign_id","player_user_id");--> statement-breakpoint
CREATE INDEX "direct_conversations_campaign_last_message_index" ON "direct_conversations" USING btree ("campaign_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_messages_conversation_sequence_unique" ON "direct_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "direct_messages_idempotency_unique" ON "direct_messages" USING btree ("conversation_id","sender_user_id","client_message_id");--> statement-breakpoint
CREATE INDEX "direct_messages_conversation_sequence_index" ON "direct_messages" USING btree ("conversation_id","sequence");