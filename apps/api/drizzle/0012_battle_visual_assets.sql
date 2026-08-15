ALTER TABLE "battle_tokens" ADD COLUMN "image_attachment_id" uuid;
--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD COLUMN "image_attachment_id" uuid;
--> statement-breakpoint
ALTER TABLE "battle_tokens" ADD CONSTRAINT "battle_tokens_image_attachment_id_lore_attachments_id_fk" FOREIGN KEY ("image_attachment_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "battle_scene_objects" ADD CONSTRAINT "battle_scene_objects_image_attachment_id_lore_attachments_id_fk" FOREIGN KEY ("image_attachment_id") REFERENCES "public"."lore_attachments"("id") ON DELETE set null ON UPDATE no action;
