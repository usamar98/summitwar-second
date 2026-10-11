import 'server-only';
import {lookup} from 'node:dns/promises';
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';
import {normalizeUrl} from './rules';

export function publicAddress(address:string):boolean {
 if(isIP(address)===4){const [a,b,c]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0&&c===113));}
 if(isIP(address)===6){const v=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(v)&&!v.startsWith('2001:db8:')&&!v.startsWith('2001:0:')&&!v.startsWith('2002:');}
 return false;
}
export function publicUrl(value:string){normalizeUrl(value);const url=new URL(value);if(url.port&&url.port!==(url.protocol==='https:'?'443':'80'))throw new Error('Only standard website ports are supported');return url;}
// Pin the validated DNS address in the actual socket lookup. Validate redirects
// independently, cap bytes/time, and never forward user cookies or authorization.
export async function fetchPublic(value:string,maxBytes=1024*1024,redirects=3,deadline=Date.now()+18000):Promise<{body:Buffer;url:string;type:string}> {
 const url=publicUrl(value);let dnsTimer:ReturnType<typeof setTimeout>|undefined;const records=await Promise.race([lookup(url.hostname,{all:true}),new Promise<never>((_resolve,reject)=>{dnsTimer=setTimeout(()=>reject(new Error('Website DNS lookup timed out')),Math.max(1,Math.min(6000,deadline-Date.now())))})]).finally(()=>clearTimeout(dnsTimer));
 if(!records.length||records.some(r=>!publicAddress(r.address)))throw new Error('Website resolves to a restricted address');
 if(Date.now()>=deadline)throw new Error('Website lookup timed out');
 const target=records[0];
 const result=await new Promise<{status:number;location:string|undefined;body:Buffer;type:string}>((resolve,reject)=>{
  const request=(url.protocol==='https:'?httpsRequest:httpRequest)(url,{family:target.family,lookup:(_hostname,_options,callback)=>{callback(null,target.address,target.family)},headers:{'User-Agent':'SummitWarMetadata/1.0','Accept':'text/html,image/png,image/jpeg,image/webp,image/x-icon','Accept-Encoding':'identity'}},response=>{
   const chunks:Buffer[]=[];let size=0;
   response.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){request.destroy(new Error('Website response is too large'));return;}chunks.push(chunk)});
   response.on('error',reject);response.on('end',()=>resolve({status:response.statusCode||0,location:response.headers.location,body:Buffer.concat(chunks),type:String(response.headers['content-type']||'')}));
  });
  const timer=setTimeout(()=>request.destroy(new Error('Website lookup timed out')),Math.max(1,Math.min(8000,deadline-Date.now())));request.on('close',()=>clearTimeout(timer));request.on('error',reject);request.end();
 });
 if(result.status>=300&&result.status<400&&result.location){if(redirects<=0)throw new Error('Too many website redirects');return fetchPublic(new URL(result.location,url).toString(),maxBytes,redirects-1,deadline);}
 if(result.status<200||result.status>=300)throw new Error('Website did not respond successfully');
 return {body:result.body,url:url.toString(),type:result.type};
}
export function decodeText(value:string){return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(_m,code:string)=>{if(code[0]==='#'){const n=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):parseInt(code.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):''}return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[code.toLowerCase()]||''}).replace(/\s+/g,' ').trim();}
function attributes(tag:string){const out:Record<string,string>={};for(const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))out[m[1].toLowerCase()]=decodeText(m[2]??m[3]??m[4]);return out;}
export function parseSiteMetadata(html:string,website:string){
 // Script/style contents are excluded so embedded fake tags cannot become metadata.
 const clean=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<!--[\s\S]*?-->/g,'');const metas=new Map<string,string>();
 for(const m of clean.matchAll(/<meta\b[^>]*>/gi)){const a=attributes(m[0]);if(a.content)metas.set((a.property||a.name||'').toLowerCase(),a.content)}
 const title=(metas.get('og:site_name')||decodeText(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')).slice(0,80);
 const tagline=(metas.get('description')||metas.get('og:description')||metas.get('twitter:description')||'').slice(0,180);
 let favicon=new URL('/favicon.ico',website).toString();
 for(const m of clean.matchAll(/<link\b[^>]*>/gi)){const a=attributes(m[0]);if(a.href&&/(^|\s)(icon|apple-touch-icon)(\s|$)/i.test(a.rel||'')){try{const icon=publicUrl(new URL(a.href,website).toString());favicon=icon.toString();break}catch{/* Use same-site fallback. */}}}
 return {title,tagline,favicon};
}
export async function siteMetadata(website:string){const fetched=await fetchPublic(website);if(!/text\/html|application\/xhtml\+xml/i.test(fetched.type))throw new Error('Link must point to a website page');return parseSiteMetadata(fetched.body.toString('utf8'),fetched.url);}
