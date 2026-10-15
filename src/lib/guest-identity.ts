import 'server-only';
import {createHmac,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
export const VOTER_COOKIE='sw_voter';
function secret(){const key=process.env.VOTER_COOKIE_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key||key.length<32)throw new Error('Voting identity is not configured');return key}
const mac=(text:string)=>createHmac('sha256',secret()).update(text).digest('hex');
export function newVoterCookie(now=Date.now()){const data=`v1.${randomBytes(32).toString('base64url')}.${Math.floor(now/1000)+365*86400}`;return `${data}.${mac(data)}`}
export function voterHash(cookie:string|undefined,now=Date.now()){if(!cookie||cookie.length>256)return null;const fields=cookie.split('.');if(fields.length!==4||fields[0]!=='v1'||!/^[A-Za-z0-9_-]{43}$/.test(fields[1])||!/^\d{10}$/.test(fields[2])||!/^[a-f0-9]{64}$/.test(fields[3])||Number(fields[2])*1000<=now)return null;try{const signature=mac(fields.slice(0,3).join('.'));if(!timingSafeEqual(Buffer.from(signature),Buffer.from(fields[3])))return null;return mac('voter:'+fields[1])}catch{return null}}
export function newVotingToken(){return randomBytes(32).toString('base64url')}
export function votingTokenHash(token:unknown){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Invalid voting link');return createHash('sha256').update(token).digest('hex')}
export function normalizeVoterHandle(value:unknown){if(value==null||value==='')return null;if(typeof value!=='string')throw new Error('Enter a valid X handle');const handle=value.trim().replace(/^@/,'').toLowerCase();if(!handle)return null;if(!/^[a-z0-9_]{1,15}$/.test(handle))throw new Error('Use 1–15 letters, numbers or underscores for your X handle');return handle}
