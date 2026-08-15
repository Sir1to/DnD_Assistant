ALTER TABLE "battle_scene_objects"
  ADD COLUMN IF NOT EXISTS "show_label" boolean NOT NULL DEFAULT false;
