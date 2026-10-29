-- Only the server may inspect these identity keys; email and identity_data stay private.
grant usage on schema auth to service_role;
grant select(id) on auth.users to service_role;
grant select(user_id,provider,provider_id) on auth.identities to service_role;

alter table public.votes add column github_identity text check(length(github_identity) between 1 and 255);
alter table public.voting_links add column github_identity text check(length(github_identity) between 1 and 255);
alter table public.voting_links add column network_hash text check(network_hash ~ '^[0-9a-f]{64}$');
update public.votes v set github_identity=(select min(i.provider_id) from auth.identities i where i.user_id=v.user_id and i.provider='github') where v.user_id is not null;
create unique index one_github_vote on public.votes(match_id,github_identity) where github_identity is not null;

create table public.vote_network_claims(
 match_id uuid not null references public.matches(id),
 network_hash text not null check(network_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default now(),primary key(match_id,network_hash)
);
insert into public.vote_network_claims(match_id,network_hash)
 select distinct match_id,network_hash from public.votes where network_hash is not null on conflict do nothing;
alter table public.vote_network_claims enable row level security;
revoke all on public.vote_network_claims from public,anon,authenticated;
grant all on public.vote_network_claims to service_role;

alter table public.guest_vote_limits add column purpose text not null default 'issued' check(purpose in('issued','issue','cast'));
alter table public.guest_vote_limits drop constraint guest_vote_limits_pkey;
alter table public.guest_vote_limits add primary key(network_hash,purpose);

create function public.github_vote_identity(p_actor uuid) returns text language plpgsql stable set search_path=public as $$
begin
 if p_actor is null then return null;end if;
 return (select min(provider_id) from auth.identities where user_id=p_actor and provider='github');
end $$;

-- Separate RPC transaction: failed challenges and failed ballots still consume request quota.
create function public.limit_vote_request(p_network text,p_kind text) returns jsonb language plpgsql set search_path=public as $$
declare duration integer;maximum integer;bucket timestamptz;attempts integer;
begin
 if p_network is null or p_network !~ '^[0-9a-f]{64}$' or p_kind is null or p_kind not in('issue','cast') then raise exception 'Invalid voting context';end if;
 duration=case when p_kind='issue' then 600 else 60 end;
 maximum=case when p_kind='issue' then 20 else 30 end;
 bucket=to_timestamp(floor(extract(epoch from clock_timestamp())/duration)*duration);
 insert into guest_vote_limits(network_hash,purpose,window_start,hits) values(p_network,p_kind,bucket,1)
 on conflict(network_hash,purpose) do update set hits=case when guest_vote_limits.window_start=excluded.window_start then least(guest_vote_limits.hits+1,maximum+1) else 1 end,window_start=excluded.window_start returning hits into attempts;
 return jsonb_build_object('allowed',attempts<=maximum,'retry_after',greatest(1,ceil(extract(epoch from bucket+make_interval(secs=>duration)-clock_timestamp()))::integer));
end $$;

create or replace function public.issue_voting_link(p_match uuid,p_voter text,p_token text,p_network text,p_actor uuid default null) returns timestamptz language plpgsql set search_path=public as $$
declare m matches;deadline timestamptz;bucket timestamptz;attempts integer;github text;
begin
 if p_voter is null or p_voter !~ '^[0-9a-f]{64}$' or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_network is null or p_network !~ '^[0-9a-f]{64}$' then raise exception 'Invalid voting context';end if;
 select tournament_id into m.tournament_id from matches where id=p_match;
 perform 1 from tournaments where id=m.tournament_id for update;
 select * into m from matches where id=p_match for update;
 if m.id is null or clock_timestamp()<m.starts_at or clock_timestamp()>=m.ends_at or m.winner_id is not null or not exists(select 1 from tournaments where id=m.tournament_id and status='voting') then raise exception 'Match is not open';end if;
 if p_actor is not null and not exists(select 1 from auth.users where id=p_actor) then raise exception 'Invalid account';end if;
 github=github_vote_identity(p_actor);
 if exists(select 1 from entries where id in(m.entry_a,m.entry_b) and user_id=p_actor) then raise exception 'Founders cannot vote in their own match';end if;
 if exists(select 1 from votes where match_id=p_match and (voter_hash=p_voter or user_id=p_actor or github_identity=github)) then raise exception 'Your final vote is already recorded';end if;
 if github is null and exists(select 1 from vote_network_claims where match_id=p_match and network_hash=p_network) then raise exception 'GitHub verification required for another vote from this network';end if;
 bucket=to_timestamp(floor(extract(epoch from clock_timestamp())/600)*600);
 insert into guest_vote_limits(network_hash,purpose,window_start,hits) values(p_network,'issued',bucket,1)
 on conflict(network_hash,purpose) do update set hits=case when guest_vote_limits.window_start=excluded.window_start then guest_vote_limits.hits+1 else 1 end,window_start=excluded.window_start returning hits into attempts;
 if attempts>20 then raise exception 'Too many voting link requests. Please wait ten minutes';end if;
 deadline=least(clock_timestamp()+interval '10 minutes',m.ends_at);
 insert into voting_links(match_id,voter_hash,token_hash,actor_id,network_hash,github_identity,expires_at) values(p_match,p_voter,p_token,p_actor,p_network,github,deadline)
 on conflict(match_id,voter_hash) do update set token_hash=excluded.token_hash,actor_id=excluded.actor_id,network_hash=excluded.network_hash,github_identity=excluded.github_identity,expires_at=excluded.expires_at,used_at=null,created_at=now();
 return deadline;
end $$;

create or replace function public.cast_guest_vote(p_match uuid,p_entry uuid,p_voter text,p_token text,p_network text,p_handle text default null,p_actor uuid default null) returns void language plpgsql set search_path=public as $$
declare m matches;link voting_links;github text;
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
 github=github_vote_identity(p_actor);
 if link.actor_id is distinct from p_actor or link.github_identity is distinct from github then raise exception 'Your account changed. Create a new voting link';end if;
 if link.network_hash is distinct from p_network then raise exception 'Your network changed. Create a new voting link';end if;
 if exists(select 1 from entries where id in(m.entry_a,m.entry_b) and user_id=p_actor) then raise exception 'Founders cannot vote in their own match';end if;
 if exists(select 1 from votes where match_id=p_match and (voter_hash=p_voter or user_id=p_actor or github_identity=github)) then raise exception 'Your final vote is already recorded';end if;
 if github is null and exists(select 1 from vote_network_claims where match_id=p_match and network_hash=p_network) then raise exception 'GitHub verification required for another vote from this network';end if;
 if (select count(*) from votes where voter_hash=p_voter and created_at>now()-interval '1 minute')>=6 then raise exception 'Please wait before voting again';end if;
 insert into votes(match_id,entry_id,user_id,voter_hash,network_hash,x_handle,github_identity) values(p_match,p_entry,p_actor,p_voter,p_network,p_handle,github);
 insert into vote_network_claims(match_id,network_hash) values(p_match,p_network) on conflict do nothing;
 update voting_links set used_at=clock_timestamp() where match_id=p_match and voter_hash=p_voter;
 if (select count(distinct voter_hash) from votes where match_id=p_match and network_hash=p_network and created_at>now()-interval '10 minutes')>=4 then
  update votes set suspicious=true where match_id=p_match and network_hash=p_network and created_at>now()-interval '10 minutes';
 end if;
end $$;

alter function public.tick() rename to tick_before_network_voting;
create function public.tick() returns void language plpgsql set search_path=public as $$begin
 perform tick_before_network_voting();
 delete from vote_network_claims c using matches m where c.match_id=m.id and m.ends_at<now()-interval '7 days';
end $$;
revoke execute on function public.github_vote_identity(uuid),public.limit_vote_request(text,text),public.issue_voting_link(uuid,text,text,text,uuid),public.cast_guest_vote(uuid,uuid,text,text,text,text,uuid),public.tick(),public.tick_before_network_voting() from public,anon,authenticated;
grant execute on function public.github_vote_identity(uuid),public.limit_vote_request(text,text),public.issue_voting_link(uuid,text,text,text,uuid),public.cast_guest_vote(uuid,uuid,text,text,text,text,uuid),public.tick(),public.tick_before_network_voting() to service_role;
