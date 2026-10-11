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
