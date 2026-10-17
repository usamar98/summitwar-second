import {createHash,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {db} from '@/lib/supabase';

export async function record(req:Request,id:string,kind:'view'|'outbound'){if(/bot|crawler|spider|preview|headless/i.test(req.headers.get('user-agent')||''))return;const jar=await cookies();let visitor=jar.get('sw_visitor')?.value;if(!visitor){visitor=randomUUID();jar.set('sw_visitor',visitor,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:86400*365,path:'/'});}const {data:p}=await db().from('products').select('id').eq('id',id).eq('published',true).maybeSingle();if(!p)return;const {error}=await db().from('analytics_events').upsert({product_id:id,kind,visitor_hash:createHash('sha256').update(visitor).digest('hex'),bucket:new Date().toISOString().slice(0,10)},{onConflict:'product_id,kind,visitor_hash,bucket',ignoreDuplicates:true});if(error)throw error;}
