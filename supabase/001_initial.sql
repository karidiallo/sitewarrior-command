-- SiteWarrior Growth OS v6: RUN ON A NEW/EMPTY SUPABASE PROJECT.
-- Existing databases need a reviewed migration: do not use this as a blind reset.
begin;
create table if not exists public.members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique check (display_name in ('Kari','Adi'))
);
create table if not exists public.sw_records (
  collection text not null,
  record_id text not null,
  payload jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (collection,record_id),
  constraint sw_collection_allowed check(collection in ('leads','leadActivities','tasks','projects','marketing','payments','expenses','subscriptions','events','journal','decisions','quotes','offers','activity','deleted','__meta')),
  constraint sw_record_id_length check(length(record_id) between 1 and 200)
);
create index if not exists sw_records_collection_idx on public.sw_records(collection) where not deleted;
create index if not exists sw_records_updated_idx on public.sw_records(updated_at desc);
create table if not exists public.sw_audit (
 audit_id bigint generated always as identity primary key,
 collection text not null,
 record_id text not null,
 action text not null check(action in ('INSERT','UPDATE')),
 old_revision integer,
 new_revision integer not null,
 user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 old_payload jsonb,
 new_payload jsonb,
 deleted boolean not null default false
);
create index if not exists sw_audit_time_idx on public.sw_audit(created_at desc);

alter table public.members enable row level security;
alter table public.sw_records enable row level security;
alter table public.sw_audit enable row level security;
revoke all on public.members from anon,authenticated;
revoke all on public.sw_records from anon,authenticated;
revoke all on public.sw_audit from anon,authenticated;
grant select on public.members to authenticated;
grant select on public.sw_records to authenticated;
grant select on public.sw_audit to authenticated;
drop policy if exists "SW member may see own identity" on public.members;
create policy "SW member may see own identity" on public.members for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "SW member may read records" on public.sw_records;
create policy "SW member may read records" on public.sw_records for select to authenticated using (exists(select 1 from public.members where user_id=(select auth.uid())));
drop policy if exists "SW member may read audit" on public.sw_audit;
create policy "SW member may read audit" on public.sw_audit for select to authenticated using (exists(select 1 from public.members where user_id=(select auth.uid())));

create or replace function public.sw_audit_change() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.sw_audit(collection,record_id,action,old_revision,new_revision,user_id,old_payload,new_payload,deleted)
 values(new.collection,new.record_id,tg_op,case when tg_op='UPDATE' then old.revision else null end,
 new.revision,new.updated_by,case when tg_op='UPDATE' then old.payload else null end,new.payload,new.deleted);
 return new;
end; $$;
revoke all on function public.sw_audit_change() from public,anon,authenticated;
drop trigger if exists sw_record_audit on public.sw_records;
create trigger sw_record_audit after insert or update on public.sw_records for each row execute function public.sw_audit_change();

create or replace function public.sw_apply_changes(p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare op jsonb; col text; rid text; expected int; actual int; new_rev int;
 result jsonb := '[]'::jsonb; payload_size int;
begin
 if (select auth.uid()) is null or not exists(select 1 from public.members where user_id=(select auth.uid())) then
   raise exception 'Forbidden: not a SiteWarrior member' using errcode='42501';
 end if;
 if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) not between 1 and 80 then
   raise exception 'Invalid changes batch';
 end if;
 for op in select value from jsonb_array_elements(p_changes) loop
   col := op->>'collection';rid:=op->>'id';
   if (op->>'expected') !~ '^[0-9]{1,9}$' then raise exception 'Invalid revision'; end if;
   expected:=(op->>'expected')::integer;
   if col is null or col not in ('leads','leadActivities','tasks','projects','marketing','payments','expenses','subscriptions','events','journal','decisions','quotes','offers','activity','deleted','__meta')
     or rid is null or length(rid) not between 1 and 200
     or jsonb_typeof(op->'payload') is distinct from 'object' then
     raise exception 'Invalid record';
   end if;
   payload_size:=octet_length((op->'payload')::text);
   if payload_size>262144 then raise exception 'Record too large'; end if;
   select revision into actual from public.sw_records where collection=col and record_id=rid for update;
   if actual is null then
     if expected<>0 then raise exception 'Version conflict on % / %',col,rid; end if;
     insert into public.sw_records(collection,record_id,payload,revision,deleted,updated_by)
     values(col,rid,op->'payload',1,coalesce((op->>'deleted')::boolean,false),(select auth.uid()));new_rev:=1;
   else
     if actual<>expected then raise exception 'Version conflict on % / %',col,rid; end if;
     update public.sw_records set payload=op->'payload',revision=revision+1,
       deleted=coalesce((op->>'deleted')::boolean,false),updated_by=(select auth.uid()),updated_at=now()
     where collection=col and record_id=rid returning revision into new_rev;
   end if;
   result:=result||jsonb_build_array(jsonb_build_object('collection',col,'id',rid,'revision',new_rev));
 end loop;
 return result;
end; $$;
revoke all on function public.sw_apply_changes(jsonb) from public,anon;
grant execute on function public.sw_apply_changes(jsonb) to authenticated;
commit;
-- In Auth > Users create Kari and Adi, then run supabase/002_members_TEMPLATE.sql with their real UUIDs.
