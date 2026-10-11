import {redirect} from 'next/navigation';
import {user,db} from '@/lib/supabase';
import {ProductCard,Empty} from '@/components/ui';
import {CommunityActions} from '@/components/community-actions';
import type {Product} from '@/lib/types';
export const dynamic='force-dynamic';
export default async function Collection(){const u=await user();if(!u)redirect('/login');const [{data:saved,error},{data:follows}]=await Promise.all([db().from('saved_products').select('product:products(*)').eq('user_id',u.id).order('created_at',{ascending:false}).limit(500),db().from('product_follows').select('product_id').eq('user_id',u.id)]);if(error)throw error;const products=(saved||[]).map(s=>s.product as unknown as Product).filter(p=>p?.published);return <div className="page"><p className="eyebrow">YOUR COLLECTION</p><h1>Good apps, kept close.</h1><p className="lede">Find your saved projects long after their tournament ends.</p>{products.length?<div className="products-grid">{products.map(p=><article key={p.id}><ProductCard product={p}/><CommunityActions product={p.id} signedIn saved following={follows?.some(f=>f.product_id===p.id)}/></article>)}</div>:<Empty title="Start your collection" body="Save an app from its project page or tournament row." href="/" label="Explore the tournament"/>}</div>}
