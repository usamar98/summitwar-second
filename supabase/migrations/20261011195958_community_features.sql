-- In-app community features. No email delivery or email jobs.
create table public.product_follows(user_id uuid not null references auth.users(id) on delete cascade,product_id uuid not null references products(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,product_id));
create table public.saved_products(user_id uuid not null references auth.users(id) on delete cascade,product_id uuid not null references products(id) on delete cascade,created_at timestamptz not null default now(),primary key(user_id,product_id));
create table public.feedback_replies(id uuid primary key default gen_random_uuid(),feedback_id uuid not null references feedback(id) on delete cascade,user_id uuid not null references auth.users(id),body text not null check(length(body) between 3 and 1500),created_at timestamptz not null default now());
create index replies_thread on feedback_replies(feedback_id,created_at);
alter table notifications add column event_key text;
alter table notifications add column href text;
alter table notifications add column read_at timestamptz;
create unique index notification_event_once on notifications(user_id,event_key) where event_key is not null;
create index notifications_inbox on notifications(user_id,created_at desc);
create table public.vote_risk_events(id bigint generated always as identity primary key,user_id uuid not null references auth.users(id),match_id uuid not null references matches(id),network_hash text not null check(length(network_hash)=64),created_at timestamptz not null default now());
create index vote_risk_network on vote_risk_events(network_hash,match_id,created_at);
create table public.screenshot_jobs(product_id uuid primary key references products(id) on delete cascade,status text not null default 'queued' check(status in ('queued','processing','done','failed')),attempts integer not null default 0,updated_at timestamptz not null default now(),error text);
alter table products add column preview_captured_at timestamptz;
do $$declare name text;begin foreach name in array array['product_follows','saved_products','feedback_replies','vote_risk_events','screenshot_jobs'] loop execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant all on public.%I to service_role',name);end loop;end $$;
grant usage,select on sequence vote_risk_events_id_seq to service_role;
create function public.community_command(p_actor uuid,p_action text,p_product uuid default null,p_target uuid default null,p_body text default null,p_enabled boolean default true) returns void language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from auth.users where id=p_actor and (email_confirmed_at is not null or raw_app_meta_data->>'provider'='github')) then raise exception 'Verified sign-in required';end if;
 perform pg_advisory_xact_lock(hashtext(p_actor::text));
 if p_action in ('follow','save') then
  if not exists(select 1 from products where id=p_product and published) then raise exception 'Published product required';end if;
  if p_enabled and ((select count(*) from product_follows where user_id=p_actor)+(select count(*) from saved_products where user_id=p_actor))>=500 then raise exception 'Your collection is full';end if;
  if p_action='follow' then if p_enabled then insert into product_follows(user_id,product_id) values(p_actor,p_product) on conflict do nothing;else delete from product_follows where user_id=p_actor and product_id=p_product;end if;
  else if p_enabled then insert into saved_products(user_id,product_id) values(p_actor,p_product) on conflict do nothing;else delete from saved_products where user_id=p_actor and product_id=p_product;end if;end if;
 elsif p_action='reply' then
  if not exists(select 1 from feedback f join products p on p.id=f.product_id where f.id=p_target and not f.hidden and p.published and p.owner_id=p_actor) then raise exception 'Only the founder can reply to this feedback';end if;
  if (select count(*) from feedback_replies where user_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'Please wait before replying again';end if;
  insert into feedback_replies(feedback_id,user_id,body) values(p_target,p_actor,trim(p_body));
  insert into notifications(user_id,message,href) select f.user_id,'The founder replied to your feedback on '||p.name,'/products/'||p.slug from feedback f join products p on p.id=f.product_id where f.id=p_target and f.user_id<>p_actor;
 elsif p_action='read' then update notifications set read_at=now() where user_id=p_actor and (p_target is null or id=p_target) and read_at is null;
 else raise exception 'Unknown community action';end if;
end $$;
create function public.send_follow_reminders() returns void language plpgsql set search_path=public as $$
begin
 insert into notifications(user_id,message,event_key,href)
 select f.user_id,p.name||case when now()<m.ends_at-interval '30 minutes' then ' is competing. Round '||m.round||' is open.' else ' has 30 minutes left in this round. Make your final choice.' end,
 m.id::text||case when now()<m.ends_at-interval '30 minutes' then ':open' else ':closing' end,'/matches/'||m.id
 from product_follows f join products p on p.id=f.product_id join entries e on e.product_id=p.id join matches m on e.id in(m.entry_a,m.entry_b) join tournaments t on t.id=m.tournament_id
 where t.status='voting' and m.starts_at<=now() and m.ends_at>now() and m.winner_id is null
 and not exists(select 1 from entries own where own.user_id=f.user_id and own.id in(m.entry_a,m.entry_b))
 and not exists(select 1 from votes where user_id=f.user_id and match_id=m.id)
 on conflict(user_id,event_key) where event_key is not null do nothing;
end $$;
create function public.cast_protected_vote(p_actor uuid,p_match uuid,p_entry uuid,p_network text) returns void language plpgsql set search_path=public as $$
begin
 if p_network is null or p_network !~ '^[0-9a-f]{64}$' then raise exception 'Invalid vote context';end if;
 perform pg_advisory_xact_lock(hashtext(p_network||p_match::text));
 perform cast_vote(p_actor,p_match,p_entry);
 insert into vote_risk_events(user_id,match_id,network_hash) values(p_actor,p_match,p_network);
 if (select count(distinct user_id) from vote_risk_events where network_hash=p_network and match_id=p_match and created_at>now()-interval '10 minutes')>=4 then
  update votes set suspicious=true where match_id=p_match and user_id in(select user_id from vote_risk_events where network_hash=p_network and match_id=p_match and created_at>now()-interval '10 minutes');
 end if;
 delete from vote_risk_events where created_at<now()-interval '7 days';
end $$;
create function public.live_revision(p_tournament uuid) returns text language sql stable set search_path=public as $$
 select md5(coalesce((select status from tournaments where id=p_tournament),'')||coalesce((select string_agg(id::text||coalesce(winner_id::text,''),',' order by id) from matches where tournament_id=p_tournament),'')||coalesce((select count(*)::text||count(*) filter(where valid)::text from votes v join matches m on m.id=v.match_id where m.tournament_id=p_tournament),'')||coalesce((select string_agg(e.id::text||e.status||e.review_status||coalesce(p.screenshot_url,''),',' order by e.id) from entries e join products p on p.id=e.product_id where e.tournament_id=p_tournament),''));
$$;
create function public.queue_screenshot() returns trigger language plpgsql set search_path=public as $$begin insert into screenshot_jobs(product_id) values(new.id) on conflict do nothing;return new;end $$;
create trigger queue_product_preview after insert on products for each row execute function queue_screenshot();
insert into screenshot_jobs(product_id) select id from products where screenshot_url is null on conflict do nothing;
create function public.claim_screenshot() returns jsonb language plpgsql set search_path=public as $$
declare job screenshot_jobs;begin
 select * into job from screenshot_jobs where (status='queued' or status='processing' and updated_at<now()-interval '3 minutes') and attempts<3 order by updated_at for update skip locked limit 1;
 if job.product_id is null then return null;end if;
 update screenshot_jobs set status='processing',attempts=attempts+1,updated_at=now() where product_id=job.product_id;
 return (select jsonb_build_object('id',id,'url',url) from products where id=job.product_id);
end $$;
alter function public.tick() rename to tick_before_community;
create function public.tick() returns void language plpgsql set search_path=public as $$begin perform tick_before_community();perform send_follow_reminders();end $$;
revoke execute on function public.community_command(uuid,text,uuid,uuid,text,boolean),public.send_follow_reminders(),public.cast_protected_vote(uuid,uuid,uuid,text),public.live_revision(uuid),public.queue_screenshot(),public.claim_screenshot(),public.tick(),public.tick_before_community() from public,anon,authenticated;
grant execute on function public.community_command(uuid,text,uuid,uuid,text,boolean),public.send_follow_reminders(),public.cast_protected_vote(uuid,uuid,uuid,text),public.live_revision(uuid),public.queue_screenshot(),public.claim_screenshot(),public.tick(),public.tick_before_community() to service_role;
