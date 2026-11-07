-- SAFE ADDITIVE MIGRATION for an EXISTING v6/v7 SiteWarrior database.
-- Adds the Weekly Review record type; does not delete or transform existing rows.
begin;
alter table public.sw_records drop constraint if exists sw_collection_allowed;
alter table public.sw_records add constraint sw_collection_allowed check (
 collection in ('leads','leadActivities','tasks','projects','marketing','payments','expenses',
 'subscriptions','events','journal','decisions','quotes','offers','activity','deleted',
 'weeklyReviews','__meta')
);
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
   if col is null or col not in ('leads','leadActivities','tasks','projects','marketing','payments','expenses','subscriptions','events','journal','decisions','quotes','offers','activity','deleted','weeklyReviews','__meta')
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
