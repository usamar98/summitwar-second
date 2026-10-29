import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {beforeAll,afterAll,it,expect} from 'vitest';
let sql:PGlite;
const q=async(text:string,args:unknown[]=[]) =>(await sql.query(text,args)).rows as any[];
beforeAll(async()=>{
 sql=new PGlite({dataDir:'.tmp/protected-sponsors-'+randomUUID(),postgresqlconf:'shared_buffers = 8MB'});
 await sql.exec(`create schema auth;create role anon;create role authenticated;create role service_role bypassrls;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',created_at timestamptz default now()-interval '2 days');
 create table auth.identities(user_id uuid references auth.users(id),provider text,provider_id text,unique(provider,provider_id));
 create function auth.uid() returns uuid language sql as 'select null::uuid';`);
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort())await sql.exec(readFileSync('supabase/migrations/'+file,'utf8').replace('create extension if not exists pgcrypto;',''));
},30000);
afterAll(async()=>{await sql?.close()});
async function actor(){const id=randomUUID();await q('insert into auth.users(id,email_confirmed_at) values($1,now())',[id]);return id}
async function battle(){
 const edition=(await q('select coalesce(max(edition),0)+1 n from tournaments'))[0].n;
 const t=(await q("insert into tournaments(edition,theme,status,registration_ends,starts_at,daily_cycle) values($1,'Isolated sponsorship fixture','voting',now()-interval '2 hours',now()-interval '1 hour',false) returning id",[edition]))[0].id;
 const entries=[];
 for(let i=0;i<8;i++){
  const user=await actor(),p=(await q("insert into products(owner_id,name,slug,url,logo_url,category,tagline,founder) values($1,'Fixture',$2,$3,'https://example.org/favicon.ico','Tools','Local only','Fixture') returning id",[user,randomUUID(),'https://example.org/'+randomUUID()]))[0].id;
  entries.push((await q("insert into entries(tournament_id,product_id,user_id,status,review_status,registration_slot,priority) values($1,$2,$3,'confirmed','approved',$4,$4) returning id",[t,p,user,i+1]))[0].id);
 }
 for(let i=0;i<4;i++)await q("insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values($1,1,$2,$3,$4,now()-interval '1 hour',now()+interval '23 hours')",[t,i+1,entries[i*2],entries[i*2+1]]);
 for(let i=0;i<2;i++)await q("insert into matches(tournament_id,round,position,entry_a,entry_b,starts_at,ends_at) values($1,2,$2,$3,$4,now()+interval '23 hours',now()+interval '47 hours')",[t,i+1,entries[i*4],entries[i*4+2]]);
 return t;
}
const details={name:'Local sponsor',url:'https://example.org',tagline:'Isolated fixture'};
async function reserve(t:string,plan='quarterfinal',slots=[1],user?:string,request=randomUUID()){
 user??=await actor();await q('select reserve_promotion($1,$2,$3,$4,$5,null,$6)',[user,t,slots,request,details,plan]);return request;
}
const inventory=async(t:string)=>(await q('select promotion_inventory($1) v',[t]))[0].v as any[];
const pay=async(order:string,amount:number,event=randomUUID(),intent=randomUUID())=>(await q("select fulfill_promotion($1,'checkout.session.completed',$2,$3,$4,$5,'usd') v",[event,order,'cs_'+order,intent,amount]))[0].v;
async function closeRound(t:string,round:number,results=true){
 await q("update tournaments set status='registration' where id=$1",[t]);
 await q("update matches set starts_at=now()-interval '2 hours',ends_at=now()-interval '1 minute' where tournament_id=$1 and round=$2",[t,round]);
 if(results)await q('update matches set winner_id=entry_a where tournament_id=$1 and round=$2',[t,round]);
 await q("update tournaments set status='voting' where id=$1",[t]);
}
it('charges exactly $100, $200 or $300 per card and freezes the plan and amount',async()=>{
 const t=await battle();
 for(const [i,plan] of ['quarterfinal','semifinal','tournament'].entries()){
  const owner=await actor(),id=await reserve(t,plan,[i+1],owner),o=(await q('select amount,slot_amounts,pricing_version,placement_plan from promotion_orders where id=$1',[id]))[0];
  expect(o).toEqual({amount:(i+1)*10000,slot_amounts:{[i+1]:(i+1)*10000},pricing_version:5,placement_plan:plan});
  expect(await reserve(t,plan,[i+1],owner,id)).toBe(id);
  if(i<2)await expect(reserve(t,'tournament',[i+1],owner,id)).rejects.toThrow('mismatch');
  if(i>0)await expect(q("update promotion_orders set placement_plan='quarterfinal' where id=$1",[id])).rejects.toThrow('immutable');
  await expect(q('update promotion_orders set amount=1 where id=$1',[id])).rejects.toThrow('immutable');
 }
 const all=await reserve(await battle(),'tournament',[1,2,3,4,5,6]);expect((await q('select amount from promotion_orders where id=$1',[all]))[0].amount).toBe(180000);
});
it('rejects old bids, unknown plans and tampered multi-card selections',async()=>{
 const t=await battle(),owner=await actor();
 await expect(reserve(t,'custom')).rejects.toThrow('fixed sponsorship plan');
 await expect(q('select reserve_promotion($1,$2,$3,$4,$5,$6)',[owner,t,[1],randomUUID(),details,{1:999999}])).rejects.toThrow('fixed sponsorship plan');
 for(const slots of [[],[1,1],[7]])await expect(reserve(t,'quarterfinal',slots)).rejects.toThrow('distinct');
});
it('never allows another buyer to reserve protected paid cards, including in a mixed selection',async()=>{
 const t=await battle(),first=await reserve(t);expect(await pay(first,10000)).toBe('paid');
 const card=(await inventory(t))[0];expect(card).toMatchObject({state:'paid',bookable:false,placement_plan:'quarterfinal',current_amount:10000});
 await expect(reserve(t,'tournament',[1,2])).rejects.toThrow('protected');expect((await inventory(t))[1].state).toBe('available');
 expect((await q('select count(*)::int n from promotion_orders where tournament_id=$1',[t]))[0].n).toBe(1);
});
it('keeps $100 sponsorship protected through late or partial quarterfinal results, then reopens at fixed remaining plan prices',async()=>{
 const t=await battle(),first=await reserve(t);await pay(first,10000);await closeRound(t,1,false);
 expect((await inventory(t))[0].state).toBe('paid');await expect(reserve(t,'semifinal')).rejects.toThrow('protected');
 await q('update matches set winner_id=entry_a where tournament_id=$1 and round=1 and position=1',[t]);expect((await inventory(t))[0].state).toBe('paid');
 await q('update matches set winner_id=entry_a where tournament_id=$1 and round=1 and winner_id is null',[t]);
 const released=(await inventory(t))[0];expect(released).toMatchObject({state:'available',bookable:true,name:null});expect(released.available_plans.map((p:any)=>[p.id,p.price])).toEqual([['semifinal',20000],['tournament',30000]]);
 await expect(reserve(t,'quarterfinal')).rejects.toThrow('no longer available');
 const next=await reserve(t,'semifinal');expect(await pay(next,20000)).toBe('paid');expect((await inventory(t))[0].current_amount).toBe(20000);
});
it('keeps $200 coverage through quarterfinal results and releases only after both semifinal results',async()=>{
 const t=await battle(),id=await reserve(t,'semifinal');await pay(id,20000);await closeRound(t,1);
 expect((await inventory(t))[0].state).toBe('paid');await closeRound(t,2,false);expect((await inventory(t))[0].state).toBe('paid');
 await q('update matches set winner_id=entry_a where tournament_id=$1 and round=2',[t]);
 expect((await inventory(t))[0]).toMatchObject({state:'available',price:30000,bookable:true});
 const next=await reserve(t,'tournament');expect(await pay(next,30000)).toBe('paid');
});
it('protects $300 through the spotlight and a postponed successor, then clears every old sponsor at the successor start',async()=>{
 const t=await battle(),id=await reserve(t,'tournament');await pay(id,30000);await closeRound(t,1);await closeRound(t,2);
 const next=await battle();await q("update tournaments set status='registration' where id=$1",[next]);await q("update tournaments set starts_at=now()+interval '4 days',registration_ends=now()+interval '3 days' where id=$1",[next]);
 await q("update tournaments set status='completed' where id=$1",[t]);expect((await inventory(t))[0]).toMatchObject({state:'paid',bookable:false});
 await expect(reserve(t,'tournament')).rejects.toThrow('protected');
 await q("update tournaments set starts_at=now()-interval '1 minute',registration_ends=now()-interval '2 minutes' where id=$1",[next]);
 expect((await inventory(t)).every(s=>s.state==='closed'&&s.name===null)).toBe(true);
 expect((await inventory(next)).every(s=>s.state==='available')).toBe(true);
 await expect(reserve(t,'tournament')).rejects.toThrow('no longer available');
});
it('keeps checkout holds exclusive and refunds stale or late payments instead of replacing a protected purchase',async()=>{
 const t=await battle(),old=await reserve(t),otherOwner=await actor();
 await expect(reserve(t,'tournament',[1],otherOwner)).rejects.toThrow('Another checkout');
 await q("update promotion_orders set reserved_until=now()-interval '1 minute' where id=$1",[old]);
 const fresh=await reserve(t,'tournament',[1],otherOwner);expect(await pay(fresh,30000)).toBe('paid');expect(await pay(old,10000)).toBe('refund_pending');
 expect((await inventory(t))[0]).toMatchObject({state:'paid',placement_plan:'tournament',current_amount:30000});
 const late=await reserve(t,'quarterfinal',[2]);await closeRound(t,1);expect(await pay(late,10000)).toBe('refund_pending');
 const event=randomUUID(),intent=randomUUID(),id=await reserve(t,'semifinal',[3]);expect(await pay(id,20000,event,intent)).toBe('paid');expect(await pay(id,20000,event,intent)).toBe('duplicate');
});
it('enforces exact payment amounts and denies browser access to protected plan commands',async()=>{
 const t=await battle(),id=await reserve(t,'semifinal');await expect(pay(id,10000)).rejects.toThrow('amount or currency mismatch');
 for(const role of ['anon','authenticated']){await sql.exec(`set role ${role}`);try{await expect(q('select promotion_plans($1)',[t])).rejects.toThrow('permission denied');await expect(q('select promotion_protected($1)',[id])).rejects.toThrow('permission denied')}finally{await sql.exec('reset role')}}
});
it('keeps whole-tournament sponsors protected when a successor has not been published yet',async()=>{
 const t=await battle(),id=await reserve(t,'tournament');await pay(id,30000);
 await q("update tournaments set status='registration' where id=$1",[t]);
 await q("update tournaments set starts_at=now()-interval '4 days',registration_ends=now()-interval '5 days',status='completed' where id=$1",[t]);
 expect((await q('select promotion_ends($1)::text v',[t]))[0].v).toBe('infinity');
 expect((await inventory(t))[0]).toMatchObject({state:'paid',bookable:false,locked_until:null});
 expect((await inventory(t))[1].available_plans.find((p:any)=>p.id==='tournament').ends).toBeNull();
 await expect(reserve(t,'tournament')).rejects.toThrow('protected');
});
it('lets the real server role verify founders, reserve and fulfill plans without access to Auth metadata',async()=>{
 const t=await battle(),owner=await actor();
 await sql.exec('set role service_role');
 try{const id=await reserve(t,'semifinal',[1],owner);expect(await pay(id,20000)).toBe('paid');expect((await inventory(t))[0]).toMatchObject({placement_plan:'semifinal',bookable:false});await expect(q('select raw_app_meta_data from auth.users')).rejects.toThrow('permission denied')}
 finally{await sql.exec('reset role')}
});
