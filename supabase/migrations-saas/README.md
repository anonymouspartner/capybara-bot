# SaaS-only migrations

Two products share one repo, so they share one base schema and diverge after it.

| Directory | Applied to | Contents |
|---|---|---|
| `supabase/migrations/` | **both** projects | The base Capybara schema: messages, vocabulary, flashcards, recap, grammar corrections. |
| `supabase/migrations-saas/` | **commercial project only** | Everything that makes the schema multi-tenant: the `tenants` table, `tenant_id` on every owned table, and tenant-scoped rewrites of the `SECURITY DEFINER` functions. |

Nothing in this directory may ever be applied to the personal project. It would add a
`tenant_id NOT NULL` column to tables that have live rows and change function signatures the
deployed single-tenant build calls.

## Apply order (commercial project only)

Migrations are applied by hand — no workflow applies them. Run **all** of
`supabase/migrations/` first, oldest to newest, then this directory in filename order.

`20260726000000_tenants.sql` refuses to run unless the base schema is complete **and every
tenant-owned table is empty**. Both are checked before any DDL runs, so a partially migrated
or already-populated project is rejected with a message naming the actual problem rather than
leaving some tables scoped and others not.

An empty `tenants` table does not imply an empty database — a project can carry a whole
single-tenant corpus and still have no tenants row. If the target project has data, either
clear the twelve tenant-owned tables first or write a backfill migration that assigns the
existing rows to a tenant before `SET NOT NULL`.

## Why `tenant_id` is denormalized onto every table

It costs a column per table and buys a single-predicate filter (`.eq("tenant_id", …)`) at every
read site, instead of a join through `conversations`. Closing cross-tenant leaks mechanically is
worth more than schema purity: a missed join here shows one couple's private messages to another.
