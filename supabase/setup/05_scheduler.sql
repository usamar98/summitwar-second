-- GENERATED from supabase/scheduler.sql. Enable pg_cron/pg_net and add Vault secrets first.
begin;
do $$
declare app_origin text; private_secret text;
begin
 if to_regprocedure('public.tick()') is null then raise exception 'Install the SummitWar database first';end if;
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'Enable Supabase Vault and add the two named secrets from START_HERE.md';end if;
 if (select count(*) from vault.decrypted_secrets where name='summitwar_app_url')<>1 or (select count(*) from vault.decrypted_secrets where name='summitwar_cron_secret')<>1 then raise exception 'Vault needs exactly one summitwar_app_url and one summitwar_cron_secret';end if;
 select decrypted_secret into app_origin from vault.decrypted_secrets where name='summitwar_app_url';
 select decrypted_secret into private_secret from vault.decrypted_secrets where name='summitwar_cron_secret';
 if app_origin is null or app_origin !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]+)?$' or app_origin ilike '%localhost%' then raise exception 'summitwar_app_url must be your deployed HTTPS origin without a trailing slash or path';end if;
 if private_secret is null or length(private_secret)<32 then raise exception 'Vault cron secret must match the app CRON_SECRET and contain at least 32 characters';end if;
end $$;
-- Configure Supabase Cron in the dashboard before applying this script.
-- DB transitions run durably even with zero visitors or an unavailable app server.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('summitwar-transitions','* * * * *','select public.tick();');
-- Add secrets named summitwar_app_url and summitwar_cron_secret in Supabase Vault.
-- The cron secret must match CRON_SECRET in the app environment.
select cron.schedule('summitwar-refunds','*/5 * * * *', $$
 select net.http_get(
  url := (select decrypted_secret from vault.decrypted_secrets where name='summitwar_app_url' limit 1)||'/api/cron',
  headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='summitwar_cron_secret' limit 1)),
  timeout_milliseconds := 30000
 );
$$);

commit;
select jobname,schedule,active from cron.job where jobname in('summitwar-transitions','summitwar-refunds') order by jobname;
