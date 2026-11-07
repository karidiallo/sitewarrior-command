-- SiteWarrior v7 OPTIONAL enhancement; safe for an existing v6 database.
-- Enables PostgreSQL changes for the already existing sw_records table.
-- Must be run once from Supabase SQL Editor by an authorized project admin.
-- This does NOT delete or rewrite rows, users, policies, or existing functions.
do $$ begin
 if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
   raise notice 'supabase_realtime publication not available; 12-second polling remains active';
 elsif not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sw_records') then
   alter publication supabase_realtime add table public.sw_records;
 end if;
end $$;
