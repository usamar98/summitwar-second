import 'server-only';
import {createHmac} from 'node:crypto';
const localSiteKey='1x00000000000000000000AA';
const localSecretKey='1x0000000000000000000000000000000AA';
const localToken='XXXX.DUMMY.TOKEN.XXXX';
export async function verifyVoteChallenge(req:Request,token:unknown,required=false){
 const secret=process.env.TURNSTILE_SECRET_KEY,siteKey=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
 if(required&&(!secret||!siteKey))throw new Error('Vote verification is temporarily unavailable');
 if(!secret){if(siteKey)throw new Error('Vote verification is temporarily unavailable');return;}
 const hostname=new URL(req.url).hostname;
 // Cloudflare's documented dummy response does not carry the real host/action.
 // Accept it only with the exact test pair on a loopback development server.
 const localTest=process.env.NODE_ENV==='development'&&['localhost','127.0.0.1','[::1]'].includes(hostname)&&siteKey===localSiteKey&&secret===localSecretKey;
 if((siteKey===localSiteKey||secret===localSecretKey)&&!localTest)throw new Error('Vote verification is temporarily unavailable');
 if(typeof token!=='string'||!token||token.length>2048||(localTest&&token!==localToken))throw new Error('Complete the vote verification');
 let result:{success?:boolean;hostname?:string;action?:string};
 try{const res=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret,response:token}),signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error();result=await res.json();}catch{throw new Error('Verification unavailable. Please try again.');}
 if(!result.success||(!localTest&&(result.hostname!==hostname||result.action!=='vote')))throw new Error('Vote verification expired or failed. Please try again.');
}
export function voteNetwork(req:Request,userId:string){const raw=req.headers.get('x-vercel-forwarded-for')||req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for');const identifier=raw?.split(',')[0].trim()||userId;return createHmac('sha256',process.env.VOTE_RISK_SALT||process.env.SUPABASE_SERVICE_ROLE_KEY||'local-unconfigured').update(identifier).digest('hex');}
