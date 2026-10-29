-- Fixed-price sponsorship protects the purchased card through a tournament milestone.
-- Historical contracts retain their recorded prices; new bookings use pricing version 5.
-- The server checks verified founders without reading their email addresses or profile metadata.
grant select(email_confirmed_at) on auth.users to service_role;
alter table public.promotion_orders add column placement_plan text;
alter table public.promotion_orders drop constraint promotion_orders_pricing_version_check;
alter table public.promotion_orders add constraint promotion_orders_pricing_version_check check(pricing_version in(1,2,3,4,5));
alter table public.promotion_orders add constraint promotion_plan_contract check(
 (pricing_version=5 and placement_plan is not null and placement_plan in('quarterfinal','semifinal','tournament'))
 or (pricing_version<5 and placement_plan is null));
alter table public.promotion_orders alter column pricing_version set default 5;
create or replace function public.protect_promotion_bid() returns trigger language plpgsql set search_path=public as $$
begin
 if new.slots is distinct from old.slots or new.amount<>old.amount or new.slot_amounts is distinct from old.slot_amounts or new.pricing_version<>old.pricing_version or new.placement_plan is distinct from old.placement_plan or new.user_id<>old.user_id or new.tournament_id<>old.tournament_id then raise exception 'Sponsor purchase contracts are immutable';end if;
 return new;
end $$;

-- A planned successor may be postponed: full coverage follows its current start.
create or replace function public.promotion_ends(p_tournament uuid) returns timestamptz language sql stable set search_path=public as $$
 select coalesce((select min(n.starts_at) from tournaments n where n.edition>t.edition and n.status not in('draft','cancelled')),'infinity'::timestamptz)
 from tournaments t where t.id=p_tournament;
$$;
create function public.promotion_plan_price(p_plan text) returns integer language sql immutable set search_path=public as $$
 select case p_plan when 'quarterfinal' then 10000 when 'semifinal' then 20000 when 'tournament' then 30000 end;
$$;
create function public.promotion_plan_ends(p_tournament uuid,p_plan text) returns timestamptz language sql stable set search_path=public as $$
 select case p_plan when 'tournament' then promotion_ends(t.id)
 when 'quarterfinal' then least(promotion_ends(t.id),coalesce((select max(ends_at) from matches where tournament_id=t.id and round=1),t.starts_at+make_interval(hours=>case when t.extended_cycle or not t.daily_cycle then 24 else 4 end)))
 when 'semifinal' then least(promotion_ends(t.id),coalesce((select max(ends_at) from matches where tournament_id=t.id and round=2),t.starts_at+make_interval(hours=>case when t.extended_cycle then 48 when t.daily_cycle then 8 else 40 end))) end
 from tournaments t where t.id=p_tournament;
$$;
create function public.promotion_round_finished(p_tournament uuid,p_round integer) returns boolean language sql stable set search_path=public as $$
 select count(*)=case p_round when 1 then 4 when 2 then 2 else 1 end and bool_and(winner_id is not null and ends_at<=now())
 from matches where tournament_id=p_tournament and round=p_round;
$$;
create function public.promotion_order_ends(p_order uuid) returns timestamptz language sql stable set search_path=public as $$
 select case when pricing_version=5 then promotion_plan_ends(tournament_id,placement_plan) else promotion_ends(tournament_id) end from promotion_orders where id=p_order;
$$;
create function public.promotion_protected(p_order uuid) returns boolean language sql stable set search_path=public as $$
 select coalesce((select o.status='paid' and t.status in('registration','locked','voting','spotlight','completed') and promotion_ends(t.id)>now()
  and exists(select 1 from promotion_payments p where p.order_id=o.id and p.status='paid')
  and (o.pricing_version<5 or o.placement_plan='tournament' or now()<promotion_order_ends(o.id)
   or not promotion_round_finished(t.id,case o.placement_plan when 'quarterfinal' then 1 else 2 end))
 from promotion_orders o join tournaments t on t.id=o.tournament_id where o.id=p_order),false);
$$;
create function public.promotion_plans(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',plan,'price',promotion_plan_price(plan),'ends',case when isfinite(promotion_plan_ends(t.id,plan)) then promotion_plan_ends(t.id,plan) end) order by promotion_plan_price(plan)),'[]'::jsonb)
 from tournaments t cross join unnest(array['quarterfinal','semifinal','tournament']) plan
 where t.id=p_tournament and t.edition is not null and t.status in('registration','locked','voting','spotlight','completed')
 and promotion_plan_ends(t.id,plan)>now()+interval '31 minutes'
 and (plan='tournament' or not promotion_round_finished(t.id,case plan when 'quarterfinal' then 1 else 2 end));
$$;
create or replace function public.promotion_inventory(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'price',coalesce((plans->0->>'price')::integer,10000),'available_plans',plans,
  'state',case when not live then 'closed' when displayed then 'paid' when held then 'reserved' else 'available' end,
  'bookable',live and not displayed and not held and jsonb_array_length(plans)>0,
  'current_amount',case when displayed then current_amount end,'placement_plan',case when displayed then placement_plan end,
  'locked_until',case when displayed then locked_until end,
  'name',case when displayed then name end,'url',case when displayed then url end,'tagline',case when displayed then tagline end,'logo_url',case when displayed then logo_url end) order by position),'[]'::jsonb)
 from (
  select g.position,o.name,o.url,o.tagline,o.logo_url,o.placement_plan,case when isfinite(promotion_order_ends(o.id)) then promotion_order_ends(o.id) end locked_until,(o.slot_amounts->>g.position::text)::integer current_amount,
   (t.edition is not null and t.status in('registration','locked','voting','spotlight','completed') and promotion_ends(t.id)>now()) live,
   promotion_protected(o.id) displayed,promotion_plans(t.id) plans,
   (coalesce(pending.status='pending' and pending.reserved_until>now(),false) or coalesce(o.status='pending' and o.reserved_until>now(),false)) held
  from tournaments t cross join generate_series(1,6) g(position)
  left join promotion_slots s on s.tournament_id=t.id and s.position=g.position
  left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id where t.id=p_tournament
 ) x;
$$;

drop function public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb,jsonb);
create function public.reserve_promotion(p_actor uuid,p_tournament uuid,p_slots integer[],p_request uuid,p_product jsonb,p_bids jsonb default null,p_plan text default null) returns uuid language plpgsql set search_path=public as $$
declare t tournaments;chosen integer[];total integer;deadline timestamptz;existing promotion_orders;amounts jsonb;price integer;
begin
 if not exists(select 1 from auth.users where id=p_actor and (email_confirmed_at is not null or exists(select 1 from auth.identities i where i.user_id=p_actor and i.provider='github'))) then raise exception 'Sign in before booking promotion';end if;
 price=promotion_plan_price(p_plan);
 if price is null or p_bids is not null then raise exception 'Refresh this page and choose a fixed sponsorship plan';end if;
 select * into t from tournaments where id=p_tournament for update;
 deadline=promotion_plan_ends(t.id,p_plan);
 if t.id is null or t.edition is null or t.status not in('registration','locked','voting','spotlight','completed') or deadline is null or deadline<=clock_timestamp()+interval '31 minutes'
  or (p_plan<>'tournament' and promotion_round_finished(t.id,case p_plan when 'quarterfinal' then 1 else 2 end)) then raise exception 'This sponsorship period is no longer available';end if;
 select array_agg(distinct slot order by slot) into chosen from unnest(p_slots) slot;
 if chosen is null or array_length(chosen,1)>6 or exists(select 1 from unnest(chosen) slot where slot not between 1 and 6) or array_position(p_slots,null) is not null or array_length(chosen,1)<>array_length(p_slots,1) then raise exception 'Choose one or more distinct promotion cards';end if;
 total=price*array_length(chosen,1);
 select jsonb_object_agg(slot::text,price) into amounts from unnest(chosen) slot;
 select * into existing from promotion_orders where id=p_request;
 if existing.id is not null then
  if existing.user_id<>p_actor or existing.tournament_id<>t.id or existing.slots<>chosen or existing.placement_plan is distinct from p_plan or existing.pricing_version<>5 then raise exception 'Booking request mismatch';end if;
  return existing.id;
 end if;
 if length(trim(coalesce(p_product->>'name','')))<2 or length(p_product->>'name')>80 or length(coalesce(p_product->>'tagline',''))>180 or coalesce(p_product->>'url','') !~ '^https?://' then raise exception 'Invalid promotion details';end if;
 if (select count(*) from promotion_orders where user_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'Please wait before making another booking';end if;
 insert into promotion_slots(tournament_id,position) select t.id,generate_series(1,6) on conflict do nothing;
 if exists(select 1 from promotion_slots where tournament_id=t.id and position=any(chosen) and promotion_protected(order_id)) then raise exception 'This sponsor card is protected until its purchased period ends';end if;
 if exists(select 1 from promotion_slots s left join promotion_orders o on o.id=s.order_id left join promotion_orders pending on pending.id=s.pending_order_id
  where s.tournament_id=t.id and s.position=any(chosen) and (o.status='pending' and o.reserved_until>clock_timestamp() or pending.status='pending' and pending.reserved_until>clock_timestamp())) then raise exception 'Another checkout is reserving one of these cards. Try again after it finishes or expires';end if;
 insert into promotion_orders(id,user_id,tournament_id,slots,amount,slot_amounts,placement_plan,name,url,tagline,logo_url,reserved_until)
  values(p_request,p_actor,t.id,chosen,total,amounts,p_plan,trim(p_product->>'name'),p_product->>'url',coalesce(p_product->>'tagline',''),p_product->>'logo_url',least(clock_timestamp()+interval '60 minutes',deadline));
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
 if o.status in('pending','expired') and t.status in('registration','locked','voting','spotlight','completed') and clock_timestamp()<promotion_order_ends(o.id)
  and (o.pricing_version<5 or o.placement_plan='tournament' or not promotion_round_finished(t.id,case o.placement_plan when 'quarterfinal' then 1 else 2 end))
  and (o.checkout_id is null or o.checkout_id=p_checkout) and not exists(select 1 from promotion_payments where order_id=o.id and status='paid')
  and (select count(*) from promotion_slots where tournament_id=t.id and position=any(o.slots) and (pending_order_id=o.id or order_id=o.id and pending_order_id is null))=array_length(o.slots,1)
  and not exists(select 1 from promotion_slots s where s.tournament_id=t.id and s.position=any(o.slots) and s.order_id is distinct from o.id and promotion_protected(s.order_id)) then decision='paid';end if;
 decision=coalesce((select status from promotion_payment_signals where intent_id=p_intent),decision);
 insert into promotion_payments(order_id,checkout_id,intent_id,amount,currency,status) values(o.id,p_checkout,p_intent,p_amount,p_currency,decision);
 if decision='paid' then
  select array_agg(distinct order_id) into previous_orders from promotion_slots where tournament_id=t.id and position=any(o.slots) and order_id is not null and order_id<>o.id;
  update promotion_slots set order_id=o.id,pending_order_id=null where tournament_id=t.id and position=any(o.slots);
  update promotion_orders set status='paid' where id=o.id;
  update promotion_orders old_order set status='expired' where old_order.id=any(previous_orders) and old_order.status='paid' and not exists(select 1 from promotion_slots s where s.order_id=old_order.id);
 else
  update promotion_slots set pending_order_id=null where pending_order_id=o.id;
  if o.status in('pending','expired') then update promotion_orders set status='expired' where id=o.id;end if;
 end if;
 insert into webhook_events(id,type) values(p_event,p_type);return decision;
end $$;

-- Keep the existing scheduler chain (including voting cleanup), then release expired plans.
alter function public.tick() rename to tick_before_sponsor_plans;
create function public.tick() returns void language plpgsql set search_path=public as $$begin
 perform tick_before_sponsor_plans();
 update promotion_orders set status='expired' where status='pending' and (reserved_until<=now() or promotion_order_ends(id)<=now());
 update promotion_orders set status='expired' where status='paid' and not promotion_protected(id);
 update promotion_slots s set order_id=null where order_id is not null and not promotion_protected(order_id) and not exists(select 1 from promotion_orders o where o.id=s.order_id and o.status='pending' and o.reserved_until>now());
 update promotion_slots s set pending_order_id=null where pending_order_id is not null and not exists(select 1 from promotion_orders o where o.id=s.pending_order_id and o.status='pending' and o.reserved_until>now());
end $$;
revoke execute on function public.promotion_plan_price(text),public.promotion_plan_ends(uuid,text),public.promotion_round_finished(uuid,integer),public.promotion_order_ends(uuid),public.promotion_protected(uuid),public.promotion_plans(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb,jsonb,text),public.tick(),public.tick_before_sponsor_plans() from public,anon,authenticated;
grant execute on function public.promotion_plan_price(text),public.promotion_plan_ends(uuid,text),public.promotion_round_finished(uuid,integer),public.promotion_order_ends(uuid),public.promotion_protected(uuid),public.promotion_plans(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb,jsonb,text),public.tick(),public.tick_before_sponsor_plans() to service_role;
