-- GENERATED read-only checks. Run after 01_install.sql and 02_storage.sql.
begin read only;
do $$
declare expected_tables text[] := array['admin_roles','analytics_events','audit_logs','champions','edition_counter','entries','feedback','feedback_replies','guest_vote_limits','matches','notifications','payment_signals','payments','product_follows','products','profiles','promotion_orders','promotion_payment_signals','promotion_payments','promotion_slots','promotion_tasks','reports','reservations','saved_products','screenshot_jobs','site_lookup_requests','site_visit_totals','site_visitors','tournaments','vote_network_claims','vote_risk_events','votes','voting_links','webhook_events'];
 expected_functions text[] := array['add_feedback','admin_command','admin_command_before_submission','apply_existing','apply_product','cast_guest_vote','cast_protected_vote','cast_vote','claim_screenshot','community_command','free_tournament_entry','fulfill_payment','fulfill_promotion','github_vote_identity','issue_voting_link','limit_site_lookup','limit_vote_request','live_revision','live_revision_before_promotions','match_scores','next_daily_start','promotion_ends','promotion_inventory','promotion_price','promotion_signal','protect_bracket','protect_edition','protect_match','protect_promotion_bid','publish_reviewed_entry','queue_screenshot','record_payment_signal','register_site_visit','remove_promotion','reserve_promotion','seat_availability','send_follow_reminders','submit_application','tick','tick_before_community','tick_before_guest_voting','tick_before_network_voting','tick_before_promotions','tick_before_submission'];
 public_read_tables text[] := array['products','tournaments','entries','matches','feedback','champions','promotion_tasks'];
 object_name text; actor text; routine record; relation oid;
begin
 foreach object_name in array expected_tables loop
  relation := to_regclass('public.'||object_name);
  if relation is null then raise exception 'Missing table: %. Apply the missing migrations first.',object_name;end if;
  if not (select relrowsecurity from pg_class where oid=relation) then raise exception 'RLS is disabled on %',object_name;end if;
  if not (has_table_privilege('service_role',relation,'SELECT') and has_table_privilege('service_role',relation,'INSERT') and has_table_privilege('service_role',relation,'UPDATE') and has_table_privilege('service_role',relation,'DELETE')) then raise exception 'Server access is missing on %',object_name;end if;
  foreach actor in array array['anon','authenticated'] loop
   if has_table_privilege(actor,relation,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then raise exception 'Browser role % can mutate %',actor,object_name;end if;
   if not(object_name=any(public_read_tables)) and has_table_privilege(actor,relation,'SELECT') then raise exception 'Private table % is readable by %',object_name,actor;end if;
  end loop;
 end loop;
 foreach object_name in array expected_functions loop
  if not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=object_name) then raise exception 'Missing server command: %',object_name;end if;
 end loop;
 for routine in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(expected_functions) loop
  if has_function_privilege('anon',routine.oid,'EXECUTE') or has_function_privilege('authenticated',routine.oid,'EXECUTE') then raise exception 'Browser can execute privileged command %',routine.proname;end if;
  if not has_function_privilege('service_role',routine.oid,'EXECUTE') then raise exception 'Server cannot execute %',routine.proname;end if;
  if routine.prosecdef or not(coalesce(routine.proconfig,'{}') @> array['search_path=public']) then raise exception 'Unexpected security/search path on %',routine.proname;end if;
 end loop;
 if not(select rolbypassrls from pg_roles where rolname='service_role') then raise exception 'Supabase service_role must have its platform BYPASSRLS capability';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='votes' and column_name='voter_hash') or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='votes' and column_name='user_id' and is_nullable='YES') then raise exception 'Guest voting migration is missing';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='voting_links' and column_name='network_hash') or not exists(select 1 from pg_indexes where schemaname='public' and indexname='one_github_vote') then raise exception 'Network-bound and GitHub voting protection is missing';end if;
 if not has_column_privilege('service_role','auth.identities','provider_id','SELECT') or not has_column_privilege('service_role','auth.identities','provider','SELECT') or not has_column_privilege('service_role','auth.identities','user_id','SELECT') then raise exception 'Server GitHub identity lookup permissions are missing';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_orders' and column_name='pricing_version' and column_default='4') then raise exception 'Promotion bid pricing version 4 default is missing';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_orders' and column_name='slot_amounts') or not exists(select 1 from pg_trigger where tgrelid='public.promotion_orders'::regclass and tgname='immutable_promotion_bid' and tgenabled='O') then raise exception 'Immutable per-card sponsor bids are missing';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='tournaments' and column_name='extended_cycle' and column_default='true') then raise exception '24/24/12-hour tournament schedule default is missing';end if;
 if array(select public.promotion_price(g) from generate_series(1,6) g)<>array[10000,10000,10000,10000,10000,10000] then raise exception 'Sponsor prices do not match $100 per card';end if;
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='promotion_slots' and column_name='pending_order_id') then raise exception 'Sponsor takeover reservations are missing';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.tournaments'::regclass and tgname='a_free_tournament_entry' and tgenabled='O') or exists(select 1 from public.tournaments where edition is not null and fee_amount_cents is distinct from 0) then raise exception 'Permanent free tournament entry is not installed';end if;
 if not exists(select 1 from storage.buckets where id='product-media' and public and file_size_limit=31457280 and allowed_mime_types @> array['image/png','image/jpeg','image/webp','video/mp4','video/webm']) then raise exception 'Run 02_storage.sql to configure product media';end if;
 if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Public product media reads' and cmd='SELECT') then raise exception 'Product media read policy is missing';end if;
end $$;
select 'PASS: SummitWar database is installed' as result,34 as protected_application_tables,44 as required_server_command_names,'20261029132229' as schema_version;
select g as card_position,public.promotion_price(g)/100.0 as price_usd from generate_series(1,6) g;
commit;
