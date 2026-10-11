import {auth} from '@/lib/supabase';
import {NextResponse} from 'next/server';
export async function GET(req:Request){const url=new URL(req.url);const code=url.searchParams.get('code');const token=url.searchParams.get('token_hash');const client=await auth();const result=code?await client.auth.exchangeCodeForSession(code):token?await client.auth.verifyOtp({token_hash:token,type:'email'}):{error:true};return NextResponse.redirect(new URL(result.error?'/login?error=Authentication%20failed':'/dashboard',url.origin));}
