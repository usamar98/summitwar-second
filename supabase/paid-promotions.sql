create function public.promotion_ends(p_tournament uuid) returns timestamptz language sql stable set search_path=public as $$
 select coalesce((select spotlight_ends from champions where tournament_id=t.id),t.starts_at+make_interval(hours=>case when t.extended_cycle then 72 when t.daily_cycle then 24 else 168 end)) from tournaments t where id=p_tournament;
$$;
create function public.promotion_price(p_slot integer) returns integer language sql immutable set search_path=public as $$select case when p_slot in(1,4) then 10000 when p_slot in(2,5) then 70000 when p_slot in(3,6) then 5000 else null end$$;
create table public.promotion_orders(id uuid primary key,user_id uuid not null references auth.users(id),tournament_id uuid not null references tournaments(id),slots integer[] not null,amount integer not null check(amount>0),name text not null,url text not null,tagline text not null,logo_url text,status text not null default 'pending' check(status in('pending','paid','expired','removed')),reserved_until timestamptz not null,checkout_id text unique,checkout_url text,created_at timestamptz not null default now());
create table public.promotion_slots(tournament_id uuid not null references tournaments(id),position integer not null check(position between 1 and 6),order_id uuid references promotion_orders(id),primary key(tournament_id,position));
create table public.promotion_payments(id uuid primary key default gen_random_uuid(),order_id uuid not null references promotion_orders(id),checkout_id text not null,intent_id text not null unique,amount integer not null,currency text not null check(currency='usd'),status text not null check(status in('paid','refund_pending','refunded','disputed')),refund_id text,refund_attempts integer not null default 0,last_refund_error text,created_at timestamptz not null default now());
create table public.promotion_payment_signals(intent_id text primary key,order_id uuid not null references promotion_orders(id),status text not null check(status in('refunded','disputed')));
create index promotion_owner on promotion_orders(user_id,created_at);
create index promotion_refunds on promotion_payments(status) where status='refund_pending';
do $$declare name text;begin foreach name in array array['promotion_orders','promotion_slots','promotion_payments','promotion_payment_signals'] loop execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant all on public.%I to service_role',name);end loop;end$$;

create function public.promotion_inventory(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('position',position,'price',promotion_price(position),'state',case when not live then 'closed' when occupied and status='paid' then 'paid' when occupied then 'reserved' else 'available' end,'name',case when occupied and status='paid' and live then name end,'url',case when occupied and status='paid' and live then url end,'tagline',case when occupied and status='paid' and live then tagline end,'logo_url',case when occupied and status='paid' and live then logo_url end) order by position),'[]'::jsonb) from (
 select g.position,o.status,o.name,o.url,o.tagline,o.logo_url,(t.edition is not null and t.status in('registration','locked','voting','spotlight') and promotion_ends(t.id)>now()) live,
 (o.status='pending' and o.reserved_until>now() or o.status='paid' and exists(select 1 from promotion_payments p where p.order_id=o.id and p.status='paid')) occupied
 from tournaments t cross join generate_series(1,6) g(position) left join promotion_slots s on s.tournament_id=t.id and s.position=g.position left join promotion_orders o on o.id=s.order_id where t.id=p_tournament) x;
$$;

create function public.reserve_promotion(p_actor uuid,p_tournament uuid,p_slots integer[],p_request uuid,p_product jsonb) returns uuid language plpgsql set search_path=public as $$
declare t tournaments; chosen integer[]; total integer; deadline timestamptz; existing promotion_orders;begin
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
 if exists(select 1 from promotion_slots s join promotion_orders o on o.id=s.order_id where s.tournament_id=t.id and s.position=any(chosen) and (o.status='pending' and o.reserved_until>clock_timestamp() or o.status='paid' and exists(select 1 from promotion_payments pay where pay.order_id=o.id and pay.status='paid'))) then raise exception 'One of these promotion cards is already taken';end if;
 insert into promotion_orders(id,user_id,tournament_id,slots,amount,name,url,tagline,logo_url,reserved_until) values(p_request,p_actor,t.id,chosen,total,trim(p_product->>'name'),p_product->>'url',coalesce(p_product->>'tagline',''),p_product->>'logo_url',least(clock_timestamp()+interval '60 minutes',deadline));
 update promotion_slots set order_id=p_request where tournament_id=t.id and position=any(chosen);
 return p_request;
end $$;

create function public.fulfill_promotion(p_event text,p_type text,p_order uuid,p_checkout text,p_intent text,p_amount integer,p_currency text) returns text language plpgsql set search_path=public as $$
declare o promotion_orders; t tournaments; decision text;begin
 select tournament_id into o.tournament_id from promotion_orders where id=p_order;select * into t from tournaments where id=o.tournament_id for update;select * into o from promotion_orders where id=p_order for update;
 if o.id is null or p_amount<>o.amount or p_currency<>'usd' then raise exception 'Promotion amount or currency mismatch';end if;
 if exists(select 1 from webhook_events where id=p_event) then return 'duplicate';end if;
 if exists(select 1 from promotion_payments where intent_id=p_intent) then insert into webhook_events(id,type) values(p_event,p_type);return 'duplicate';end if;
 decision='refund_pending';
 if o.status in('pending','expired') and t.status in('registration','locked','voting','spotlight') and clock_timestamp()<promotion_ends(t.id) and (o.checkout_id is null or o.checkout_id=p_checkout) and not exists(select 1 from promotion_payments where order_id=o.id and status='paid') and (select count(*) from promotion_slots where tournament_id=t.id and position=any(o.slots) and order_id=o.id)=array_length(o.slots,1) then decision='paid';end if;
 select coalesce((select status from promotion_payment_signals where intent_id=p_intent),decision) into decision;
 insert into promotion_payments(order_id,checkout_id,intent_id,amount,currency,status) values(o.id,p_checkout,p_intent,p_amount,p_currency,decision);
 if decision='paid' then update promotion_orders set status='paid' where id=o.id;elsif o.status in('pending','expired') then update promotion_orders set status='expired' where id=o.id;end if;
 insert into webhook_events(id,type) values(p_event,p_type);return decision;
end$$;
create function public.promotion_signal(p_event text,p_type text,p_order uuid,p_intent text,p_status text) returns void language plpgsql set search_path=public as $$begin
 if p_status not in('refunded','disputed') then raise exception 'Invalid payment status';end if;
 perform 1 from tournaments where id=(select tournament_id from promotion_orders where id=p_order) for update;
 if exists(select 1 from webhook_events where id=p_event) then return;end if;
 insert into promotion_payment_signals(intent_id,order_id,status) values(p_intent,p_order,p_status) on conflict(intent_id) do update set status=case when promotion_payment_signals.status='refunded' then 'refunded' else excluded.status end;
 update promotion_payments set status=case when status='refunded' then 'refunded' else p_status end where intent_id=p_intent and order_id=p_order;
 insert into webhook_events(id,type) values(p_event,p_type);
end$$;
create function public.remove_promotion(p_actor uuid,p_order uuid,p_reason text) returns void language plpgsql set search_path=public as $$begin
 if not exists(select 1 from admin_roles where user_id=p_actor) or length(trim(coalesce(p_reason,'')))<3 then raise exception 'Admin access and a removal reason are required';end if;
 perform 1 from tournaments where id=(select tournament_id from promotion_orders where id=p_order) for update;
 update promotion_orders set status='removed' where id=p_order;
 update promotion_payments set status='refund_pending' where order_id=p_order and status='paid';
 insert into audit_logs(actor,action,target,detail) values(p_actor,'remove_promotion',p_order,jsonb_build_object('reason',p_reason));
end$$;
alter function public.tick() rename to tick_before_promotions;
create function public.tick() returns void language plpgsql set search_path=public as $$begin
 perform tick_before_promotions();
 update promotion_orders set status='expired' where status='pending' and reserved_until<=now();
 update promotion_payments set status='refund_pending' where status='paid' and order_id in(select o.id from promotion_orders o join tournaments t on t.id=o.tournament_id where t.status='cancelled');
 update promotion_orders set status='expired' where status='paid' and promotion_ends(tournament_id)<=now();
end$$;
alter function public.live_revision(uuid) rename to live_revision_before_promotions;
create function public.live_revision(p_tournament uuid) returns text language sql stable set search_path=public as $$
 select md5(live_revision_before_promotions(p_tournament)||coalesce((select string_agg(id::text||status,',' order by id) from promotion_orders where tournament_id=p_tournament),'')||coalesce((select string_agg(p.id::text||p.status,',' order by p.id) from promotion_payments p join promotion_orders o on o.id=p.order_id where o.tournament_id=p_tournament),''));
$$;
revoke execute on function public.live_revision(uuid),public.live_revision_before_promotions(uuid) from public,anon,authenticated;
grant execute on function public.live_revision(uuid),public.live_revision_before_promotions(uuid) to service_role;
revoke execute on function public.promotion_ends(uuid),public.promotion_price(integer),public.promotion_inventory(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb),public.fulfill_promotion(text,text,uuid,text,text,integer,text),public.promotion_signal(text,text,uuid,text,text),public.remove_promotion(uuid,uuid,text),public.tick(),public.tick_before_promotions() from public,anon,authenticated;
grant execute on function public.promotion_ends(uuid),public.promotion_price(integer),public.promotion_inventory(uuid),public.reserve_promotion(uuid,uuid,integer[],uuid,jsonb),public.fulfill_promotion(text,text,uuid,text,text,integer,text),public.promotion_signal(text,text,uuid,text,text),public.remove_promotion(uuid,uuid,text),public.tick(),public.tick_before_promotions() to service_role;
