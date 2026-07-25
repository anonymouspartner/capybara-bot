-- upsert_recap_embedding, tenant-scoped. Commercial project ONLY.
--
-- Missed in 20260726000100 because it is the only one of these functions that WRITES
-- rather than reads, so it does not leak on its own. It breaks instead: it inserts into
-- recap_embeddings without a tenant_id, and that column is now NOT NULL, so every
-- /recap embedding write would fail with a constraint violation.
--
-- The conflict key stays (source_type, source_id). source_id is a message or note id --
-- already tenant-owned and globally unique -- so it cannot collide across tenants. The
-- added tenant_id predicate on the UPDATE branch is belt-and-braces: it means a row
-- whose tenant somehow disagrees with the caller is left alone rather than silently
-- rewritten.

DROP FUNCTION IF EXISTS "public"."upsert_recap_embedding"("text", "uuid", "text", "text", "public"."vector");

CREATE OR REPLACE FUNCTION "public"."upsert_recap_embedding"("p_tenant_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
begin
  insert into public.recap_embeddings (tenant_id, source_type, source_id, content, language, embedding)
  values (p_tenant_id, p_source_type, p_source_id, p_content, p_language, p_embedding)
  on conflict (source_type, source_id) do update
    set content   = excluded.content,
        language  = excluded.language,
        embedding = excluded.embedding
    where public.recap_embeddings.tenant_id = p_tenant_id;
end;
$$;

ALTER FUNCTION "public"."upsert_recap_embedding"("p_tenant_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."upsert_recap_embedding"("p_tenant_id" "uuid", "p_source_type" "text", "p_source_id" "uuid", "p_content" "text", "p_language" "text", "p_embedding" "public"."vector") TO "service_role";
