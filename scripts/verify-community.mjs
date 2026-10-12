import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const sql=new PGlite({dataDir:'.tmp/community-check-'+randomUUID(),postgresqlconf:'shared_buffers = 8MB'});
const q=async(text,args=[])=> (await sql.query(text,args)).rows;
try{
await sql.exec("create schema auth;create role anon;create role authenticated;create role service_role;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',created_at timestamptz default now()-interval '2 days');create function auth.uid() returns uuid language sql as 'select null::uuid';");
for(const name of ['schema','submission-upgrade','visitor-presence','daily-tournaments','community-features','extended-tournaments']){await sql.exec(fs.readFileSync(`supabase/${name}.sql`,'utf8').replace('create extension if not exists pgcrypto;',''));process.stdout.write(`Applied ${name}\n`);}
const founder=randomUUID(),voters=Array.from({length:5},()=>randomUUID());for(const id of [founder,...voters])await q('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);
const product=(await q("insert into products(owner_id,name,slug,url,logo_url,category,tagline,founder,published) values($1,'Project','sample','https://example.org','https://example.org/favicon.ico','Tools','Build faster','Founder',true) returning id",[founder]))[0].id;
await q("select community_command($1,'follow',$2)",[voters[0],product]);await q("select community_command($1,'follow',$2)",[voters[0],product]);assert.equal((await q('select count(*) n from product_follows'))[0].n,1);
await q("select community_command($1,'save',$2)",[voters[0],product]);assert.equal((await q('select count(*) n from saved_products'))[0].n,1);
const feedback=(await q("insert into feedback(product_id,user_id,body) values($1,$2,'Please add shortcuts') returning id",[product,voters[0]]))[0].id;
await assert.rejects(q("select community_command($1,'reply',null,$2,'Wrong founder')",[voters[1],feedback]));await q("select community_command($1,'reply',null,$2,'Thanks, shortcuts are next')",[founder,feedback]);assert.equal((await q('select count(*) n from feedback_replies'))[0].n,1);assert.equal((await q('select count(*) n from notifications where user_id=$1',[voters[0]]))[0].n,1);
assert.ok((await q('select claim_screenshot() job'))[0].job);assert.equal((await q('select claim_screenshot() job'))[0].job,null);
const other=(await q("insert into products(owner_id,name,slug,url,logo_url,category,tagline,founder,published) values($1,'Opponent','opponent','https://example.net','https://example.org/favicon.ico','Tools','Build better','Other founder',true) returning id",[voters[4]]))[0].id;
const tournament=(await q("insert into tournaments(edition,theme,status,fee_amount_cents,registration_ends,starts_at) values(1,'Daily','voting',0,now()-interval '2 hours',now()-interval '1 hour') returning id"))[0].id;
const a=(await q("insert into entries(tournament_id,product_id,user_id,status,review_status) values($1,$2,$3,'confirmed','approved') returning id",[tournament,product,founder]))[0].id;
const b=(await q("insert into entries(tournament_id,product_id,user_id,status,review_status) values($1,$2,$3,'confirmed','approved') returning id",[tournament,other,voters[4]]))[0].id;
const match=(await q("insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values($1,1,1,$2,$3,now()-interval '1 hour',now()+interval '3 hours') returning id",[tournament,a,b]))[0].id;
await q("insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values($1,2,1,$2,$3,now()-interval '3 hours',now()+interval '10 minutes')",[tournament,a,b]);
await q('select send_follow_reminders()');await q('select send_follow_reminders()');assert.equal((await q('select count(*) n from notifications where user_id=$1 and event_key is not null',[voters[0]]))[0].n,2);
await q("select community_command($1,'follow',$2,null,null,false)",[voters[0],product]);await q('delete from notifications where user_id=$1 and event_key is not null',[voters[0]]);await q('select send_follow_reminders()');assert.equal((await q('select count(*) n from notifications where user_id=$1 and event_key is not null',[voters[0]]))[0].n,0);
const revision=(await q('select live_revision($1) r',[tournament]))[0].r;
for(const voter of voters.slice(0,4))await q('select cast_protected_vote($1,$2,$3,$4)',[voter,match,a,'a'.repeat(64)]);
assert.equal((await q('select count(*) n from votes where match_id=$1 and suspicious and valid',[match]))[0].n,4);assert.notEqual((await q('select live_revision($1) r',[tournament]))[0].r,revision);
await assert.rejects(q('select cast_protected_vote($1,$2,$3,$4)',[voters[0],match,b,'a'.repeat(64)]));await assert.rejects(q('select cast_protected_vote($1,$2,$3,$4)',[founder,match,a,'a'.repeat(64)]));
await q("select community_command($1,'read')",[voters[0]]);assert.ok((await q('select read_at from notifications where user_id=$1 limit 1',[voters[0]]))[0].read_at);
await sql.exec('set role anon');await assert.rejects(q('select * from product_follows'));await assert.rejects(q('select send_follow_reminders()'));await sql.exec('reset role');
process.stdout.write('Community schema, ownership, follows, collection, replies, opening/closing reminder deduplication, unfollowing, final votes, network-risk flags, live revision, screenshot leases and access checks passed.\n');
}finally{await sql.close()}
