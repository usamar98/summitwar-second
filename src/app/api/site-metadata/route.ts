import {requireUser,rpc} from '@/lib/supabase';
import {siteMetadata} from '@/lib/site-metadata';
import {submissionSchema} from '@/lib/validation';
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403});try{const u=await requireUser();await rpc('limit_site_lookup',{p_actor:u.id});const {url}=await req.json();const parsed=submissionSchema.shape.url.parse(url);const metadata=await siteMetadata(parsed);return Response.json({...metadata,logo_url:`${new URL(req.url).origin}/api/site-icon?url=${encodeURIComponent(metadata.favicon)}`});}catch(e){return Response.json({error:e instanceof Error?e.message:'Could not read website metadata'},{status:400})}}
