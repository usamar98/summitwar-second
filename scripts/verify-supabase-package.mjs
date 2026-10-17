import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..'),folder=path.join(root,'supabase','setup');
const read=file=>fs.readFileSync(path.join(folder,file),'utf8');
const manifest=JSON.parse(read('manifest.json'));
for(const [file,digest] of Object.entries(manifest.files))assert.equal(createHash('sha256').update(read(file)).digest('hex'),digest,`Checksum differs: ${file}`);
for(const file of fs.readdirSync(path.join(folder,'migrations')))assert.equal(read(`migrations/${file}`),fs.readFileSync(path.join(root,'supabase','migrations',file),'utf8').replaceAll('\r\n','\n'));

const sql=new PGlite({dataDir:path.join(root,'.tmp','supabase-package-'+randomUUID()),postgresqlconf:'shared_buffers = 8MB'});
const q=async(text,args=[])=> (await sql.query(text,args)).rows;
const rejected=async(text,pattern)=>{await assert.rejects(sql.exec(text),pattern);await sql.exec('rollback')};
const checks=[];
try{
 await sql.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',created_at timestamptz default now()-interval '2 days');
 create function auth.uid() returns uuid language sql as 'select null::uuid';
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text);
 alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to anon,authenticated,service_role;`);
 // Platform APIs are simulated; the delivered app SQL runs unchanged except for this extension line.
 const installer=read('01_install.sql').replace('create extension if not exists pgcrypto;','');
 await sql.exec(installer);checks.push('complete fresh installer applies all nine migrations atomically');
 assert.equal((await q("select count(*)::int n from pg_tables where schemaname='public'"))[0].n,manifest.tables.length);
 await rejected(installer,/requires an empty public application schema/);
 assert.equal((await q('select last_edition from edition_counter'))[0].last_edition,0);
 checks.push('repeat installation refuses safely and preserves existing tables/counter');
 await sql.exec(read('02_storage.sql'));await sql.exec(read('02_storage.sql'));
 assert.equal((await q("select count(*)::int n from pg_policies where schemaname='storage' and policyname='Public product media reads'"))[0].n,1);
 await sql.exec(read('04_verify.sql'));checks.push('33 tables, RLS, private permissions, 39 command names, current prices and media configuration verified');
 await sql.exec('grant select on public.votes to anon');
 await rejected(read('04_verify.sql'),/Private table votes is readable by anon/);await sql.exec('revoke select on public.votes from anon');
 await sql.exec('alter table public.promotion_orders disable row level security');
 await rejected(read('04_verify.sql'),/RLS is disabled on promotion_orders/);await sql.exec('alter table public.promotion_orders enable row level security');
 await sql.exec(read('04_verify.sql'));checks.push('verification catches exposed votes and disabled sponsor-order RLS');

 await rejected(read('03_admin.sql'),/Replace PASTE_YOUR_AUTH_USER_UUID_HERE/);
 const admin=randomUUID(),adminFile=read('03_admin.sql').replace("'PASTE_YOUR_AUTH_USER_UUID_HERE'",`'${admin}'`);
 await rejected(adminFile,/Auth user does not exist/);
 const authUser=async id=>q("insert into auth.users(id,raw_app_meta_data) values($1,'{\"provider\":\"github\",\"providers\":[\"github\"]}')",[id]);
 await authUser(admin);await sql.exec(adminFile);await sql.exec(adminFile);
 assert.equal((await q('select count(*)::int n from admin_roles'))[0].n,1);checks.push('admin assignment requires a real existing user and is idempotent');
 const command=async(action,target=null,data={})=>(await q('select admin_command($1,$2,$3,$4) result',[admin,action,target,data]))[0].result;
 await command('create',null,{theme:'Package verification',registration_ends:new Date(Date.now()+23*3600000).toISOString(),starts_at:new Date(Date.now()+24*3600000).toISOString()});
 const t=(await q('select * from tournaments'))[0];await command('publish',t.id);
 const entrants=[];
 for(let slot=1;slot<=8;slot++){
  const actor=randomUUID(),key=randomUUID();await authUser(actor);entrants.push(actor);
  await q('select submit_application($1,$2,$3,$4)',[actor,t.id,{name:`Fixture app ${slot}`,slug:key,url:`https://example.org/${key}`,logo_url:'https://example.org/favicon.ico',category:'Tools',tagline:'A test fixture',founder:'Fixture founder'},slot]);
  const entry=(await q('select id from entries where tournament_id=$1 and user_id=$2',[t.id,actor]))[0];await command('approve',entry.id);
 }
 assert.equal((await q("select count(*)::int n from entries where tournament_id=$1 and status='confirmed'",[t.id]))[0].n,8);
 const resumed=(await q('select submit_application($1,$2,$3,1) result',[entrants[1],t.id,{}]))[0].result;assert.equal(resumed.slot,2);
 await assert.rejects(q('select submit_application($1,$2,$3,1)',[entrants[1],t.id,{url:'https://different-fixture.example'}]),/different app/);
 assert.equal((await q('select count(*)::int n from entries where tournament_id=$1 and user_id=$2',[t.id,entrants[1]]))[0].n,1);
 await q("update tournaments set registration_ends=now()-interval '3 minutes',starts_at=now()-interval '2 minutes' where id=$1",[t.id]);await q('select tick()');
 const matches=await q('select * from matches where tournament_id=$1 order by position',[t.id]);assert.equal(matches.length,4);
 assert.ok(matches.every(m=>Date.parse(m.ends_at)-Date.parse(m.starts_at)===24*3600000));
 checks.push('organizer publishes the first free edition, approves eight founders, protects entry uniqueness and starts 24-hour quarterfinals');
 const m=matches[0],voter=randomBytes(32).toString('hex'),token=randomBytes(32).toString('hex'),network=randomBytes(32).toString('hex');
 await q('select issue_voting_link($1,$2,$3,$4)',[m.id,voter,token,network]);
 await q("select cast_guest_vote($1,$2,$3,$4,$5,'test_builder')",[m.id,m.entry_a,voter,token,network]);
 await assert.rejects(q("select cast_guest_vote($1,$2,$3,$4,$5,'test_builder')",[m.id,m.entry_b,voter,token,network]));
 assert.equal((await q('select count(*)::int n from votes where match_id=$1',[m.id]))[0].n,1);
 assert.ok((await q('select used_at from voting_links where match_id=$1',[m.id]))[0].used_at);checks.push('guest voting records one final vote and consumes its single-use link without an email account');
 const order=randomUUID();await q('select reserve_promotion($1,$2,$3,$4,$5)',[admin,t.id,[1,2,3,4,5,6],order,{name:'Fixture sponsor',url:'https://example.org',tagline:'Fixture placement',logo_url:'https://example.org/favicon.ico'}]);
 const booking=(await q('select amount,pricing_version from promotion_orders where id=$1',[order]))[0];assert.deepEqual(booking,{amount:30000,pricing_version:2});
 await assert.rejects(q('select reserve_promotion($1,$2,$3,$4,$5)',[entrants[0],t.id,[1],randomUUID(),{name:'Other fixture',url:'https://example.net',tagline:'Fixture'}]));
 assert.equal((await q("select fulfill_promotion('fixture-event','checkout.session.completed',$1,'fixture-checkout','fixture-intent',30000,'usd') result",[order]))[0].result,'paid');
 assert.ok((await q('select promotion_inventory($1) result',[t.id]))[0].result.every(s=>s.state==='paid'));checks.push('all six sponsor cards cost $300, have one owner and publish only after verified payment fulfillment');
 for(const role of ['anon','authenticated']){
  await sql.exec(`set role ${role}`);await assert.rejects(q('select * from promotion_orders'),/permission denied/);await assert.rejects(q('select * from voting_links'),/permission denied/);
  await assert.rejects(q('select tick()'),/permission denied/);await assert.rejects(q("insert into storage.objects(bucket_id,name) values('product-media','blocked.png')"),/row-level security/);await sql.exec('reset role');
 }
 await sql.exec('set role service_role');assert.equal((await q('select count(*)::int n from promotion_orders'))[0].n,1);await sql.exec('reset role');checks.push('browser roles cannot read private records, run privileged commands or upload media; service role retains access');

 await sql.exec(`create schema vault;create table vault.decrypted_secrets(name text primary key,decrypted_secret text);
 create schema cron;create table cron.job(jobid bigint generated always as identity primary key,jobname text unique,schedule text,command text,active boolean default true);
 create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job(jobname,schedule,command) values($1,$2,$3) on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command,active=true returning jobid$$;
 create schema net;create function net.http_get(url text,headers jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;`);
 const scheduler=read('05_scheduler.sql').replaceAll(/create extension if not exists pg_(cron|net);/g,'');
 await rejected(scheduler,/Vault needs exactly one/);
 await q("insert into vault.decrypted_secrets values('summitwar_app_url','http://localhost:3000'),('summitwar_cron_secret',$1)",[randomBytes(32).toString('hex')]);
 await rejected(scheduler,/deployed HTTPS origin/);await q("update vault.decrypted_secrets set decrypted_secret='https://summitwar.example' where name='summitwar_app_url'");
 await sql.exec(scheduler);await sql.exec(scheduler);const jobs=await q('select * from cron.job order by jobname');assert.equal(jobs.length,2);
 assert.equal(jobs.find(j=>j.jobname==='summitwar-transitions').schedule,'* * * * *');assert.equal(jobs.find(j=>j.jobname==='summitwar-refunds').schedule,'*/5 * * * *');
 for(const job of jobs)await sql.exec(job.command);checks.push('scheduler rejects missing/local settings and registers two repeat-safe jobs; stored SQL executes against simulated Cron/Vault/HTTP APIs');
 await sql.exec(read('04_verify.sql'));
 const result={passed:true,migrations:manifest.migrationCount,protectedTables:manifest.tables.length,serverCommandNames:manifest.functions.length,checks,scope:'Embedded PostgreSQL with simulated Supabase Auth, Storage, Vault, Cron and HTTP APIs; the platform pgcrypto extension statement is omitted in this local harness. Hosted OAuth, storage APIs, real Cron HTTP delivery, Stripe charges/refunds and independent-connection races still require configured services.'};
 fs.writeFileSync(path.join(root,'artifacts','supabase-package-checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Supabase package verification failed:',error.message,'SQL code:',error.code||'n/a','Completed checks:',checks.length);process.exitCode=1}finally{await sql.close()}
