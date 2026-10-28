import {randomUUID} from 'node:crypto';
import {requireUser,requireAdmin,rpc,db} from '@/lib/supabase';
import {submissionSchema,uuid} from '@/lib/validation';
import {checkout} from '@/lib/payments';
import {siteMetadata} from '@/lib/site-metadata';

export async function POST(req:Request){
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});
 try{
  const body=await req.json();const u=await requireUser();let result:unknown;
  if(body.action==='apply'||body.action==='apply_existing'){
   const slot=body.slot==null?null:Number(body.slot);if(slot!==null&&(!Number.isInteger(slot)||slot<1||slot>8))throw new Error('Choose a place from 1 to 8');
   let product:Record<string,unknown>={};let existing=null;
   if(body.action==='apply'){
    const p=submissionSchema.parse(body.product);await rpc('limit_site_lookup',{p_actor:u.id});const metadata=await siteMetadata(p.url);
    product={...p,x_handle:p.x_handle||null,tagline:metadata.tagline,logo_url:`${new URL(req.url).origin}/api/site-icon?url=${encodeURIComponent(metadata.favicon)}`,slug:`${p.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${randomUUID().slice(0,8)}`};
   }else existing=uuid.parse(body.product);
   const admission=await rpc('submit_application',{p_actor:u.id,p_tournament:uuid.parse(body.tournament),p_product:product,p_slot:slot,p_existing:existing});
   result=admission;
  }
  else if(body.action==='vote')throw new Error('Create a single-use voting link from the match page');
  else if(['follow','save','reply','read'].includes(body.action)){if(body.enabled!==undefined&&typeof body.enabled!=='boolean')throw new Error('Invalid preference');await rpc('community_command',{p_actor:u.id,p_action:body.action,p_product:body.product?uuid.parse(body.product):null,p_target:body.target?uuid.parse(body.target):null,p_body:body.action==='reply'?String(body.text||'').trim().slice(0,1500):null,p_enabled:body.enabled!==false});}
  else if(body.action==='feedback'){await rpc('add_feedback',{p_actor:u.id,p_product:uuid.parse(body.product),p_body:String(body.text).trim().slice(0,1500)});}
  else if(body.action==='report'){const {error}=await db().from('reports').insert({user_id:u.id,feedback_id:uuid.parse(body.feedback),reason:String(body.reason).slice(0,500)});if(error)throw error;}
  else if(body.action==='checkout')result=await checkout(uuid.parse(body.entry));
  else if(body.action==='admin'){await requireAdmin();result=await rpc('admin_command',{p_actor:u.id,p_action:body.command,p_target:body.target?uuid.parse(body.target):null,p_data:body.data||{}});}
  else throw new Error('Unknown action');
  return Response.json({ok:true,result});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Request failed'},{status:400});}
}
