-- Upgrade existing installations without changing published edition identities.
alter table public.products alter column audience drop not null;
alter table public.products alter column problem drop not null;
alter table public.products alter column pricing drop not null;
alter table public.products alter column screenshot_url drop not null;
alter table public.products alter column demo_url drop not null;
alter table public.products alter column question drop not null;
alter table public.entries add column registration_slot integer check(registration_slot between 1 and 8);
alter table public.entries add column review_status text not null default 'pending' check(review_status in ('pending','approved','rejected'));
update public.entries set review_status='approved' where status in ('approved','confirmed');
with placed as (select e.id,row_number() over(partition by e.tournament_id order by e.created_at,e.id) slot from entries e where e.status='confirmed' or exists(select 1 from reservations r where r.entry_id=e.id and not r.released and r.expires_at>now()))
update entries set registration_slot=placed.slot from placed where entries.id=placed.id and placed.slot<=8;
create unique index confirmed_place_unique on public.entries(tournament_id,registration_slot) where status='confirmed' and registration_slot is not null;

create table public.site_lookup_requests(id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index site_lookup_rate on public.site_lookup_requests(user_id,created_at);
alter table public.site_lookup_requests enable row level security;
revoke all on public.site_lookup_requests from anon,authenticated;
grant all on public.site_lookup_requests to service_role;
grant usage,select on sequence public.site_lookup_requests_id_seq to service_role;
create function public.limit_site_lookup(p_actor uuid) returns void language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext(p_actor::text));
 if (select count(*) from site_lookup_requests where user_id=p_actor and created_at>now()-interval '1 minute')>=12 or (select count(*) from site_lookup_requests where user_id=p_actor and created_at>now()-interval '1 hour')>=60 then raise exception 'Please wait before fetching another website'; end if;
 delete from site_lookup_requests where created_at<now()-interval '24 hours';
 insert into site_lookup_requests(user_id) values(p_actor);
end $$;

create or replace function public.seat_availability(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('confirmed',c,'reserved',r,'available',greatest(0,8-c-r),'booked_slots',coalesce((select jsonb_agg(slot order by slot) from(select distinct e.registration_slot slot from entries e where e.tournament_id=p_tournament and e.registration_slot is not null and (e.status='confirmed' or exists(select 1 from reservations r where r.entry_id=e.id and not r.released and r.expires_at>now()))) slots),'[]'::jsonb)) from
 (select count(*) c from entries where tournament_id=p_tournament and status='confirmed') a,
 (select count(*) r from reservations where tournament_id=p_tournament and not released and expires_at>now() and entry_id not in(select id from entries where status='confirmed')) b;
$$;

create function public.submit_application(p_actor uuid,p_tournament uuid,p_product jsonb,p_slot integer default null,p_existing uuid default null) returns jsonb language plpgsql set search_path=public as $$
declare t tournaments; e entries; pid uuid; eid uuid; chosen integer; occupied integer[]; r reservations;
begin
 select * into t from tournaments where id=p_tournament for update;
 if t.id is null or t.status<>'registration' or clock_timestamp()>=t.registration_ends then raise exception 'Registration is closed'; end if;
 if exists(select 1 from matches where tournament_id=t.id) then raise exception 'Rescheduled bracket retains its original founders'; end if;
 update reservations set released=true where tournament_id=t.id and expires_at<=clock_timestamp();
 select * into e from entries where tournament_id=t.id and user_id=p_actor;
 if e.id is not null then
  if p_existing is not null and p_existing<>e.product_id then raise exception 'Resume the app you already submitted from your dashboard';end if;
  if p_product->>'url' is not null and not exists(select 1 from products where id=e.product_id and normalized_url=regexp_replace(regexp_replace(regexp_replace(lower(p_product->>'url'),'^https?://(www[.])?','','i'),'[?#].*$','','g'),'/+$','','g')) then raise exception 'You already submitted a different app to this tournament';end if;
  select * into r from reservations where entry_id=e.id and not released and expires_at>clock_timestamp();
  if e.status='confirmed' or r.id is not null then
   return jsonb_build_object('entry',e.id,'status',e.status,'fee',t.fee_amount_cents,'slot',e.registration_slot,'review_status',e.review_status);
  end if;
  if e.status not in ('pending','approved') then raise exception 'You have already applied to this tournament'; end if;
  -- An expired checkout can only reclaim its original application; content stays unchanged.
  pid=e.product_id;
 else
  if p_existing is not null then
   if not exists(select 1 from products where id=p_existing and owner_id=p_actor) then raise exception 'Product ownership required'; end if;
   pid=p_existing;
  else
   insert into products(owner_id,name,slug,url,logo_url,category,tagline,founder,x_handle,free_trial)
   values(p_actor,p_product->>'name',p_product->>'slug',p_product->>'url',p_product->>'logo_url',p_product->>'category',coalesce(p_product->>'tagline',''),p_product->>'founder',p_product->>'x_handle',false) returning id into pid;
  end if;
 end if;
 select coalesce(array_agg(claim.registration_slot),'{}'::integer[]) into occupied from entries claim where claim.tournament_id=t.id and claim.registration_slot is not null and (claim.status='confirmed' or exists(select 1 from reservations booking where booking.entry_id=claim.id and not booking.released and booking.expires_at>clock_timestamp()));
 if p_slot is not null then
  if p_slot not between 1 and 8 or p_slot=any(occupied) then raise exception 'This place is already taken. Choose another open place'; end if;
  chosen=p_slot;
 else select slot into chosen from generate_series(1,8) slot where not(slot=any(occupied)) order by slot limit 1; end if;
 if chosen is null or (seat_availability(t.id)->>'available')::int<1 then raise exception 'All eight places are already taken'; end if;
 if t.fee_amount_cents>0 and t.registration_ends<clock_timestamp()+interval '31 minutes' then raise exception 'Registration needs at least 31 minutes remaining for checkout'; end if;
 if e.id is null then insert into entries(tournament_id,product_id,user_id,status,registration_slot,review_status) values(t.id,pid,p_actor,case when t.fee_amount_cents=0 then 'pending' else 'approved' end,chosen,'pending') returning id into eid;
 else eid=e.id;update entries set status=case when t.fee_amount_cents=0 then 'pending' else 'approved' end,registration_slot=chosen where id=eid;end if;
 insert into reservations(entry_id,tournament_id,expires_at) values(eid,t.id,case when t.fee_amount_cents=0 then t.registration_ends else least(clock_timestamp()+interval '60 minutes',t.registration_ends) end);
 return jsonb_build_object('entry',eid,'status',case when t.fee_amount_cents=0 then 'pending' else 'approved' end,'fee',t.fee_amount_cents,'slot',chosen,'review_status','pending');
end $$;

-- Keep existing organizer logic, wrapping the old function to support submitted
-- reservations and paid entries still awaiting review.
alter function public.admin_command(uuid,text,uuid,jsonb) rename to admin_command_before_submission;
create function public.admin_command(p_actor uuid,p_action text,p_target uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql set search_path=public as $$
declare e entries; t tournaments; slot integer;
begin
 if not exists(select 1 from admin_roles where user_id=p_actor) then raise exception 'Admin access required'; end if;
 if p_action in ('approve','reject','waitlist','remove') then
  select tournament_id into e.tournament_id from entries where id=p_target;
  select * into t from tournaments where id=e.tournament_id for update;
  select * into e from entries where id=p_target for update;
  if t.status<>'registration' or clock_timestamp()>=t.registration_ends then raise exception 'Registration is closed'; end if;
  if p_action='approve' then
   if e.status='confirmed' then update entries set review_status='approved' where id=e.id;update products set published=true where id=e.product_id;
   elsif t.fee_amount_cents=0 and exists(select 1 from reservations where entry_id=e.id and not released and expires_at>clock_timestamp()) then
    update reservations set released=true where entry_id=e.id;update entries set status='confirmed',review_status='approved' where id=e.id;update products set published=true where id=e.product_id;
   else
    perform admin_command_before_submission(p_actor,p_action,p_target,p_data);
    update entries set review_status='approved' where id=e.id;
    if exists(select 1 from entries where id=e.id and status='confirmed') then update products set published=true where id=e.product_id;end if;
    if e.registration_slot is null then
     select candidate into slot from generate_series(1,8) candidate where not exists(select 1 from entries other where other.tournament_id=t.id and other.registration_slot=candidate and other.id<>e.id and (other.status='confirmed' or exists(select 1 from reservations r where r.entry_id=other.id and not r.released and r.expires_at>now()))) order by candidate limit 1;
     update entries set registration_slot=slot where id=e.id;
    end if;
   end if;
  elsif p_action in ('reject','waitlist') and e.status='confirmed' and e.review_status='pending' then
   update entries set status=case when p_action='reject' then 'rejected' else 'waitlisted' end,review_status=case when p_action='reject' then 'rejected' else 'pending' end,registration_slot=null where id=e.id;
   update reservations set released=true where entry_id=e.id;update payments set status='refund_pending' where entry_id=e.id and status='paid';
  else perform admin_command_before_submission(p_actor,p_action,p_target,p_data);update entries set registration_slot=null,review_status=case when p_action in ('reject','remove') then 'rejected' else 'pending' end where id=e.id;end if;
  insert into audit_logs(actor,action,target,detail) values(p_actor,'review_'||p_action,p_target,p_data);
  return jsonb_build_object('id',e.id);
 end if;
 return admin_command_before_submission(p_actor,p_action,p_target,p_data);
end $$;

-- Publishing is contingent on organizer review; a paid seat can stay private
-- until approval, and rejected paid submissions enter the refund queue.
create function public.publish_reviewed_entry() returns trigger language plpgsql set search_path=public as $$
begin
 if new.published and not old.published and exists(select 1 from entries where product_id=new.id and status='confirmed') and not exists(select 1 from entries where product_id=new.id and status='confirmed' and review_status='approved') then new.published=false;end if;
 return new;
end $$;
create trigger require_entry_review before update of published on products for each row execute function publish_reviewed_entry();
alter function public.tick() rename to tick_before_submission;
create function public.tick() returns void language plpgsql set search_path=public as $$
declare t tournaments;
begin
 for t in select * from tournaments where status='registration' and registration_ends<=now() and exists(select 1 from entries where tournament_id=tournaments.id and status='confirmed' and review_status<>'approved') for update skip locked loop
  update tournaments set registration_ends=greatest(now()+interval '24 hours',registration_ends+interval '7 days'),starts_at=greatest(now()+interval '25 hours',starts_at+interval '7 days') where id=t.id;
  insert into notifications(user_id,message) select user_id,'Voting was rescheduled because all eight participants must pass organizer review.' from entries where tournament_id=t.id;
 end loop;
 perform tick_before_submission();
end $$;
revoke execute on function public.tick(),public.tick_before_submission() from public,anon,authenticated;
grant execute on function public.tick(),public.tick_before_submission() to service_role;
revoke execute on function public.limit_site_lookup(uuid),public.submit_application(uuid,uuid,jsonb,integer,uuid),public.admin_command(uuid,text,uuid,jsonb),public.admin_command_before_submission(uuid,text,uuid,jsonb),public.publish_reviewed_entry() from public,anon,authenticated;
grant execute on function public.limit_site_lookup(uuid),public.submit_application(uuid,uuid,jsonb,integer,uuid),public.admin_command(uuid,text,uuid,jsonb),public.admin_command_before_submission(uuid,text,uuid,jsonb),public.publish_reviewed_entry() to service_role;

-- A delayed payment may not occupy another founder's claimed place.
create or replace function public.fulfill_payment(p_event text,p_type text,p_entry uuid,p_checkout text,p_intent text,p_amount integer,p_currency text,p_reservation uuid) returns text language plpgsql set search_path=public as $$
declare e entries; t tournaments; r reservations; existing payments; decision text;
begin
 select tournament_id into e.tournament_id from entries where id=p_entry;
 select * into t from tournaments where id=e.tournament_id for update;
 select * into e from entries where id=p_entry for update;
 if t.id is null or p_amount<>t.fee_amount_cents or p_currency<>t.currency or p_amount<>500 then raise exception 'Payment metadata or amount mismatch'; end if;
 select * into r from reservations where id=p_reservation and entry_id=e.id;
 if r.id is null then raise exception 'Checkout mismatch'; end if;
 if exists(select 1 from webhook_events where id=p_event) then return 'duplicate'; end if;
 select * into existing from payments where intent_id=p_intent;
 if existing.id is not null then insert into webhook_events(id,type) values(p_event,p_type); return 'duplicate'; end if;
 -- Release expired reservations under the tournament lock; delayed payments can only take a real seat.
 update reservations set released=true where tournament_id=t.id and expires_at<=now();
 decision='refund_pending';
 if e.status='approved' and t.status='registration' and now()<t.registration_ends and now()<t.starts_at and (r.checkout_id is null or r.checkout_id=p_checkout) and not exists(select 1 from payment_signals where intent_id=p_intent)
  and (e.registration_slot is null or not exists(select 1 from entries other where other.tournament_id=t.id and other.id<>e.id and other.registration_slot=e.registration_slot and (other.status='confirmed' or exists(select 1 from reservations occupied where occupied.entry_id=other.id and not occupied.released and occupied.expires_at>clock_timestamp())))) then
  if (not r.released and r.expires_at>now()) or (seat_availability(t.id)->>'available')::int>0 then
   decision='paid'; update entries set status='confirmed' where id=e.id; update products set published=true where id=e.product_id;
  end if;
 end if;
 select coalesce((select status from payment_signals where intent_id=p_intent),decision) into decision;
 insert into payments(entry_id,checkout_id,intent_id,amount,currency,status) values(e.id,p_checkout,p_intent,p_amount,p_currency,decision);
 update reservations set released=true where id=r.id;
 insert into webhook_events(id,type) values(p_event,p_type);
 return decision;
end $$;
