-- Tournament entry is permanently free. Sponsorship alone is paid.
-- Keep published identities/schedules protected while permitting the one-way fee removal.
create or replace function public.protect_edition() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='DELETE' then if old.edition is not null then raise exception 'Archive published editions';end if;return old;end if;
 if TG_OP='UPDATE' and old.edition is not null then
  if new.edition is distinct from old.edition or new.currency is distinct from old.currency or (new.fee_amount_cents is distinct from old.fee_amount_cents and new.fee_amount_cents is distinct from 0) then raise exception 'Published pricing is immutable';end if;
  if old.status in('locked','voting','spotlight','completed') and (new.starts_at<>old.starts_at or new.registration_ends<>old.registration_ends) then raise exception 'Locked schedule is immutable';end if;
 end if;
 return new;
end $$;
alter table public.tournaments drop constraint tournaments_check1;
update public.tournaments set fee_amount_cents=0 where edition is not null;
alter table public.tournaments add constraint free_tournament_entry check((edition is null and fee_amount_cents is null) or (edition is not null and fee_amount_cents=0));
-- Normalize every publisher, planner and direct server insert at the same boundary.
create function public.free_tournament_entry() returns trigger language plpgsql set search_path=public as $$
begin new.fee_amount_cents=case when new.edition is null then null else 0 end;return new;end $$;
create trigger a_free_tournament_entry before insert or update of edition,fee_amount_cents on public.tournaments for each row execute function public.free_tournament_entry();

-- Preserve occupied places and organizer review without requiring an outstanding checkout.
update public.entries e set status=case when e.review_status='approved' then 'confirmed' else 'pending' end
 from public.tournaments t where t.id=e.tournament_id and t.status='registration' and t.registration_ends>now() and e.status='approved'
 and exists(select 1 from public.reservations r where r.entry_id=e.id and not r.released and r.expires_at>now());
update public.reservations r set expires_at=t.registration_ends from public.entries e,public.tournaments t
 where r.entry_id=e.id and e.tournament_id=t.id and t.status='registration' and t.registration_ends>now() and not r.released and r.expires_at>now() and e.status in('pending','confirmed');
update public.products p set published=true where exists(select 1 from public.entries e where e.product_id=p.id and e.status='confirmed' and e.review_status='approved');

-- A payment from an already-open legacy entry checkout is refunded, never required for admission.
create or replace function public.fulfill_payment(p_event text,p_type text,p_entry uuid,p_checkout text,p_intent text,p_amount integer,p_currency text,p_reservation uuid) returns text language plpgsql set search_path=public as $$
declare e entries;r reservations;decision text;
begin
 select * into e from entries where id=p_entry;
 perform 1 from tournaments where id=e.tournament_id for update;
 select * into r from reservations where id=p_reservation and entry_id=e.id;
 if e.id is null or p_amount<>500 or p_currency<>'usd' then raise exception 'Payment metadata or amount mismatch';end if;
 if r.id is null or (r.checkout_id is not null and r.checkout_id<>p_checkout) then raise exception 'Checkout mismatch';end if;
 if exists(select 1 from webhook_events where id=p_event) then return 'duplicate';end if;
 if exists(select 1 from payments where intent_id=p_intent) then insert into webhook_events(id,type) values(p_event,p_type);return 'duplicate';end if;
 decision=coalesce((select status from payment_signals where intent_id=p_intent),'refund_pending');
 insert into payments(entry_id,checkout_id,intent_id,amount,currency,status) values(e.id,p_checkout,p_intent,p_amount,p_currency,decision);
 insert into webhook_events(id,type) values(p_event,p_type);
 return decision;
end $$;

-- Keep the current sponsor separate from the replacement checkout reservation.
alter table public.promotion_slots add column pending_order_id uuid references public.promotion_orders(id);
create index promotion_slot_pending on public.promotion_slots(pending_order_id) where pending_order_id is not null;
create index promotion_slot_owner on public.promotion_slots(order_id) where order_id is not null;
alter table public.promotion_orders drop constraint promotion_orders_pricing_version_check;
alter table public.promotion_orders add constraint promotion_orders_pricing_version_check check(pricing_version in(1,2,3));
alter table public.promotion_orders alter column pricing_version set default 3;
alter table public.promotion_orders drop constraint promotion_orders_status_check;
alter table public.promotion_orders add constraint promotion_orders_status_check check(status in('pending','paid','expired','removed','superseded'));
create or replace function public.promotion_price(p_slot integer) returns integer language sql immutable set search_path=public as $$select case when p_slot between 1 and 6 then 10000 else null end$$;

create or replace function public.promotion_inventory(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'price',promotion_price(position),
  'state',case when not live then 'closed' when displayed then 'paid' when held then 'reserved' else 'available' end,
  'bookable',live and bookable and not held,
  'name',case when displayed and live then name end,'url',case when displayed and live then url end,
  'tagline',case when displayed and live then tagline end,'logo_url',case when displayed and live then logo_url end) order by position),'[]'::jsonb)
 from (
  select g.position,o.name,o.url,o.tagline,o.logo_url,
   (t.edition is not null and t.status in('registration','locked','voting','spotlight') and promotion_ends(t.id)>now()) live,
   promotion_ends(t.id)>now()+interval '31 minutes' bookable,
   (o.status='paid' and exists(select 1 from promotion_payments p where p.order_id=o.id and p.status='paid')) displayed,
   (coalesce(pending.status='pending' and pending.reserved_until>now(),false) or coalesce(o.status='pending' and o.reserved_until>now(),false)) held
  from tournaments t cross join generate_series(1,6) g(position)
  left join promotion_slots s on s.tournament_id=t.id and s.position=g.position
  left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id where t.id=p_tournament
 ) x;
$$;

create or replace function public.reserve_promotion(p_actor uuid,p_tournament uuid,p_slots integer[],p_request uuid,p_product jsonb) returns uuid language plpgsql set search_path=public as $$
declare t tournaments;chosen integer[];total integer;deadline timestamptz;existing promotion_orders;
begin
 if not exists(select 1 from auth.users where id=p_actor and (email_confirmed_at is not null or raw_app_meta_data->>'provider'='github' or raw_app_meta_data->'providers' ? 'github')) then raise exception 'Sign in before booking promotion';end if;
 select * into t from tournaments where id=p_tournament for update;
 deadline=promotion_ends(t.id);
 if t.id is null or t.edition is null or t.status not in('registration','locked','voting','spotlight') or deadline<clock_timestamp()+interval '31 minutes' then raise exception 'Promotion booking is closed for this edition';end if;
 select array_agg(distinct slot order by slot),sum(promotion_price(slot)) into chosen,total from unnest(p_slots) slot;
 if chosen is null or array_length(chosen,1)>6 or exists(select 1 from unnest(chosen) slot where slot not between 1 and 6) or array_position(p_slots,null) is not null or array_length(chosen,1)<>array_length(p_slots,1) then raise exception 'Choose one or more distinct promotion cards';end if;
 select * into existing from promotion_orders where id=p_request;
 if existing.id is not null then if existing.user_id<>p_actor or existing.tournament_id<>t.id or existing.slots<>chosen then raise exception 'Booking request mismatch';end if;return existing.id;end if;
 if length(trim(coalesce(p_product->>'name','')))<2 or length(p_product->>'name')>80 or length(coalesce(p_product->>'tagline',''))>180 or coalesce(p_product->>'url','') !~ '^https?://' then raise exception 'Invalid promotion details';end if;
 if (select count(*) from promotion_orders where user_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'Please wait before making another booking';end if;
 insert into promotion_slots(tournament_id,position) select t.id,generate_series(1,6) on conflict do nothing;
 if exists(select 1 from promotion_slots s left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id
  where s.tournament_id=t.id and s.position=any(chosen) and (o.status='pending' and o.reserved_until>clock_timestamp() or pending.status='pending' and pending.reserved_until>clock_timestamp())) then raise exception 'Another checkout is reserving one of these cards. Try again after it finishes or expires';end if;
 insert into promotion_orders(id,user_id,tournament_id,slots,amount,name,url,tagline,logo_url,reserved_until) values(p_request,p_actor,t.id,chosen,total,trim(p_product->>'name'),p_product->>'url',coalesce(p_product->>'tagline',''),p_product->>'logo_url',least(clock_timestamp()+interval '60 minutes',deadline));
 update promotion_slots set pending_order_id=p_request where tournament_id=t.id and position=any(chosen);
 return p_request;
end $$;

create or replace function public.fulfill_promotion(p_event text,p_type text,p_order uuid,p_checkout text,p_intent text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare o promotion_orders;t tournaments;decision text;previous_orders uuid[];
begin
 select tournament_id into o.tournament_id from promotion_orders where id=p_order;
 select * into t from tournaments where id=o.tournament_id for update;
 select * into o from promotion_orders where id=p_order for update;
 if o.id is null or p_amount<>o.amount or p_currency<>'usd' then raise exception 'Promotion amount or currency mismatch';end if;
 if exists(select 1 from webhook_events where id=p_event) then return 'duplicate';end if;
 if exists(select 1 from promotion_payments where intent_id=p_intent) then insert into webhook_events(id,type) values(p_event,p_type);return 'duplicate';end if;
 decision='refund_pending';
 if o.status in('pending','expired') and t.status in('registration','locked','voting','spotlight') and clock_timestamp()<promotion_ends(t.id)
  and (o.checkout_id is null or o.checkout_id=p_checkout) and not exists(select 1 from promotion_payments where order_id=o.id and status='paid')
  and (select count(*) from promotion_slots where tournament_id=t.id and position=any(o.slots) and (pending_order_id=o.id or order_id=o.id and pending_order_id is null))=array_length(o.slots,1) then decision='paid';end if;
 decision=coalesce((select status from promotion_payment_signals where intent_id=p_intent),decision);
 insert into promotion_payments(order_id,checkout_id,intent_id,amount,currency,status) values(o.id,p_checkout,p_intent,p_amount,p_currency,decision);
 if decision='paid' then
  select array_agg(distinct order_id) into previous_orders from promotion_slots where tournament_id=t.id and position=any(o.slots) and order_id is not null and order_id<>o.id;
  update promotion_slots set order_id=o.id,pending_order_id=null where tournament_id=t.id and position=any(o.slots);
  update promotion_orders set status='paid' where id=o.id;
  update promotion_orders old_order set status='superseded' where old_order.id=any(previous_orders) and old_order.status='paid' and not exists(select 1 from promotion_slots s where s.order_id=old_order.id);
 else
  update promotion_slots set pending_order_id=null where pending_order_id=o.id;
  if o.status in('pending','expired') then update promotion_orders set status='expired' where id=o.id;end if;
 end if;
 insert into webhook_events(id,type) values(p_event,p_type);return decision;
end $$;

revoke execute on function public.free_tournament_entry(),public.protect_edition(),public.fulfill_payment(text,text,uuid,text,text,integer,text,uuid),public.promotion_price(integer),public.promotion_inventory(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb),public.fulfill_promotion(text,text,uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.free_tournament_entry(),public.protect_edition(),public.fulfill_payment(text,text,uuid,text,text,integer,text,uuid),public.promotion_price(integer),public.promotion_inventory(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb),public.fulfill_promotion(text,text,uuid,text,text,integer,text) to service_role;
