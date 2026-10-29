import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const sql=new PGlite({dataDir:'.tmp/sponsor-bids-'+randomUUID(),postgresqlconf:'shared_buffers = 8MB'});
const q=async(text,args=[])=>(await sql.query(text,args)).rows;
const checks=[];
try{
 await sql.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',created_at timestamptz default now()-interval '2 days');
 create table auth.identities(user_id uuid references auth.users(id),provider text,provider_id text,unique(provider,provider_id));
 create function auth.uid() returns uuid language sql as 'select null::uuid';`);
 const files=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f<='20261029132229_harden_guest_voting.sql').sort();
 for(const file of files)await sql.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
 async function actor(){const id=randomUUID();await q('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);return id}
 let editionNumber=0;
 async function edition(){editionNumber++;return (await q("insert into tournaments(edition,theme,status,registration_ends,starts_at) values($1,'Isolated bid fixture','registration',now()+interval '23 hours',now()+interval '24 hours') returning id",[editionNumber]))[0].id}
 const inventory=async t=>(await q('select promotion_inventory($1) v',[t]))[0].v;
 const details={name:'Fixture sponsor',url:'https://example.org',tagline:'Local fixtures only'};
 async function reserve(t,bids,user,request=randomUUID()){user??=await actor();await q('select reserve_promotion($1,$2,$3,$4,$5,$6)',[user,t,Object.keys(bids).map(Number),request,details,bids]);return request}
 const pay=async(order,amount,event=randomUUID(),intent=randomUUID())=>(await q("select fulfill_promotion($1,'checkout.session.completed',$2,$3,$4,$5,'usd') v",[event,order,'cs_'+order,intent,amount]))[0].v;
 const t=await edition(),buyer=await actor();
 assert.ok((await inventory(t)).every(s=>s.minimum_bid===10000&&s.current_amount===null));
 for(const bids of [{1:9999},{1:10000.5},{1:'10000'},{1:1e9}])await assert.rejects(reserve(t,bids));
 await assert.rejects(q('select reserve_promotion($1,$2,$3,$4,$5)',[buyer,t,[1],randomUUID(),details]),/enter a bid/);
 await assert.rejects(q('select reserve_promotion($1,$2,$3,$4,$5,$6)',[buyer,t,[1],randomUUID(),details,{1:10000,2:10000}]),/exactly one bid/);
 const first=await reserve(t,{1:15000,2:10000},buyer);
 const order=(await q('select amount,pricing_version,slot_amounts from promotion_orders where id=$1',[first]))[0];
 assert.deepEqual(order,{amount:25000,pricing_version:4,slot_amounts:{1:15000,2:10000}});
 assert.equal(await reserve(t,{1:15000,2:10000},buyer,first),first);
 await assert.rejects(reserve(t,{1:15001,2:10000},buyer,first),/mismatch/);
 await assert.rejects(q('update promotion_orders set amount=1 where id=$1',[first]),/immutable/);
 await assert.rejects(q('update promotion_orders set slot_amounts=$1 where id=$2',[{1:10000,2:10000},first]),/immutable/);
 await assert.rejects(pay(first,20000),/amount or currency mismatch/);
 const event=randomUUID(),intent=randomUUID();assert.equal(await pay(first,25000,event,intent),'paid');
 assert.equal(await pay(first,25000,event,intent),'duplicate');
 let cards=await inventory(t);
 assert.equal(cards[0].current_amount,15000);assert.equal(cards[0].minimum_bid,15100);assert.equal(cards[1].minimum_bid,10100);
 checks.push('opening $100 bids, custom per-card amounts, exact payment totals, idempotent requests and immutable contracts');
 for(const amount of [10000,15000,15099])await assert.rejects(reserve(t,{1:amount}),/at least/);
 const replacement=await reserve(t,{1:15100,2:12000});
 cards=await inventory(t);assert.equal(cards[0].current_amount,15000);assert.equal(cards[0].bookable,false);
 await assert.rejects(reserve(t,{1:50000}),/Another checkout/);
 assert.equal(await pay(replacement,27100),'paid');
 cards=await inventory(t);assert.equal(cards[0].current_amount,15100);assert.equal(cards[0].minimum_bid,15200);assert.equal(cards[1].minimum_bid,12100);
 assert.equal((await q('select status from promotion_orders where id=$1',[first]))[0].status,'superseded');
 assert.equal(await pay(first,25000,randomUUID(),intent),'duplicate');assert.equal((await inventory(t))[0].current_amount,15100);
 checks.push('same-price and under-$1 takeovers rejected; exact $1 and higher bids accepted; current ad survives pending checkout and webhook replay');
 const stale=await reserve(t,{1:16000,2:13000});
 await q("update promotion_orders set reserved_until=now()-interval '1 minute' where id=$1",[stale]);
 const fresh=await reserve(t,{1:17000});
 assert.equal(await pay(stale,29000),'refund_pending');assert.equal((await inventory(t))[0].current_amount,15100);
 assert.equal(await pay(fresh,17000),'paid');
 const refunded=await reserve(t,{1:17100}),refundIntent=randomUUID();
 await q("select promotion_signal($1,'charge.refunded',$2,$3,'refunded')",[randomUUID(),refunded,refundIntent]);
 assert.equal(await pay(refunded,17100,randomUUID(),refundIntent),'refunded');assert.equal((await inventory(t))[0].current_amount,17000);
 checks.push('overlapping or refunded late payments do not displace the verified current sponsor');
 const pending=await reserve(t,{3:10000}),next=await edition();
 await q("update tournaments set registration_ends=now()-interval '2 minutes',starts_at=now()-interval '1 minute' where id=$1",[next]);
 // Old status and its natural spotlight deadline have not advanced. The successor is the hard cutoff.
 assert.ok((await inventory(t)).every(s=>s.state==='closed'&&s.name===null&&s.url===null));
 await assert.rejects(reserve(t,{4:10000}),/closed/);assert.equal(await pay(pending,10000),'refund_pending');
 assert.ok((await inventory(next)).every(s=>s.state==='available'&&s.minimum_bid===10000&&s.current_amount===null));
 // Mark the successor as having actually run, so registration postponement cannot move its start.
 await q("update tournaments set status='completed',archived=true where id=$1",[next]);
 await q('select tick()');
 assert.ok((await q('select order_id,pending_order_id from promotion_slots where tournament_id=$1',[t])).every(s=>s.order_id===null&&s.pending_order_id===null));
 assert.equal((await q('select status from promotion_orders where id=$1',[fresh]))[0].status,'expired');
 assert.equal(await pay(fresh,17000,randomUUID(),randomUUID()),'refund_pending');
 // A completed/archived next edition must not resurrect older paid placements.
 await q("update tournaments set status='completed',archived=true where id=$1",[next]);
 assert.ok((await inventory(t)).every(s=>s.state==='closed'));
 checks.push('successor start hides old ads without cron, rejects late payment, clears pointers, resets new cards to $100 and never resurrects archived sponsors');
 for(const role of ['anon','authenticated']){
  await sql.exec(`set role ${role}`);await assert.rejects(q('select * from promotion_orders'),/permission denied/);
  await assert.rejects(q('select reserve_promotion($1,$2,$3,$4,$5,$6)',[buyer,t,[1],randomUUID(),details,{1:10000}]),/permission denied/);await sql.exec('reset role');
 }
 checks.push('private records and bidding commands remain inaccessible to browser roles');
 const result={passed:true,migrations:files.length,checks,scope:'Isolated embedded PostgreSQL fixtures only. No hosted records or Stripe objects created. Embedded requests are serialized; independent hosted connection races are not simulated.'};
 fs.writeFileSync('artifacts/sponsor-bid-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Sponsor bid checks failed:',error.message,'SQL code:',error.code||'n/a','Completed:',checks);process.exitCode=1}finally{await sql.close()}
