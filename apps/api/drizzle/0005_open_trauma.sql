CREATE TABLE "lore_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lore_entry_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lore_attachments_name_length" CHECK (char_length("lore_attachments"."original_name") between 1 and 255),
	CONSTRAINT "lore_attachments_mime_length" CHECK (char_length("lore_attachments"."mime_type") between 1 and 120),
	CONSTRAINT "lore_attachments_size_range" CHECK ("lore_attachments"."size" between 1 and 10485760),
	CONSTRAINT "lore_attachments_storage_key_format" CHECK ("lore_attachments"."storage_key" ~ '^[0-9a-f-]{36}$')
);
--> statement-breakpoint
ALTER TABLE "lore_attachments" ADD CONSTRAINT "lore_attachments_lore_entry_id_lore_entries_id_fk" FOREIGN KEY ("lore_entry_id") REFERENCES "public"."lore_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_attachments" ADD CONSTRAINT "lore_attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_attachments_entry_id_index" ON "lore_attachments" USING btree ("lore_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lore_attachments_storage_key_unique" ON "lore_attachments" USING btree ("storage_key");