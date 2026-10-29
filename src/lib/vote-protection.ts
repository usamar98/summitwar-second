import 'server-only';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
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
function addressParts(value:string){
 const ip=value.replace(/^\[|\]$/g,'');if(ip.includes('%')||!isIP(ip))throw new Error('Voting network could not be verified');
 if(isIP(ip)===4)return {address:ip,network:`v4:${ip}`};
 const hex=ip.replace(/(\d+\.\d+\.\d+\.\d+)$/,part=>{const bytes=part.split('.').map(Number);return ((bytes[0]<<8)|bytes[1]).toString(16)+':'+((bytes[2]<<8)|bytes[3]).toString(16)});
 const [left,right]=hex.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
 const words=(right===undefined?a:[...a,...Array(8-a.length-b.length).fill('0'),...b]).map(word=>parseInt(word,16));
 if(words.slice(0,5).every(word=>word===0)&&words[5]===65535){const ipv4=[words[6]>>8,words[6]&255,words[7]>>8,words[7]&255].join('.');return {address:ipv4,network:`v4:${ipv4}`}}
 return {address:words.map(word=>word.toString(16)).join(':'),network:`v6:${words.slice(0,4).map(word=>word.toString(16).padStart(4,'0')).join(':')}::/64`};
}
export function voteClientAddress(req:Request){
 // Production uses only Vercel's platform-supplied address, never arbitrary client proxy headers.
 const vercel=process.env.VERCEL==='1';
 if(process.env.NODE_ENV==='production'&&!vercel)throw new Error('Voting requires a trusted network proxy');
 const header=vercel?req.headers.get('x-vercel-forwarded-for'):req.headers.get('x-forwarded-for');
 const hostname=new URL(req.url).hostname;
 const raw=header?.trim()||(!vercel&&['localhost','127.0.0.1','[::1]'].includes(hostname)?'127.0.0.1':'');
 if(!raw||raw.includes(',')||raw.length>64)throw new Error('Voting network could not be verified');
 return addressParts(raw);
}
export function voteNetwork(req:Request){const key=process.env.VOTE_RISK_SALT||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||key.length<32)throw new Error('Voting network protection is not configured');return createHmac('sha256',key).update('vote-network:v1:'+voteClientAddress(req).network).digest('hex');}
