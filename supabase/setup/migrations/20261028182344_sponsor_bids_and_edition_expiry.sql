-- Per-card bids are immutable payment contracts. Existing bookings retain their prices.
alter table public.promotion_orders add column slot_amounts jsonb not null default '{}';
update public.promotion_orders o set slot_amounts=(select jsonb_object_agg(slot::text,case o.pricing_version when 1 then (array[10000,70000,5000])[((slot-1)%3)+1] when 2 then (array[7000,5000,3000])[((slot-1)%3)+1] else 10000 end) from unnest(o.slots) slot);
alter table public.promotion_orders drop constraint promotion_orders_pricing_version_check;
alter table public.promotion_orders add constraint promotion_orders_pricing_version_check check(pricing_version in(1,2,3,4));
alter table public.promotion_orders alter column pricing_version set default 4;
create function public.protect_promotion_bid() returns trigger language plpgsql set search_path=public as $$
begin
 if new.slots is distinct from old.slots or new.amount<>old.amount or new.slot_amounts is distinct from old.slot_amounts or new.pricing_version<>old.pricing_version or new.user_id<>old.user_id or new.tournament_id<>old.tournament_id then raise exception 'Sponsor bid contracts are immutable';end if;
 return new;
end $$;
create trigger immutable_promotion_bid before update on public.promotion_orders for each row execute function public.protect_promotion_bid();

-- A later published edition's start is a hard cutoff, even if the old cron tick is late.
create or replace function public.promotion_ends(p_tournament uuid) returns timestamptz language sql stable set search_path=public as $$
 select least(coalesce((select spotlight_ends from champions where tournament_id=t.id),t.starts_at+make_interval(hours=>case when t.extended_cycle then 72 when t.daily_cycle then 24 else 168 end)),
  (select min(n.starts_at) from tournaments n where n.edition>t.edition and n.status not in('draft','cancelled'))) from tournaments t where t.id=p_tournament;
$$;
create or replace function public.promotion_inventory(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'price',case when displayed then greatest(10000,current_bid+100) else 10000 end,'minimum_bid',case when displayed then greatest(10000,current_bid+100) else 10000 end,'current_amount',case when displayed and live then current_bid end,
  'state',case when not live then 'closed' when displayed then 'paid' when held then 'reserved' else 'available' end,
  'bookable',live and bookable and not held,
  'name',case when displayed and live then name end,'url',case when displayed and live then url end,
  'tagline',case when displayed and live then tagline end,'logo_url',case when displayed and live then logo_url end) order by position),'[]'::jsonb)
 from (
  select g.position,o.name,o.url,o.tagline,o.logo_url,coalesce((o.slot_amounts->>g.position::text)::integer,0) current_bid,
   (t.edition is not null and t.status in('registration','locked','voting','spotlight') and promotion_ends(t.id)>now()) live,
   promotion_ends(t.id)>now()+interval '31 minutes' bookable,
   (o.status='paid' and exists(select 1 from promotion_payments p where p.order_id=o.id and p.status='paid')) displayed,
   (coalesce(pending.status='pending' and pending.reserved_until>now(),false) or coalesce(o.status='pending' and o.reserved_until>now(),false)) held
  from tournaments t cross join generate_series(1,6) g(position)
  left join promotion_slots s on s.tournament_id=t.id and s.position=g.position
  left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id where t.id=p_tournament
 ) x;
$$;

-- The default only gives old clients a clear rejection, never a same-price takeover.
drop function public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb);
create function public.reserve_promotion(p_actor uuid,p_tournament uuid,p_slots integer[],p_request uuid,p_product jsonb,p_bids jsonb default null) returns uuid language plpgsql set search_path=public as $$
declare t tournaments;chosen integer[];total integer;deadline timestamptz;existing promotion_orders;chosen_position integer;bid integer;minimum integer;
begin
 if not exists(select 1 from auth.users where id=p_actor and (email_confirmed_at is not null or raw_app_meta_data->>'provider'='github' or raw_app_meta_data->'providers' ? 'github')) then raise exception 'Sign in before booking promotion';end if;
 select * into t from tournaments where id=p_tournament for update;
 deadline=promotion_ends(t.id);
 if t.id is null or t.edition is null or t.status not in('registration','locked','voting','spotlight') or deadline<clock_timestamp()+interval '31 minutes' then raise exception 'Promotion booking is closed for this edition';end if;
 select array_agg(distinct slot order by slot) into chosen from unnest(p_slots) slot;
 if chosen is null or array_length(chosen,1)>6 or exists(select 1 from unnest(chosen) slot where slot not between 1 and 6) or array_position(p_slots,null) is not null or array_length(chosen,1)<>array_length(p_slots,1) then raise exception 'Choose one or more distinct promotion cards';end if;
 if p_bids is null or jsonb_typeof(p_bids)<>'object' then raise exception 'Refresh this page and enter a bid for each card';end if;
 if (select count(*) from jsonb_object_keys(p_bids))<>array_length(chosen,1) or not p_bids ?& (select array_agg(slot::text) from unnest(chosen) slot) then raise exception 'Enter exactly one bid for each selected card';end if;
 if exists(select 1 from jsonb_each(p_bids) where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]{1,8}$') then raise exception 'Bids must be whole cents within the checkout limit';end if;
 select sum((p_bids->>slot::text)::integer) into total from unnest(chosen) slot;
 if total<10000 or total>99999999 then raise exception 'The combined bid exceeds the checkout limit';end if;
 select * into existing from promotion_orders where id=p_request;
 if existing.id is not null then
  if existing.user_id<>p_actor or existing.tournament_id<>t.id or existing.slots<>chosen or existing.slot_amounts is distinct from p_bids then raise exception 'Booking request mismatch';end if;
  return existing.id;
 end if;
 if length(trim(coalesce(p_product->>'name','')))<2 or length(p_product->>'name')>80 or length(coalesce(p_product->>'tagline',''))>180 or coalesce(p_product->>'url','') !~ '^https?://' then raise exception 'Invalid promotion details';end if;
 if (select count(*) from promotion_orders where user_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'Please wait before making another booking';end if;
 insert into promotion_slots(tournament_id,position) select t.id,generate_series(1,6) on conflict do nothing;
 if exists(select 1 from promotion_slots s left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id
  where s.tournament_id=t.id and s.position=any(chosen) and (o.status='pending' and o.reserved_until>clock_timestamp() or pending.status='pending' and pending.reserved_until>clock_timestamp())) then raise exception 'Another checkout is reserving one of these cards. Try again after it finishes or expires';end if;
 foreach chosen_position in array chosen loop
  bid=(p_bids->>chosen_position::text)::integer;
  select greatest(10000,coalesce(case when o.status='paid' and exists(select 1 from promotion_payments pay where pay.order_id=o.id and pay.status='paid') then (o.slot_amounts->>chosen_position::text)::integer+100 end,10000)) into minimum
   from promotion_slots s left join promotion_orders o on o.id=s.order_id where s.tournament_id=t.id and s.position=chosen_position;
  if bid<minimum then raise exception 'Card % needs a bid of at least $% USD',chosen_position,to_char(minimum/100.0,'FM999999990.00');end if;
 end loop;
 insert into promotion_orders(id,user_id,tournament_id,slots,amount,slot_amounts,name,url,tagline,logo_url,reserved_until)
  values(p_request,p_actor,t.id,chosen,total,p_bids,trim(p_product->>'name'),p_product->>'url',coalesce(p_product->>'tagline',''),p_product->>'logo_url',least(clock_timestamp()+interval '60 minutes',deadline));
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
  and (select count(*) from promotion_slots where tournament_id=t.id and position=any(o.slots) and (pending_order_id=o.id or order_id=o.id and pending_order_id is null))=array_length(o.slots,1) and not exists(select 1 from promotion_slots s join promotion_orders current_order on current_order.id=s.order_id
   where s.tournament_id=t.id and s.position=any(o.slots) and current_order.id<>o.id and current_order.status='paid'
   and exists(select 1 from promotion_payments pay where pay.order_id=current_order.id and pay.status='paid')
   and (o.slot_amounts->>s.position::text)::integer<(current_order.slot_amounts->>s.position::text)::integer+100) then decision='paid';end if;
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

create or replace function public.tick() returns void language plpgsql set search_path=public as $$begin
 perform tick_before_promotions();
 update promotion_orders set status='expired' where status='pending' and (reserved_until<=now() or promotion_ends(tournament_id)<=now() or exists(select 1 from tournaments t where t.id=tournament_id and t.status='cancelled'));
 update promotion_payments set status='refund_pending' where status='paid' and order_id in(select o.id from promotion_orders o join tournaments t on t.id=o.tournament_id where t.status='cancelled');
 update promotion_orders set status='expired' where status='paid' and promotion_ends(tournament_id)<=now();
 update promotion_slots set order_id=null,pending_order_id=null where promotion_ends(tournament_id)<=now() or exists(select 1 from tournaments t where t.id=tournament_id and t.status='cancelled');
end $$;
revoke execute on function public.protect_promotion_bid(),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb,jsonb),public.promotion_ends(uuid),public.promotion_inventory(uuid),public.fulfill_promotion(text,text,uuid,text,text,integer,text),public.tick() from public,anon,authenticated;
grant execute on function public.protect_promotion_bid(),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb,jsonb),public.promotion_ends(uuid),public.promotion_inventory(uuid),public.fulfill_promotion(text,text,uuid,text,text,integer,text),public.tick() to service_role;
