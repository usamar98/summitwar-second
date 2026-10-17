-- Sign in to the website once, then copy your UID from Supabase Authentication > Users.
-- Replace only the placeholder below. Run this as postgres in the SQL Editor.
begin;
do $$
declare account_text text := 'PASTE_YOUR_AUTH_USER_UUID_HERE'; account_id uuid;
begin
 if account_text = 'PASTE_' || 'YOUR_AUTH_USER_UUID_HERE' or account_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception 'Replace PASTE_YOUR_AUTH_USER_UUID_HERE with the User UID of your existing organizer account.';
 end if;
 account_id := account_text::uuid;
 if not exists(select 1 from auth.users where id=account_id) then raise exception 'That Auth user does not exist. Sign in to SummitWar first, then copy the User UID.'; end if;
 insert into public.admin_roles(user_id) values(account_id) on conflict(user_id) do nothing;
end $$;
commit;
select 'Organizer access is configured. Sign in and open /admin.' as result;
