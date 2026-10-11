import {randomUUID} from 'node:crypto';
import {requireUser,requireAdmin,rpc,db} from '@/lib/supabase';
import {productSchema,uuid} from '@/lib/validation';
import {checkout} from '@/lib/payments';
export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
  const body=await req.json();const u=await requireUser();let result:unknown;
  if(body.action==='apply'){const p=productSchema.parse(body.product);result=await rpc('apply_product',{p_actor:u.id,p_tournament:uuid.parse(body.tournament),p_product:{...p,x_handle:p.x_handle||null,offer_url:p.offer_url||null,slug:`${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${randomUUID().slice(0,8)}`}});}
  else if(body.action==='apply_existing')result=await rpc('apply_existing',{p_actor:u.id,p_tournament:uuid.parse(body.tournament),p_product:uuid.parse(body.product)});
  else if(body.action==='vote'){if(body.confirm!==true)throw new Error('Confirm your final vote');await rpc('cast_vote',{p_actor:u.id,p_match:uuid.parse(body.match),p_entry:uuid.parse(body.entry)});}
  else if(body.action==='feedback'){await rpc('add_feedback',{p_actor:u.id,p_product:uuid.parse(body.product),p_body:String(body.text).trim().slice(0,1500)});}
  else if(body.action==='report'){const {error}=await db().from('reports').insert({user_id:u.id,feedback_id:uuid.parse(body.feedback),reason:String(body.reason).slice(0,500)});if(error)throw error;}
  else if(body.action==='checkout')result=await checkout(uuid.parse(body.entry));
  else if(body.action==='admin'){await requireAdmin();result=await rpc('admin_command',{p_actor:u.id,p_action:body.command,p_target:body.target?uuid.parse(body.target):null,p_data:body.data||{}});}
  else throw new Error('Unknown action');
  return Response.json({ok:true,result});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Request failed'},{status:400});}
}
