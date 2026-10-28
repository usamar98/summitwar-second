import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const sql=new PGlite({dataDir:'.tmp/sponsor-takeovers-'+randomUUID(),postgresqlconf:'shared_buffers = 8MB'});
const q=async(text,args=[])=>(await sql.query(text,args)).rows;
const checks=[];
try{
 await sql.exec(`create schema auth;create role anon;create role authenticated;create role service_role;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',created_at timestamptz default now()-interval '2 days');
 create function auth.uid() returns uuid language sql as 'select null::uuid';`);
 const files=fs.readdirSync('supabase/migrations').filter(file=>file.endsWith('.sql')&&file<='20261028161134_free_entries_sponsor_takeovers.sql').sort();
 for(const file of files.slice(0,-1))await sql.exec(fs.readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
 const actor=async()=>{const id=randomUUID();await q('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);return id};
 const admin=await actor();await q('insert into admin_roles values($1)',[admin]);
 let number=0;
 async function edition(){number++;await q('update edition_counter set last_edition=$1',[number]);return (await q("insert into tournaments(edition,theme,status,fee_amount_cents,registration_ends,starts_at) values($1,'Local verification','registration',$2,now()+interval '23 hours',now()+interval '24 hours') returning id",[number,number===1?0:500]))[0].id}
 const product=name=>({name,url:'https://example.org/'+randomUUID(),slug:randomUUID(),tagline:'Local fixture',logo_url:'https://example.org/favicon.ico',founder:'Fixture founder',category:'Tools'});
 const inventory=async t=>(await q('select promotion_inventory($1) value',[t]))[0].value;
 async function reserve(t,slots,name='New sponsor',user,request=randomUUID()){user??=await actor();await q('select reserve_promotion($1,$2,$3,$4,$5)',[user,t,slots,request,product(name)]);return request}
 const pay=async(order,amount,event=randomUUID(),intent=randomUUID())=>(await q("select fulfill_promotion($1,'checkout.session.completed',$2,$3,$4,$5,'usd') result",[event,order,'cs_'+order,intent,amount]))[0].result;
 const oldEdition=await edition(),oldOrder=await reserve(oldEdition,[1],'Historical sponsor');
 const legacyPaidEdition=await edition(),founder=await actor();
 const entry=(await q('select submit_application($1,$2,$3,1) value',[founder,legacyPaidEdition,product('Legacy applicant')]))[0].value;
 assert.equal(entry.fee,500);
 const reservation=(await q('select id from reservations where entry_id=$1',[entry.entry]))[0].id;
 await sql.exec(fs.readFileSync('supabase/migrations/'+files.at(-1),'utf8'));
 assert.deepEqual((await q('select amount,pricing_version from promotion_orders where id=$1',[oldOrder]))[0],{amount:7000,pricing_version:2});
 assert.equal(await pay(oldOrder,7000),'paid');checks.push('historical sponsor checkout keeps its agreed amount');
 assert.ok((await q('select fee_amount_cents from tournaments')).every(t=>t.fee_amount_cents===0));
 assert.equal((await q('select status from entries where id=$1',[entry.entry]))[0].status,'pending');
 assert.equal((await q("select fulfill_payment('late-entry','checkout.session.completed',$1,'legacy-checkout','legacy-intent',500,'usd',$2) result",[entry.entry,reservation]))[0].result,'refund_pending');
 assert.equal((await q('select released from reservations where id=$1',[reservation]))[0].released,false);
 checks.push('existing editions become free; late entry charges queue refunds without releasing the free application');

 const t=await edition(),buyer=await actor(),first=await reserve(t,[1,2,3,4,5,6],'Original sponsor',buyer);
 assert.deepEqual((await q('select amount,pricing_version from promotion_orders where id=$1',[first]))[0],{amount:60000,pricing_version:3});
 assert.ok((await inventory(t)).every(s=>s.state==='reserved'&&!s.name&&!s.bookable));
 await assert.rejects(reserve(t,[2],'Blocked checkout'));
 await assert.rejects(reserve(t,[1,1]));await assert.rejects(reserve(t,[7]));await assert.rejects(pay(first,1));
 const event=randomUUID(),intent=randomUUID();assert.equal(await pay(first,60000,event,intent),'paid');
 assert.equal(await pay(first,60000,event,intent),'duplicate');
 assert.equal(await pay(first,60000,randomUUID(),intent),'duplicate');
 assert.ok((await inventory(t)).every(s=>s.price===10000&&s.state==='paid'&&s.bookable));
 checks.push('six $100 cards total $600; unpaid details stay hidden; reservations and webhook replay are protected');

 const revision=(await q('select live_revision($1) value',[t]))[0].value;
 const partial=await reserve(t,[1,4],'Replacement sponsor');
 let cards=await inventory(t);assert.ok(cards.every(s=>s.name==='Original sponsor'));
 assert.equal(cards.find(s=>s.position===1).bookable,false);assert.equal(cards.find(s=>s.position===2).bookable,true);
 await assert.rejects(reserve(t,[4],'Overlapping checkout'));
 assert.equal(await pay(partial,20000),'paid');cards=await inventory(t);
 assert.ok(cards.filter(s=>[1,4].includes(s.position)).every(s=>s.name==='Replacement sponsor'));
 assert.ok(cards.filter(s=>![1,4].includes(s.position)).every(s=>s.name==='Original sponsor'));
 assert.equal((await q('select status from promotion_orders where id=$1',[first]))[0].status,'paid');
 assert.notEqual((await q('select live_revision($1) value',[t]))[0].value,revision);
 const rest=await reserve(t,[2,3,5,6],'Last four replacement');assert.equal(await pay(rest,40000),'paid');
 assert.equal((await q('select status from promotion_orders where id=$1',[first]))[0].status,'superseded');
 assert.equal((await q('select status from promotion_payments where order_id=$1',[first]))[0].status,'paid');
 assert.equal(await pay(first,60000,randomUUID(),intent),'duplicate');
 assert.ok((await inventory(t)).every(s=>s.name!=='Original sponsor'));
 checks.push('verified payment swaps only selected cards, keeps the current ad during checkout, records full takeovers and never restores a displaced ad on replay');

 const abandoned=await reserve(t,[1,2],'Abandoned replacement');
 await q("update promotion_orders set reserved_until=now()-interval '1 minute' where id=$1",[abandoned]);
 const fresh=await reserve(t,[1],'Fresh replacement');
 assert.equal(await pay(abandoned,20000),'refund_pending');
 assert.equal((await inventory(t)).find(s=>s.position===1).name,'Replacement sponsor');
 assert.equal(await pay(fresh,10000),'paid');
 const refunded=await reserve(t,[1],'Refunded replacement'),refundIntent=randomUUID();
 await q("select promotion_signal($1,'charge.refunded',$2,$3,'refunded')",[randomUUID(),refunded,refundIntent]);
 assert.equal(await pay(refunded,10000,randomUUID(),refundIntent),'refunded');
 assert.equal((await inventory(t)).find(s=>s.position===1).name,'Fresh replacement');
 assert.equal((await inventory(t)).find(s=>s.position===1).bookable,true);
 checks.push('abandoned, overlapping, refunded and late replacement payments cannot remove the current sponsor');

 const newEdition=await edition(),founders=[];
 for(let slot=1;slot<=8;slot++){
  const owner=await actor();founders.push(owner);
  const result=(await q('select submit_application($1,$2,$3,$4) value',[owner,newEdition,product('Free app '+slot),slot]))[0].value;
  assert.equal(result.fee,0);assert.equal(result.status,'pending');
  await q("select admin_command($1,'approve',$2)",[admin,result.entry]);
 }
 assert.equal((await q("select count(*)::int n from entries where tournament_id=$1 and status='confirmed'",[newEdition]))[0].n,8);
 assert.equal((await q("select count(*)::int n from payments p join entries e on e.id=p.entry_id where e.tournament_id=$1",[newEdition]))[0].n,0);
 await assert.rejects(q('select submit_application($1,$2,$3,1)',[await actor(),newEdition,product('Ninth app')]));
 await assert.rejects(q('select submit_application($1,$2,$3,1)',[founders[0],newEdition,product('Second app')]));
 await q("update tournaments set registration_ends=now()-interval '1 minute',starts_at=now()+interval '1 hour' where id=$1",[newEdition]);
 await q('select tick()');
 // The planner only opens a successor if no other registration is open.
 await q("update tournaments set status='completed',archived=true where id<>$1 and status='registration'",[newEdition]);
 await q('select tick()');
 assert.ok((await q('select fee_amount_cents from tournaments')).every(x=>x.fee_amount_cents===0));
 assert.equal((await q('select fee_amount_cents from tournaments where previous_tournament_id=$1',[newEdition]))[0].fee_amount_cents,0);
 const draft=(await q("select admin_command($1,'create',null,$2) result",[admin,{theme:'Published free',registration_ends:new Date(Date.now()+23*3600000).toISOString(),starts_at:new Date(Date.now()+24*3600000).toISOString()}]))[0].result;
 await q("select admin_command($1,'publish',$2)",[admin,draft.id]);
 assert.equal((await q('select fee_amount_cents from tournaments where id=$1',[draft.id]))[0].fee_amount_cents,0);
 checks.push('later editions, organizer publication and automatic pre-entry stay free; eight founder capacity, uniqueness and review remain enforced');

 for(const role of ['anon','authenticated']){
  await sql.exec(`set role ${role}`);
  await assert.rejects(q('select * from promotion_slots'));
  await assert.rejects(q('select reserve_promotion($1,$2,$3,$4,$5)',[buyer,t,[1],randomUUID(),product('Denied')]));
  await assert.rejects(q('select promotion_price(1)'));
  await sql.exec('reset role');
 }
 checks.push('private sponsorship records and booking commands remain inaccessible to browser roles');
 const result={passed:true,migrations:files.length,checks,scope:'Isolated embedded PostgreSQL; no production fixtures, Stripe objects, charges or refunds. Requests are serialized by the embedded engine; hosted independent-connection contention remains outside this check.'};
 fs.writeFileSync('artifacts/sponsor-takeover-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Sponsor takeover checks failed:',error.message,'SQL code:',error.code||'n/a','Completed:',checks);process.exitCode=1}finally{await sql.close()}
