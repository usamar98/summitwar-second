-- Preserve the original price contract for all existing bookings.
alter table public.promotion_orders add column pricing_version integer not null default 1 check (pricing_version in (1,2));
alter table public.promotion_orders alter column pricing_version set default 2;

-- All new reservations and advertised inventory use $70 / $50 / $30 per side.
create or replace function public.promotion_price(p_slot integer) returns integer language sql immutable set search_path=public as $$
 select case when p_slot in(1,4) then 7000 when p_slot in(2,5) then 5000 when p_slot in(3,6) then 3000 else null end;
$$;
revoke execute on function public.promotion_price(integer) from public,anon,authenticated;
grant execute on function public.promotion_price(integer) to service_role;
