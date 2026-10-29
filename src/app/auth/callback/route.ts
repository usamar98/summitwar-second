import {auth} from '@/lib/supabase';
import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {AUTH_RETURN_COOKIE,safeAuthReturn} from '@/lib/auth-return';
export async function GET(req:Request){const url=new URL(req.url);const code=url.searchParams.get('code');const token=url.searchParams.get('token_hash');const jar=await cookies();const next=safeAuthReturn(jar.get(AUTH_RETURN_COOKIE)?.value);jar.delete(AUTH_RETURN_COOKIE);const client=await auth();const result=code?await client.auth.exchangeCodeForSession(code):token?await client.auth.verifyOtp({token_hash:token,type:'email'}):{error:true};const failure=next==='/dashboard'?'/login?error=Authentication%20failed':`/login?mode=vote&next=${encodeURIComponent(next)}&error=Authentication%20failed`;return NextResponse.redirect(new URL(result.error?failure:next,url.origin));}
