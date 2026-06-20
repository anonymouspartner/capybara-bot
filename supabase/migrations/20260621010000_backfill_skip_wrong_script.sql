-- Make backfill_pending_sides return ONLY annotatable sides.
--
-- The prior version (20260621000000) returned wrong-script/letterless sides too and relied
-- on the app writing a fallback annotation to retire them. But those fallbacks carry no
-- language, so the language-keyed anti-join never recognized them -> /backfill looped on
-- them forever and never reached "all done". These sides can never be meaningfully
-- annotated, so they must simply not count as pending.
--
-- This filter mirrors the app's detectScriptRatios + CYRILLIC_SKIP_THRESHOLD (0.5):
--   wrong-script := no letters, OR (en side that is majority Cyrillic), OR (uk side that is
--   majority Latin). Cyrillic range U+0400–U+052F; Latin A–Z/a–z + Latin-1/Extended-A.
create or replace function public.backfill_pending_sides(
  p_batch_size integer default 16
)
returns table(message_id uuid, text text, language text)
language sql
stable
security invoker
as $$
  with sides as (
    select m.id as message_id, m.original_text as text, m.original_language as language
    from public.messages m
    where m.original_text is not null
      and m.original_language in ('uk','en')
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.original_language)
    union all
    select m.id as message_id, m.translated_text as text, m.translated_language as language
    from public.messages m
    where m.translated_text is not null
      and m.translated_language in ('uk','en')
      and not exists (
        select 1 from public.message_annotations a
        where a.message_id = m.id and (a.details ->> 'language') = m.translated_language)
  ),
  scored as (
    select s.message_id, s.text, s.language,
      char_length(regexp_replace(s.text, '[^Ѐ-ԯ]', '', 'g'))      as cyr,
      char_length(regexp_replace(s.text, '[^A-Za-zÀ-ſ]', '', 'g')) as lat
    from sides s
  )
  select message_id, text, language
  from scored
  where (cyr + lat) > 0
    and (
         (language = 'uk' and cyr::numeric / (cyr + lat) >= 0.5)
      or (language = 'en' and cyr::numeric / (cyr + lat) <= 0.5)
    )
  order by message_id
  limit p_batch_size;
$$;

grant execute on function public.backfill_pending_sides(integer) to service_role;
