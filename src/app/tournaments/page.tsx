import Link from 'next/link';
import {configured,db} from '@/lib/supabase';
import {Empty} from '@/components/ui';
import {LocalTime} from '@/components/widgets';
export const dynamic='force-dynamic';
export default async function Tournaments(){const {data}=configured()?await db().from('tournaments').select('*').not('edition','is',null).order('edition',{ascending:false}):{data:[]};return <div className="page"><p className="eyebrow">THE TOURNAMENT ARCHIVE</p><h1>Every climb has a story.</h1><p className="lede">Past battles, current contenders, and the next chance at the summit.</p>{data?.length?data.map(t=><Link className="panel row" style={{display:'flex',justifyContent:'space-between'}} key={t.id} href={`/tournaments/${t.id}`}><div><p className="eyebrow">EDITION #{t.edition} · {t.fee_amount_cents===0?'FREE':'$5 ENTRY'}</p><h3>{t.theme}</h3><LocalTime value={t.starts_at}/></div><span className="status">{t.status} ↗</span></Link>):<Empty title="A new tradition starts here" body="The first edition will appear when the organizer publishes its schedule." href="/submit" label="Explore the entry flow"/>}</div>}
