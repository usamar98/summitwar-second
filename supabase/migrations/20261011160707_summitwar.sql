-- SummitWar: privileged commands are service_role only. Public clients have read-only RLS.
create extension if not exists pgcrypto;
create table public.admin_roles(user_id uuid primary key references auth.users(id));
create table public.profiles(id uuid primary key references auth.users(id), display_name text not null default 'Founder', x_handle text);
create table public.products(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id), name text not null, slug text not null unique, url text not null, normalized_url text generated always as (regexp_replace(regexp_replace(regexp_replace(lower(url),'^https?://(www[.])?','','i'),'[?#].*$','','g'),'/+$','','g')) stored unique, logo_url text not null, category text not null, tagline text not null, audience text not null, problem text not null, pricing text not null, free_trial boolean not null default false, screenshot_url text not null, demo_url text not null, founder text not null, x_handle text, question text not null, offer_url text, published boolean not null default false, created_at timestamptz not null default now());
create table public.edition_counter(id boolean primary key default true check(id), last_edition integer not null default 0);
insert into public.edition_counter values(true,0);
create table public.tournaments(id uuid primary key default gen_random_uuid(), edition integer unique, theme text not null, status text not null default 'draft' check(status in ('draft','registration','locked','voting','spotlight','completed','cancelled')), fee_amount_cents integer, currency text not null default 'usd' check(currency='usd'), registration_ends timestamptz not null, starts_at timestamptz not null, archived boolean not null default false, created_at timestamptz not null default now(), check(registration_ends<starts_at), check((edition is null and fee_amount_cents is null) or (edition=1 and fee_amount_cents=0) or (edition>1 and fee_amount_cents=500)));
create table public.entries(id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id), product_id uuid not null references public.products(id), user_id uuid not null references auth.users(id), status text not null default 'pending' check(status in ('pending','approved','waitlisted','rejected','confirmed','removed')), priority integer, snapshot jsonb, created_at timestamptz not null default now(), unique(tournament_id,user_id), unique(tournament_id,product_id), unique(tournament_id,priority));
create table public.reservations(id uuid primary key default gen_random_uuid(), entry_id uuid not null references public.entries(id), tournament_id uuid not null references public.tournaments(id), expires_at timestamptz not null, checkout_id text unique, checkout_url text, released boolean not null default false, created_at timestamptz not null default now());
create unique index one_reservation on public.reservations(entry_id) where not released;
create table public.matches(id uuid primary key default gen_random_uuid(), tournament_id uuid not null references public.tournaments(id), round integer not null check(round between 1 and 3), position integer not null, entry_a uuid not null references public.entries(id), entry_b uuid not null references public.entries(id), starts_at timestamptz not null, ends_at timestamptz not null, winner_id uuid references public.entries(id), score_a integer, score_b integer, unique(tournament_id,round,position), check(entry_a<>entry_b), check(starts_at<ends_at));
create table public.votes(id uuid primary key default gen_random_uuid(),match_id uuid not null references public.matches(id),entry_id uuid not null references public.entries(id),user_id uuid not null references auth.users(id),valid boolean not null default true,suspicious boolean not null default false,invalidation_reason text,created_at timestamptz not null default now(),unique(match_id,user_id));
create table public.feedback(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),user_id uuid not null references auth.users(id),body text not null check(length(body) between 3 and 1500),hidden boolean not null default false,created_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(),feedback_id uuid not null references public.feedback(id),user_id uuid not null references auth.users(id),reason text not null,status text not null default 'pending',created_at timestamptz not null default now(),unique(feedback_id,user_id));
create table public.payments(id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.entries(id),checkout_id text not null unique,intent_id text not null unique,amount integer not null,currency text not null,status text not null check(status in ('paid','refund_pending','refunded','disputed')),refund_id text,refund_attempts integer not null default 0,last_refund_error text,created_at timestamptz not null default now());
create table public.webhook_events(id text primary key,type text not null,processed_at timestamptz not null default now());
create table public.payment_signals(intent_id text primary key,entry_id uuid not null references public.entries(id),status text not null check(status in ('refunded','disputed')),updated_at timestamptz not null default now());
create table public.champions(tournament_id uuid primary key references public.tournaments(id),entry_id uuid not null references public.entries(id),spotlight_starts timestamptz not null,spotlight_ends timestamptz not null,interview jsonb,check(spotlight_ends=spotlight_starts+interval '120 hours'));
create table public.promotion_tasks(id uuid primary key default gen_random_uuid(),tournament_id uuid not null references public.tournaments(id),entry_id uuid references public.entries(id),kind text not null,status text not null default 'pending' check(status in ('pending','completed')),draft text,completed_at timestamptz);
create table public.analytics_events(id uuid primary key default gen_random_uuid(),product_id uuid not null references public.products(id),kind text not null check(kind in ('view','outbound')),visitor_hash text not null,bucket date not null default current_date,created_at timestamptz not null default now(),unique(product_id,kind,visitor_hash,bucket));
create table public.audit_logs(id bigint generated always as identity primary key,actor uuid references auth.users(id),action text not null,target uuid,detail jsonb,created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),message text not null,created_at timestamptz not null default now());
create index match_due on public.matches(ends_at) where winner_id is null;
create index vote_score on public.votes(match_id,entry_id) where valid;
create index reservation_capacity on public.reservations(tournament_id,expires_at) where not released;
create index entry_owner on public.entries(user_id);
create index feedback_product on public.feedback(product_id,created_at);
create index analytics_product on public.analytics_events(product_id,kind);

create function public.protect_edition() returns trigger language plpgsql set search_path=public as $$
begin
 if TG_OP='DELETE' then if old.edition is not null then raise exception 'Archive published editions'; end if; return old; end if;
 if TG_OP='UPDATE' and old.edition is not null then
  if new.edition is distinct from old.edition or new.fee_amount_cents is distinct from old.fee_amount_cents or new.currency is distinct from old.currency then raise exception 'Published pricing is immutable'; end if;
  if old.status in ('locked','voting','spotlight','completed') and (new.starts_at<>old.starts_at or new.registration_ends<>old.registration_ends) then raise exception 'Locked schedule is immutable'; end if;
 end if;
 return new;
end $$;
create trigger immutable_edition before update or delete on public.tournaments for each row execute function public.protect_edition();
create function public.protect_bracket() returns trigger language plpgsql set search_path=public as $$
begin
 if old.priority is not null and (new.priority is distinct from old.priority or new.snapshot is distinct from old.snapshot or new.product_id<>old.product_id or new.tournament_id<>old.tournament_id or new.user_id<>old.user_id) then raise exception 'Bracket entries are immutable'; end if;
 return new;
end $$;
create trigger immutable_entry before update on public.entries for each row execute function public.protect_bracket();
create function public.protect_match() returns trigger language plpgsql set search_path=public as $$
begin
 if old.winner_id is not null and (new.winner_id is distinct from old.winner_id or new.score_a is distinct from old.score_a or new.score_b is distinct from old.score_b) then raise exception 'Results are frozen'; end if;
 if new.entry_a<>old.entry_a or new.entry_b<>old.entry_b or new.round<>old.round or new.position<>old.position or new.tournament_id<>old.tournament_id then raise exception 'Pairings are immutable'; end if;
 if (new.starts_at<>old.starts_at or new.ends_at<>old.ends_at) and exists(select 1 from tournaments where id=old.tournament_id and status not in ('cancelled','registration')) then raise exception 'Match schedule is locked'; end if;
 return new;
end $$;
create trigger immutable_match before update on public.matches for each row execute function public.protect_match();

create function public.seat_availability(p_tournament uuid) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('confirmed',c,'reserved',r,'available',greatest(0,8-c-r)) from
 (select count(*) c from entries where tournament_id=p_tournament and status='confirmed') a,
 (select count(*) r from reservations where tournament_id=p_tournament and not released and expires_at>now()) b;
$$;

create function public.admin_command(p_actor uuid,p_action text,p_target uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql set search_path=public as $$
declare t tournaments; e entries; n integer; rid uuid;
begin
 if not exists(select 1 from admin_roles where user_id=p_actor) then raise exception 'Admin access required'; end if;
 if p_action='create' then
  insert into tournaments(theme,registration_ends,starts_at) values(p_data->>'theme',(p_data->>'registration_ends')::timestamptz,(p_data->>'starts_at')::timestamptz) returning id into rid;
 elsif p_action='publish' then
  select * into t from tournaments where id=p_target for update;
  if t.id is null or t.status<>'draft' then raise exception 'Only drafts may be published'; end if;
  update edition_counter set last_edition=last_edition+1 where id returning last_edition into n;
  update tournaments set edition=n,fee_amount_cents=case when n=1 then 0 else 500 end,status='registration' where id=p_target;
 elsif p_action in ('approve','reject','waitlist','remove') then
  select tournament_id into rid from entries where id=p_target;
  select * into t from tournaments where id=rid for update;
  select * into e from entries where id=p_target for update;
  if t.status<>'registration' or now()>=t.registration_ends then raise exception 'Registration is closed'; end if;
  if e.id is null then raise exception 'Entry not found'; end if;
  if p_action='approve' then
   if e.status not in ('pending','waitlisted','approved') then raise exception 'Entry cannot be approved'; end if;
   update reservations set released=true where entry_id=e.id and expires_at<=now();
   if e.status='approved' and exists(select 1 from reservations where entry_id=e.id and not released and expires_at>now()) then return jsonb_build_object('id',e.id); end if;
   if (seat_availability(t.id)->>'available')::int<1 then update entries set status='waitlisted' where id=e.id;
   elsif t.fee_amount_cents=0 then update entries set status='confirmed' where id=e.id; update products set published=true where id=e.product_id;
   else
    if t.registration_ends<now()+interval '31 minutes' then raise exception 'At least 31 minutes needed for payment'; end if;
    update entries set status='approved' where id=e.id;
    insert into reservations(entry_id,tournament_id,expires_at) values(e.id,t.id,least(now()+interval '60 minutes',t.registration_ends));
   end if;
  else
   if e.status='confirmed' and p_action<>'remove' then raise exception 'Use remove for an accepted entry'; end if;
   update entries set status=case p_action when 'reject' then 'rejected' when 'remove' then 'removed' else 'waitlisted' end where id=e.id;
   update reservations set released=true where entry_id=e.id;
   update payments set status='refund_pending' where entry_id=e.id and status='paid';
  end if;
 elsif p_action='cancel' then
  select * into t from tournaments where id=p_target for update;
  if t.status not in ('registration','locked') or now()>=t.starts_at then raise exception 'Only cancel before participation'; end if;
  update tournaments set status='cancelled' where id=t.id;
  update reservations set released=true where tournament_id=t.id;
  update payments set status='refund_pending' where status='paid' and entry_id in(select id from entries where tournament_id=t.id);
  insert into notifications(user_id,message) select user_id,'Edition cancelled. Paid entries will be refunded.' from entries where tournament_id=t.id;
 elsif p_action='reschedule' then
  select * into t from tournaments where id=p_target for update;
  if t.status not in ('registration','cancelled') then raise exception 'Cannot reschedule locked bracket'; end if;
  if t.status='cancelled' and exists(select 1 from payments where entry_id in(select id from entries where tournament_id=t.id) and status in ('paid','refund_pending')) then raise exception 'Finish refunds before rescheduling'; end if;
  if t.status='cancelled' then update entries set status='pending' where tournament_id=t.id; end if;
  update tournaments set status='registration',registration_ends=(p_data->>'registration_ends')::timestamptz,starts_at=(p_data->>'starts_at')::timestamptz where id=t.id;
  update matches set starts_at=(p_data->>'starts_at')::timestamptz+case round when 1 then interval '0 hours' when 2 then interval '24 hours' else interval '40 hours' end,ends_at=(p_data->>'starts_at')::timestamptz+case round when 1 then interval '24 hours' when 2 then interval '40 hours' else interval '48 hours' end where tournament_id=t.id;
  insert into notifications(user_id,message) select user_id,'Your edition was rescheduled. Check the updated schedule.' from entries where tournament_id=t.id;
 elsif p_action='invalidate' then
  if length(coalesce(p_data->>'reason',''))<3 then raise exception 'Reason required'; end if;
  select tournament_id into rid from matches where id=(select match_id from votes where id=p_target);
  perform 1 from tournaments where id=rid for update;
  if not exists(select 1 from matches m join votes v on v.match_id=m.id where v.id=p_target and m.winner_id is null and now()<m.ends_at) then raise exception 'Results already frozen'; end if;
  update votes set valid=false,invalidation_reason=p_data->>'reason' where id=p_target;
 elsif p_action='fulfill' then update promotion_tasks set status='completed',completed_at=now(),draft=coalesce(p_data->>'draft',draft) where id=p_target;
 elsif p_action='interview' then update champions set interview=p_data where tournament_id=p_target;
 elsif p_action='moderate' then update feedback set hidden=true where id=p_target; update reports set status='resolved' where feedback_id=p_target;
 elsif p_action='archive' then update tournaments set archived=true where id=p_target and status in ('completed','cancelled');
 else raise exception 'Unknown admin action'; end if;
 insert into audit_logs(actor,action,target,detail) values(p_actor,p_action,coalesce(p_target,rid),p_data);
 return jsonb_build_object('id',coalesce(rid,p_target));
end $$;

create function public.apply_product(p_actor uuid,p_tournament uuid,p_product jsonb) returns uuid language plpgsql set search_path=public as $$
declare pid uuid; eid uuid; t tournaments;
begin
 select * into t from tournaments where id=p_tournament for update;
 if t.status<>'registration' or now()>=t.registration_ends then raise exception 'Registration is closed'; end if;
 if exists(select 1 from matches where tournament_id=t.id) then raise exception 'Rescheduled locked edition retains its original entrants'; end if;
 insert into products(owner_id,name,slug,url,logo_url,category,tagline,audience,problem,pricing,free_trial,screenshot_url,demo_url,founder,x_handle,question,offer_url)
 values(p_actor,p_product->>'name',p_product->>'slug',p_product->>'url',p_product->>'logo_url',p_product->>'category',p_product->>'tagline',p_product->>'audience',p_product->>'problem',p_product->>'pricing',(p_product->>'free_trial')::boolean,p_product->>'screenshot_url',p_product->>'demo_url',p_product->>'founder',p_product->>'x_handle',p_product->>'question',p_product->>'offer_url') returning id into pid;
 insert into entries(tournament_id,product_id,user_id) values(t.id,pid,p_actor) returning id into eid; return eid;
end $$;
create function public.apply_existing(p_actor uuid,p_tournament uuid,p_product uuid) returns uuid language plpgsql set search_path=public as $$
declare eid uuid; t tournaments;
begin
 select * into t from tournaments where id=p_tournament for update;
 if t.status<>'registration' or now()>=t.registration_ends then raise exception 'Registration is closed'; end if;
 if exists(select 1 from matches where tournament_id=t.id) then raise exception 'Rescheduled locked edition retains its original entrants'; end if;
 if not exists(select 1 from products where id=p_product and owner_id=p_actor) then raise exception 'Product ownership required'; end if;
 insert into entries(tournament_id,product_id,user_id) values(t.id,p_product,p_actor) returning id into eid; return eid;
end $$;

create function public.cast_vote(p_actor uuid,p_match uuid,p_entry uuid) returns void language plpgsql set search_path=public as $$
declare m matches; recent integer;
begin
 select tournament_id into m.tournament_id from matches where id=p_match;
 perform 1 from tournaments where id=m.tournament_id for update;
 select * into m from matches where id=p_match for update;
 if not exists(select 1 from auth.users where id=p_actor and (email_confirmed_at is not null or raw_app_meta_data->>'provider'='github' or raw_app_meta_data->'providers' ? 'github')) then raise exception 'Verified account required'; end if;
 if m.id is null or clock_timestamp()<m.starts_at or clock_timestamp()>=m.ends_at or m.winner_id is not null or not exists(select 1 from tournaments where id=m.tournament_id and status='voting') then raise exception 'Match is not open'; end if;
 if p_entry not in (m.entry_a,m.entry_b) then raise exception 'Invalid contender'; end if;
 if exists(select 1 from entries where id in (m.entry_a,m.entry_b) and user_id=p_actor) then raise exception 'Founders cannot vote in their own match'; end if;
 select count(*) into recent from votes where user_id=p_actor and created_at>now()-interval '1 minute';
 if recent>=10 then raise exception 'Please slow down'; end if;
 insert into votes(match_id,entry_id,user_id,suspicious) values(m.id,p_entry,p_actor,(select created_at>now()-interval '1 hour' from auth.users where id=p_actor));
end $$;

create function public.match_scores(p_match uuid) returns jsonb language sql stable set search_path=public as $$
 select jsonb_build_object('a',coalesce(m.score_a,(select count(*) from votes where match_id=m.id and entry_id=m.entry_a and valid)), 'b',coalesce(m.score_b,(select count(*) from votes where match_id=m.id and entry_id=m.entry_b and valid))) from matches m where id=p_match;
$$;

create function public.fulfill_payment(p_event text,p_type text,p_entry uuid,p_checkout text,p_intent text,p_amount integer,p_currency text,p_reservation uuid) returns text language plpgsql set search_path=public as $$
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
 if e.status='approved' and t.status='registration' and now()<t.registration_ends and now()<t.starts_at and (r.checkout_id is null or r.checkout_id=p_checkout) and not exists(select 1 from payment_signals where intent_id=p_intent) then
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

create function public.record_payment_signal(p_event text,p_type text,p_intent text,p_entry uuid,p_status text) returns void language plpgsql set search_path=public as $$
declare tid uuid;
begin
 select tournament_id into tid from entries where id=p_entry;
 if tid is null then raise exception 'Entry not found'; end if;
 perform 1 from tournaments where id=tid for update;
 if exists(select 1 from webhook_events where id=p_event) then return; end if;
 insert into payment_signals(intent_id,entry_id,status) values(p_intent,p_entry,p_status) on conflict(intent_id) do update set status=excluded.status,updated_at=now();
 update payments set status=p_status where intent_id=p_intent;
 insert into webhook_events(id,type) values(p_event,p_type);
end $$;

create function public.tick() returns void language plpgsql set search_path=public as $$
declare t tournaments; m matches; ids uuid[]; winners uuid[]; a integer; b integer; win uuid; roundno integer; offsethours integer; durationhours integer; i integer;
begin
 for t in select * from tournaments where status in ('registration','locked','voting','spotlight') order by edition for update skip locked loop
  update reservations set released=true where tournament_id=t.id and expires_at<=now();
  if t.status='registration' and now()>=t.registration_ends then
   if (select count(*) from entries where tournament_id=t.id and status='confirmed')<>8 then
    update tournaments set starts_at=greatest(now()+interval '25 hours',starts_at+interval '7 days'),registration_ends=greatest(now()+interval '24 hours',registration_ends+interval '7 days') where id=t.id;
    insert into notifications(user_id,message) select user_id,'Voting was rescheduled because eight confirmed entrants are required.' from entries where tournament_id=t.id;
    continue;
   end if;
   if not exists(select 1 from matches where tournament_id=t.id) then
    select array_agg(id) into ids from (select id from entries where tournament_id=t.id and status='confirmed' order by random()) x;
    for i in 1..8 loop update entries set priority=i,snapshot=(select to_jsonb(p) from products p where p.id=entries.product_id) where id=ids[i]; end loop;
    for i in 1..4 loop insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values(t.id,1,i,ids[i*2-1],ids[i*2],t.starts_at,t.starts_at+interval '24 hours'); end loop;
   end if;
   update tournaments set status='locked' where id=t.id;
   if not exists(select 1 from promotion_tasks where tournament_id=t.id and kind='announcement') then
    insert into promotion_tasks(tournament_id,kind,draft) values(t.id,'announcement','SummitWar edition #'||t.edition||': '||(select string_agg(snapshot->>'name',', ' order by priority) from entries where tournament_id=t.id and status='confirmed')||'. Watch the demos and choose the app you would actually use. Battle: /tournaments/'||t.id);
    insert into promotion_tasks(tournament_id,entry_id,kind,draft) select t.id,id,'battle_card','Download your battle card from your match page.' from entries where tournament_id=t.id;
   end if;
   t.status='locked';
  end if;
  if t.status='locked' and now()>=t.starts_at then update tournaments set status='voting' where id=t.id; t.status='voting'; end if;
  if t.status='voting' then
   for roundno in 1..3 loop
    for m in select * from matches where tournament_id=t.id and round=roundno and ends_at<=now() and winner_id is null order by position for update loop
     select count(*) into a from votes where match_id=m.id and entry_id=m.entry_a and valid;
     select count(*) into b from votes where match_id=m.id and entry_id=m.entry_b and valid;
     if a=b then select id into win from entries where id in(m.entry_a,m.entry_b) order by priority limit 1; else win=case when a>b then m.entry_a else m.entry_b end; end if;
     update matches set winner_id=win,score_a=a,score_b=b where id=m.id;
    end loop;
    if (select count(*) from matches where tournament_id=t.id and round=roundno and winner_id is not null) = (case roundno when 1 then 4 when 2 then 2 else 1 end) then
     select array_agg(winner_id order by position) into winners from matches where tournament_id=t.id and round=roundno;
     if roundno<3 then
      offsethours=case roundno when 1 then 24 else 40 end; durationhours=case roundno when 1 then 16 else 8 end;
      for i in 1..(array_length(winners,1)/2) loop insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values(t.id,roundno+1,i,winners[i*2-1],winners[i*2],t.starts_at+make_interval(hours=>offsethours),t.starts_at+make_interval(hours=>offsethours+durationhours)) on conflict do nothing; end loop;
     else
      insert into champions(tournament_id,entry_id,spotlight_starts,spotlight_ends) values(t.id,winners[1],t.starts_at+interval '48 hours',t.starts_at+interval '168 hours') on conflict do nothing;
      update tournaments set status='spotlight' where id=t.id;
      if not exists(select 1 from promotion_tasks where tournament_id=t.id and kind='champion_post') then
       insert into promotion_tasks(tournament_id,entry_id,kind,draft) values(t.id,winners[1],'champion_post',(select snapshot->>'name' from entries where id=winners[1])||' is the community-choice champion of SummitWar edition #'||t.edition||'. Discover what they built: /champions/'||t.id),(t.id,winners[1],'pin_post','Pin the dedicated X post for five days.'),(t.id,winners[1],'founder_interview','What did you build? Who does it help? Why did you build it?');
      end if;
     end if;
    end if;
   end loop;
  end if;
  if now()>=t.starts_at+interval '168 hours' and exists(select 1 from champions where tournament_id=t.id) then update tournaments set status='completed' where id=t.id; end if;
 end loop;
end $$;

create function public.add_feedback(p_actor uuid,p_product uuid,p_body text) returns void language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtext(p_actor::text));
 if (select count(*) from feedback where user_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'Please slow down'; end if;
 if not exists(select 1 from products where id=p_product and published) then raise exception 'Product unavailable'; end if;
 insert into feedback(product_id,user_id,body) values(p_product,p_actor,p_body);
end $$;

-- No direct mutations for public roles. Only trusted server commands above may mutate.
do $$ declare name text; begin
 foreach name in array array['admin_roles','profiles','products','edition_counter','tournaments','entries','reservations','matches','votes','feedback','reports','payments','webhook_events','payment_signals','champions','analytics_events','promotion_tasks','audit_logs','notifications'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from anon, authenticated',name);
  execute format('grant all on public.%I to service_role',name);
 end loop;
end $$;
grant select on products,tournaments,entries,matches,feedback,champions,promotion_tasks to anon,authenticated;
create policy published_products on products for select to anon,authenticated using(published or owner_id=(select auth.uid()));
create policy published_tournaments on tournaments for select to anon,authenticated using(edition is not null);
create policy confirmed_entries on entries for select to anon,authenticated using(status='confirmed' or user_id=(select auth.uid()));
create policy public_matches on matches for select to anon,authenticated using(true);
create policy visible_feedback on feedback for select to anon,authenticated using(not hidden);
create policy public_champions on champions for select to anon,authenticated using(true);
create policy public_benefits on promotion_tasks for select to anon,authenticated using(true);
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
