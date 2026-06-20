-- Migration: performance and security improvements

-- 1. backfill_pending_sides
-- Returns unannotated message sides via DB anti-join.
-- Replaces the in-memory approach in handleBackfill() that loaded all messages
-- and all annotations into RAM on every /backfill call.
create or replace function public.backfill_pending_sides(
  p_batch_size integer default 16
)
returns table(message_id uuid, text text, language text)
language sql
stable
security invoker
as $$
  select m.id             as message_id,
         m.original_text  as text,
         m.original_language as language
  from   public.messages m
  where  m.original_text is not null
    and  m.original_language in ('uk', 'en')
    and  not exists (
           select 1
           from   public.message_annotations a
           where  a.message_id = m.id
             and  (a.details ->> 'language') = m.original_language
         )
  union all
  select m.id              as message_id,
         m.translated_text as text,
         m.translated_language as language
  from   public.messages m
  where  m.translated_text is not null
    and  m.translated_language in ('uk', 'en')
    and  not exists (
           select 1
           from   public.message_annotations a
           where  a.message_id = m.id
             and  (a.details ->> 'language') = m.translated_language
         )
  order by message_id
  limit  p_batch_size;
$$;

grant execute on function public.backfill_pending_sides(integer) to service_role;

-- 2. Revoke anon/authenticated access to backfill functions
-- These were previously readable by anyone with the public anon key.
revoke execute on function public.recap_backfill_batch(integer)   from anon, authenticated;
revoke execute on function public.recap_backfill_remaining()      from anon, authenticated;
