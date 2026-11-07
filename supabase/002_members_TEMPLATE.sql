-- Replace the TWO placeholders below with exact Authentication > Users UUIDs.
-- Paste into SQL Editor only AFTER creating the two users.
insert into public.members(user_id, display_name) values
 ('REPLACE-WITH-KARI-UUID', 'Kari'),
 ('REPLACE-WITH-ADI-UUID', 'Adi')
on conflict (user_id) do update set display_name=excluded.display_name;

select user_id,display_name from public.members order by display_name;
