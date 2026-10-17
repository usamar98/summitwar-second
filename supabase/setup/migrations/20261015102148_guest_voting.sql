-- Guest ballots share the existing score, moderation and freeze rules; no auth user is created.
alter table public.votes alter column user_id drop not null;
alter table public.votes add column voter_hash text check(voter_hash ~ '^[0-9a-f]{64}$');
alter table public.votes add column network_hash text check(network_hash ~ '^[0-9a-f]{64}$');
alter table public.votes add column x_handle text check(x_handle ~ '^[a-z0-9_]{1,15}$');
alter table public.votes add constraint vote_identity_required check(user_id is not null or voter_hash is not null);
create unique index one_browser_vote on public.votes(match_id,voter_hash) where voter_hash is not null;
create index guest_vote_network on public.votes(network_hash,match_id,created_at) where network_hash is not null;
create table public.voting_links(
 match_id uuid not null references public.matches(id),voter_hash text not null check(voter_hash ~ '^[0-9a-f]{64}$'),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),actor_id uuid references auth.users(id),
 expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now(),primary key(match_id,voter_hash));
create table public.guest_vote_limits(network_hash text primary key check(network_hash ~ '^[0-9a-f]{64}$'),window_start timestamptz not null,hits integer not null);
create index voting_link_expiry on public.voting_links(expires_at);
create index guest_vote_limit_expiry on public.guest_vote_limits(window_start);
create index guest_voter_recent on public.votes(voter_hash,created_at) where voter_hash is not null;
alter table public.voting_links enable row level security;
alter table public.guest_vote_limits enable row level security;
revoke all on public.voting_links,public.guest_vote_limits from public,anon,authenticated;
grant all on public.voting_links,public.guest_vote_limits to service_role;

create function public.issue_voting_link(p_match uuid,p_voter text,p_token text,p_network text,p_actor uuid default null) returns timestamptz language plpgsql set search_path=public as $$
declare m matches; deadline timestamptz; bucket timestamptz; attempts integer;
begin
 if p_voter is null or p_voter !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_network is null or p_network !~ '^[0-9a-f]{64}$' then raise exception 'Invalid voting context';end if;
 select tournament_id into m.tournament_id from matches where id=p_match;
 perform 1 from tournaments where id=m.tournament_id for update;
 select * into m from matches where id=p_match for update;
 if m.id is null or clock_timestamp()<m.starts_at or clock_timestamp()>=m.ends_at or m.winner_id is not null or not exists(select 1 from tournaments where id=m.tournament_id and status='voting') then raise exception 'Match is not open';end if;
 if p_actor is not null and not exists(select 1 from auth.users where id=p_actor) then raise exception 'Invalid account';end if;
 if exists(select 1 from entries where id in(m.entry_a,m.entry_b) and user_id=p_actor) then raise exception 'Founders cannot vote in their own match';end if;
 if exists(select 1 from votes where match_id=p_match and (voter_hash=p_voter or user_id=p_actor)) then raise exception 'Your final vote is already recorded';end if;
 bucket=to_timestamp(floor(extract(epoch from clock_timestamp())/600)*600);
 insert into guest_vote_limits(network_hash,window_start,hits) values(p_network,bucket,1) on conflict(network_hash) do update set hits=case when guest_vote_limits.window_start=excluded.window_start then guest_vote_limits.hits+1 else 1 end,window_start=excluded.window_start returning hits into attempts;
 if attempts>20 then raise exception 'Too many voting link requests. Please wait ten minutes';end if;
 deadline=least(clock_timestamp()+interval '10 minutes',m.ends_at);
 insert into voting_links(match_id,voter_hash,token_hash,actor_id,expires_at) values(p_match,p_voter,p_token,p_actor,deadline)
 on conflict(match_id,voter_hash) do update set token_hash=excluded.token_hash,actor_id=excluded.actor_id,expires_at=excluded.expires_at,used_at=null,created_at=now();
 return deadline;
end $$;

create function public.cast_guest_vote(p_match uuid,p_entry uuid,p_voter text,p_token text,p_network text,p_handle text default null,p_actor uuid default null) returns void language plpgsql set search_path=public as $$
declare m matches; link voting_links;
begin
 if p_voter is null or p_voter !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_network is null or p_network !~ '^[0-9a-f]{64}$' then raise exception 'Invalid voting context';end if;
 if p_handle is not null and p_handle !~ '^[a-z0-9_]{1,15}$' then raise exception 'Enter a valid X handle';end if;
 select tournament_id into m.tournament_id from matches where id=p_match;
 perform 1 from tournaments where id=m.tournament_id for update;
 select * into m from matches where id=p_match for update;
 if m.id is null or clock_timestamp()<m.starts_at or clock_timestamp()>=m.ends_at or m.winner_id is not null or not exists(select 1 from tournaments where id=m.tournament_id and status='voting') then raise exception 'Match is not open';end if;
 if p_entry is null or p_entry not in(m.entry_a,m.entry_b) then raise exception 'Invalid contender';end if;
 select * into link from voting_links where match_id=p_match and voter_hash=p_voter and token_hash=p_token for update;
 if link.match_id is null or link.expires_at<=clock_timestamp() or link.used_at is not null then raise exception 'Voting link is invalid, expired or already used';end if;
 if link.actor_id is distinct from p_actor then raise exception 'Your account changed. Create a new voting link';end if;
 if exists(select 1 from entries where id in(m.entry_a,m.entry_b) and user_id=p_actor) then raise exception 'Founders cannot vote in their own match';end if;
 if exists(select 1 from votes where match_id=p_match and (voter_hash=p_voter or user_id=p_actor)) then raise exception 'Your final vote is already recorded';end if;
 if (select count(*) from votes where voter_hash=p_voter and created_at>now()-interval '1 minute')>=6 then raise exception 'Please wait before voting again';end if;
 insert into votes(match_id,entry_id,user_id,voter_hash,network_hash,x_handle) values(p_match,p_entry,p_actor,p_voter,p_network,p_handle);
 update voting_links set used_at=clock_timestamp() where match_id=p_match and voter_hash=p_voter;
 if (select count(distinct voter_hash) from votes where match_id=p_match and network_hash=p_network and created_at>now()-interval '10 minutes')>=4 then
  update votes set suspicious=true where match_id=p_match and network_hash=p_network and created_at>now()-interval '10 minutes';
 end if;
end $$;
revoke execute on function public.issue_voting_link(uuid,text,text,text,uuid),public.cast_guest_vote(uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.issue_voting_link(uuid,text,text,text,uuid),public.cast_guest_vote(uuid,uuid,text,text,text,text,uuid) to service_role;
-- Used vote records remain; obsolete token hashes and network counters can be discarded.
alter function public.tick() rename to tick_before_guest_voting;
create function public.tick() returns void language plpgsql set search_path=public as $$begin
 perform tick_before_guest_voting();
 delete from voting_links where expires_at<now()-interval '1 day';
 delete from guest_vote_limits where window_start<now()-interval '1 day';
 update votes set network_hash=null where network_hash is not null and created_at<now()-interval '7 days';
end $$;
revoke execute on function public.tick(),public.tick_before_guest_voting() from public,anon,authenticated;
grant execute on function public.tick(),public.tick_before_guest_voting() to service_role;
