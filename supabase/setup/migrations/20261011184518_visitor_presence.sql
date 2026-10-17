create table public.site_visitors(visitor_hash text primary key check(visitor_hash ~ '^[0-9a-f]{64}$'),last_seen timestamptz not null default now());
create index site_visitors_active on public.site_visitors(last_seen);
create table public.site_visit_totals(id boolean primary key default true check(id),total bigint not null default 0 check(total>=0));
insert into public.site_visit_totals(id,total) values(true,0);
alter table public.site_visitors enable row level security;
alter table public.site_visit_totals enable row level security;
revoke all on public.site_visitors,public.site_visit_totals from public,anon,authenticated;
grant select,insert,update,delete on public.site_visitors,public.site_visit_totals to service_role;
create function public.register_site_visit(p_visitor text) returns jsonb language plpgsql set search_path=public as $$
declare seen timestamptz; current_time_value timestamptz=clock_timestamp();
begin
 if p_visitor is null or p_visitor !~ '^[0-9a-f]{64}$' then raise exception 'Invalid visitor';end if;
 perform pg_advisory_xact_lock(hashtext(p_visitor));
 select last_seen into seen from site_visitors where visitor_hash=p_visitor for update;
 if seen is null or seen<current_time_value-interval '30 minutes' then update site_visit_totals set total=total+1 where id=true;end if;
 insert into site_visitors(visitor_hash,last_seen) values(p_visitor,current_time_value) on conflict(visitor_hash) do update set last_seen=excluded.last_seen where site_visitors.last_seen<current_time_value-interval '15 seconds';
 delete from site_visitors where last_seen<current_time_value-interval '90 days';
 return jsonb_build_object('current',(select count(*) from site_visitors where last_seen>current_time_value-interval '90 seconds'),'total',(select total from site_visit_totals where id=true));
end $$;
revoke execute on function public.register_site_visit(text) from public,anon,authenticated;
grant execute on function public.register_site_visit(text) to service_role;
