import {createHash,randomUUID} from 'node:crypto';
import {cookies} from 'next/headers';
import {configured,rpc} from '@/lib/supabase';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});
 const headers={'Cache-Control':'no-store'};
 if(!configured()||!process.env.SUPABASE_SERVICE_ROLE_KEY||/bot|crawler|spider|preview|headless/i.test(req.headers.get('user-agent')||''))return Response.json({counts:null},{headers});
 try{const jar=await cookies();let id=jar.get('sw_presence')?.value;if(!id||! /^[0-9a-f-]{36}$/i.test(id)){id=randomUUID();jar.set('sw_presence',id,{httpOnly:true,sameSite:'lax',secure:new URL(req.url).protocol==='https:',maxAge:86400*365,path:'/'});}const counts=await rpc('register_site_visit',{p_visitor:createHash('sha256').update(id).digest('hex')});return Response.json({counts},{headers});}catch{return Response.json({counts:null},{status:503,headers});}
}
