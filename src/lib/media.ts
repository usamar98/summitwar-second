import 'server-only';
// OG renderers only retrieve logos from our own managed storage. Other hosted logos
// remain visible in the browser but use initials in server-rendered graphics.
export function safeCardLogo(url:string){try{const u=new URL(url);const storage=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL||'https://invalid.local');return u.protocol==='https:'&&u.origin===storage.origin&&u.pathname.startsWith('/storage/v1/object/public/product-media/')?url:null}catch{return null}}
