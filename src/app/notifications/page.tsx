import Link from 'next/link';
import {redirect} from 'next/navigation';
import {user,db} from '@/lib/supabase';
import {LocalTime} from '@/components/widgets';
import {ActionButton} from '@/components/forms';
export const dynamic='force-dynamic';
export default async function Notifications(){const u=await user();if(!u)redirect('/login');const {data,error}=await db().from('notifications').select('id,message,href,read_at,created_at').eq('user_id',u.id).order('created_at',{ascending:false}).limit(100);if(error)throw error;return <div className="page narrow"><p className="eyebrow">YOUR INBOX</p><h1>Stay in the battle.</h1><p className="lede">Round openings, closing reminders, and founder replies appear here.</p>{data?.some(n=>!n.read_at)&&<ActionButton payload={{action:'read'}}>Mark all as read</ActionButton>}<div className="notification-list">{data?.length?data.map(n=><article className={`panel notification ${n.read_at?'read':'unread'}`} key={n.id}><p>{n.message}</p><small><LocalTime value={n.created_at}/></small><div className="row">{n.href&&n.href.startsWith('/')&&!n.href.startsWith('//')&&<Link className="text-link" href={n.href}>Open ↗</Link>}{!n.read_at&&<ActionButton payload={{action:'read',target:n.id}}>Mark read</ActionButton>}</div></article>):<p className="notice">Follow an app to get reminders when its next round opens or has 30 minutes left.</p>}</div></div>}
