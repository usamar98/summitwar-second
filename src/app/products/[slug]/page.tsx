import {notFound} from 'next/navigation';
import Link from 'next/link';
import {db,user} from '@/lib/supabase';
import {winnerProduct} from '@/lib/winner-products';
import {CommunityActions} from '@/components/community-actions';
import {Pitch} from '@/components/ui';
import {Feedback} from '@/components/feedback';
import {Share,TrackView} from '@/components/widgets';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=await winnerProduct('slug',slug);return p?{title:p.name,description:p.tagline,openGraph:{images:[`/api/og/product/${p.id}`]}}:{title:'Startup page unavailable',robots:{index:false,follow:false}};}
export default async function ProductPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const p=await winnerProduct('slug',slug);if(!p)notFound();const u=await user();const {data:history}=await db().from('entries').select('id,status,tournament:tournaments(id,edition,status)').eq('product_id',p.id).eq('status','confirmed');const [{data:f},{data:s}]=u?await Promise.all([db().from('product_follows').select('product_id').eq('user_id',u.id).eq('product_id',p.id).maybeSingle(),db().from('saved_products').select('product_id').eq('user_id',u.id).eq('product_id',p.id).maybeSingle()]):[{data:null},{data:null}];return <div className="page"><p className="eyebrow">COMMUNITY CHAMPION · PERMANENT STARTUP PAGE</p><div className="two-columns"><Pitch product={p} directWebsite/></div>{p.published&&<><TrackView product={p.id}/><CommunityActions product={p.id} signedIn={Boolean(u)} following={Boolean(f)} saved={Boolean(s)}/><Feedback product={p.id}/></>}<section className="panel"><h3>Tournament history</h3>{history?.length?history.map(e=>{const t=e.tournament as unknown as {id:string;edition:number;status:string};return <p key={e.id}><Link className="text-link" href={`/tournaments/${t.id}`}>Edition #{t.edition} · {t.status} ↗</Link></p>}):<p>Awaiting confirmation for a tournament.</p>}</section><Share title={`${p.name} on SummitWar`} url={`${process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000'}/products/${slug}`}/></div>}
