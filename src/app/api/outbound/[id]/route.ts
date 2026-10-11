import {db,configured} from '@/lib/supabase';
import {record} from '../../analytics/route';
import {NextResponse} from 'next/server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){if(!configured())return new Response('Not found',{status:404});const {id}=await params;const {data:p}=await db().from('products').select('url').eq('id',id).eq('published',true).maybeSingle();if(!p)return new Response('Not found',{status:404});await record(req,id,'outbound');return NextResponse.redirect(p.url);}
