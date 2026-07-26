-- Stop treating the machine-translated side of a message as pending annotation.
--
-- The single-tenant bot no longer annotates translations (ANNOTATE_TRANSLATION_SIDE in
-- supabase/functions/telegram-bot/index.ts). Annotation was running twice per message --
-- once on what a human typed, once on what the bot translated it into -- and the second
-- pass was building flashcards out of the model's own output. Measured over 90 days on
-- the personal corpus, dropping it retains 53.4% of Ukrainian and 47.7% of English card
-- supply, all of it sourced from human-written text.
--
-- This function has to change with it. It returns a side as pending whenever that side
-- lacks a language-tagged annotation, and it offered BOTH sides. Left alone, /backfill
-- would keep offering every translation side forever and re-annotate exactly what the
-- app just stopped paying for -- the saving would silently evaporate on the next grind,
-- and the run would never reach "all done" because nothing would ever retire those rows.
--
-- Dropping the arm (rather than having the app write a fallback marker per skipped side)
-- keeps message_annotations free of one throwaway row per message forever, and makes the
-- decision reversible by reverting this file rather than by deleting data.
--
-- Signature is unchanged, so create-or-replace applies in place. The commercial project
-- is unaffected: migrations-saas/20260726000100 dropped this 1-argument version there and
-- created a tenant-scoped (uuid, integer) one, which keeps annotating both sides.

create or replace function public.backfill_pending_sides(
  p_batch_size integer default 16
)
returns table(message_id uuid, text text, language text)
language sql
stable
security invoker
as $$
  select m.id as message_id, m.original_text as text, m.original_language as language
  from public.messages m
  where m.original_text is not null
    and not exists (
      select 1 from public.message_annotations a
      where a.message_id = m.id and (a.details ->> 'language') = m.original_language)
  order by m.id
  limit p_batch_size;
$$;

-- CREATE OR REPLACE preserves an existing function's privileges, so on a project that
-- already has this function the line below changes nothing. It matters where the function
-- is created fresh -- a newly provisioned couple, or the commercial project, where
-- migrations-saas/20260726000100 dropped the 1-argument version. Postgres grants EXECUTE
-- to PUBLIC on every new function, and this one returns message TEXT: left at the default,
-- anyone holding the project's anon key could read the corpus straight out of it. The
-- service_role grant below is what the edge function actually connects as.
revoke execute on function public.backfill_pending_sides(integer) from public, anon, authenticated;
grant execute on function public.backfill_pending_sides(integer) to service_role;
