import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
export function db() { if (!configured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase is not configured'); return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {auth:{persistSession:false,autoRefreshToken:false}}); }
export async function auth() { if (!configured()) throw new Error('Authentication requires Supabase setup'); const jar=await cookies(); return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {cookies:{getAll:()=>jar.getAll(),setAll:values=>{try { values.forEach(({name,value,options})=>jar.set(name,value,options)); } catch { /* Server Component cannot write cookies; route handlers refresh. */ }}}}); }
export async function user() { if (!configured()) return null; const client=await auth(); const {data:{user},error}=await client.auth.getUser(); return error?null:user; }
export async function requireUser() { const u=await user(); if (!u || (!u.email_confirmed_at && !u.identities?.some(i=>i.provider==='github'))) throw new Error('Sign in with a verified email or GitHub account'); return u; }
export async function requireAdmin() { const u=await requireUser(); const {data}=await db().from('admin_roles').select('user_id').eq('user_id',u.id).maybeSingle(); if (!data) throw new Error('Admin access required'); return u; }
export async function rpc(name:string,args:Record<string,unknown>={}) { const {data,error}=await db().rpc(name,args); if(error) throw new Error(error.message); return data; }
