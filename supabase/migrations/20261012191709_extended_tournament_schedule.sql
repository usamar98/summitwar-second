-- New/unlocked editions use 24h quarterfinals, 24h semifinals, 12h final and 12h spotlight.
-- Preserve locked and already-running brackets and their published timestamps.
alter table public.tournaments add column extended_cycle boolean not null default false;
update public.tournaments set extended_cycle=true where status in ('draft','registration') and not exists(select 1 from matches where tournament_id=tournaments.id);
alter table public.tournaments alter column extended_cycle set default true;
-- Move existing advance-registration editions beyond their predecessor's spotlight.
update public.tournaments n set starts_at=p.starts_at+interval '72 hours',registration_ends=p.starts_at+interval '71 hours' from public.tournaments p where n.previous_tournament_id=p.id and p.extended_cycle and n.status='registration' and n.starts_at<p.starts_at+interval '72 hours' and not exists(select 1 from matches where tournament_id=n.id);
create or replace function public.admin_command_before_submission(p_actor uuid,p_action text,p_target uuid default null,p_data jsonb default '{}') returns jsonb language plpgsql set search_path=public as $$
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
  update matches set starts_at=(p_data->>'starts_at')::timestamptz+make_interval(hours=>case when t.extended_cycle then case round when 1 then 0 when 2 then 24 else 48 end when t.daily_cycle then (round-1)*4 else case round when 1 then 0 when 2 then 24 else 40 end end),ends_at=(p_data->>'starts_at')::timestamptz+make_interval(hours=>case when t.extended_cycle then case round when 1 then 24 when 2 then 48 else 60 end when t.daily_cycle then round*4 else case round when 1 then 24 when 2 then 40 else 48 end end) where tournament_id=t.id;
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

create or replace function public.tick_before_submission() returns void language plpgsql set search_path=public as $$
declare t tournaments; m matches; ids uuid[]; winners uuid[]; a integer; b integer; win uuid; roundno integer; offsethours integer; durationhours integer; i integer;
begin
 for t in select * from tournaments where status in ('registration','locked','voting','spotlight') order by edition for update skip locked loop
  update reservations set released=true where tournament_id=t.id and expires_at<=now();
  if t.status='registration' and now()>=t.registration_ends then
   if (select count(*) from entries where tournament_id=t.id and status='confirmed')<>8 then
    update tournaments set starts_at=public.next_daily_start(starts_at),registration_ends=public.next_daily_start(starts_at)-interval '1 hour' where id=t.id;
    insert into notifications(user_id,message) select user_id,'Voting was rescheduled because eight confirmed entrants are required.' from entries where tournament_id=t.id;
    continue;
   end if;
   if not exists(select 1 from matches where tournament_id=t.id) then
    select array_agg(id) into ids from (select id from entries where tournament_id=t.id and status='confirmed' order by random()) x;
    for i in 1..8 loop update entries set priority=i,snapshot=(select to_jsonb(p) from products p where p.id=entries.product_id) where id=ids[i]; end loop;
    for i in 1..4 loop insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values(t.id,1,i,ids[i*2-1],ids[i*2],t.starts_at,t.starts_at+make_interval(hours=>case when t.extended_cycle then 24 when t.daily_cycle then 4 else 24 end)); end loop;
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
      offsethours=case when t.extended_cycle then roundno*24 when t.daily_cycle then roundno*4 else case roundno when 1 then 24 else 40 end end; durationhours=case when t.extended_cycle then case roundno when 1 then 24 else 12 end when t.daily_cycle then 4 else case roundno when 1 then 16 else 8 end end;
      for i in 1..(array_length(winners,1)/2) loop insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values(t.id,roundno+1,i,winners[i*2-1],winners[i*2],t.starts_at+make_interval(hours=>offsethours),t.starts_at+make_interval(hours=>offsethours+durationhours)) on conflict do nothing; end loop;
     else
      insert into champions(tournament_id,entry_id,spotlight_starts,spotlight_ends) values(t.id,winners[1],t.starts_at+make_interval(hours=>case when t.extended_cycle then 60 when t.daily_cycle then 12 else 48 end),t.starts_at+make_interval(hours=>case when t.extended_cycle then 72 when t.daily_cycle then 24 else 168 end)) on conflict do nothing;
      update tournaments set status='spotlight' where id=t.id;
      if not exists(select 1 from promotion_tasks where tournament_id=t.id and kind='champion_post') then
       insert into promotion_tasks(tournament_id,entry_id,kind,draft) values(t.id,winners[1],'champion_post',(select snapshot->>'name' from entries where id=winners[1])||' is the community-choice champion of SummitWar edition #'||t.edition||'. Discover what they built: /champions/'||t.id),(t.id,winners[1],'pin_post',case when t.daily_cycle then 'Pin the dedicated X post during the 12-hour winner spotlight.' else 'Pin the dedicated X post for five days.' end),(t.id,winners[1],'founder_interview','What did you build? Who does it help? Why did you build it?');
      end if;
     end if;
    end if;
   end loop;
  end if;
  if now()>=t.starts_at+make_interval(hours=>case when t.extended_cycle then 72 when t.daily_cycle then 24 else 168 end) and exists(select 1 from champions where tournament_id=t.id) then update tournaments set status='completed' where id=t.id; end if;
 end loop;
end $$;


create or replace function public.tick_before_community() returns void language plpgsql set search_path=public as $$
declare t tournaments; next_start timestamptz; number integer; next_id uuid;
begin
 -- Serialize the daily planner; retries and concurrent cron calls cannot create duplicate editions.
 perform pg_advisory_xact_lock(hashtext('summitwar_daily_planner'));
 for t in select * from tournaments where status='registration' and registration_ends<=now() and exists(select 1 from entries where tournament_id=tournaments.id and status='confirmed' and review_status<>'approved') for update loop
  update tournaments set starts_at=next_daily_start(starts_at),registration_ends=next_daily_start(starts_at)-interval '1 hour' where id=t.id;
  insert into notifications(user_id,message) select user_id,'Voting moved to the next daily start because eight approved founders are required.' from entries where tournament_id=t.id;
 end loop;
 perform tick_before_submission();
 -- Open tomorrow's registration as soon as today's bracket locks. Never fabricate entrants or missed results.
 select * into t from tournaments where daily_cycle and status in ('locked','voting','spotlight','completed') and not archived order by starts_at desc limit 1;
 if t.id is not null and not exists(select 1 from tournaments where previous_tournament_id=t.id) and not exists(select 1 from tournaments where status='registration' and id<>t.id) then
  next_start=next_daily_start(t.starts_at);if t.extended_cycle then next_start=greatest(next_start,t.starts_at+interval '72 hours');end if;
  update edition_counter set last_edition=greatest(last_edition,(select coalesce(max(edition),0) from tournaments))+1 where id=true returning last_edition into number;
  insert into tournaments(edition,theme,status,fee_amount_cents,registration_ends,starts_at,daily_cycle,previous_tournament_id) values(number,t.theme,'registration',500,next_start-interval '1 hour',next_start,true,t.id) returning id into next_id;
  insert into audit_logs(action,target,detail) values('schedule_daily_edition',next_id,jsonb_build_object('previous',t.id,'starts_at',next_start));
 end if;
end $$;
revoke execute on function public.next_daily_start(timestamptz),public.tick_before_community(),public.tick_before_submission(),public.admin_command_before_submission(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.next_daily_start(timestamptz),public.tick_before_community(),public.tick_before_submission(),public.admin_command_before_submission(uuid,text,uuid,jsonb) to service_role;
