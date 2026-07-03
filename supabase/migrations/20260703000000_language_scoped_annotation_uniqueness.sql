-- Language-scoped annotation uniqueness.
--
-- backfill_pending_sides retires a side only when an annotation row exists with
-- details->>'language' = that side's language. But the unique constraint on
-- (message_id, annotation_type, annotation_value) was language-blind, so whenever a
-- message's second side produced the same finding as the first (register:neutral is
-- on nearly every message, both sides), the upsert was conflict-dropped by
-- ignoreDuplicates and the side could never retire. /backfill re-ground the same
-- sides forever, reporting phantom progress ("Annotated 280 sides") while writing
-- nothing.
--
-- Fix: scope uniqueness by language via a stored generated column, so the same
-- finding may exist once per language side. Rows with no details.language (fallback
-- rows) get 'none'. Existing rows trivially satisfy the wider constraint (the old
-- 3-column uniqueness implies 4-column uniqueness). The app's upserts must name the
-- new column set: onConflict "message_id,annotation_type,annotation_value,language"
-- (index.ts v56).

alter table public.message_annotations
  add column if not exists language text
  generated always as (coalesce(details->>'language', 'none')) stored;

alter table public.message_annotations
  drop constraint if exists message_annotations_unique_finding;

alter table public.message_annotations
  add constraint message_annotations_unique_finding_lang
  unique (message_id, annotation_type, annotation_value, language);
