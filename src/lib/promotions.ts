import 'server-only';
import {configured,rpc,db} from './supabase';
import {PROMOTION_SLOTS,type PromotionSlot} from './promotion-slots';
import type {Tournament} from './types';
import {homepageTournament} from './home-tournament';
export async function promotionTournament(id?:string){
 if(!configured())return null;
 let query=db().from('tournaments').select('*').neq('status','draft').neq('status','cancelled');
 query=id?query.eq('id',id):query.eq('archived',false).not('edition','is',null).order('starts_at',{ascending:false}).limit(30);
 const {data,error}=await query;if(error)throw new Error('Sponsor tournament is temporarily unavailable');
 const rows=(data||[]) as Tournament[];if(id)return rows[0]||null;
 const started=rows.find(t=>Date.parse(t.starts_at)<=Date.now()&&['locked','voting','spotlight','completed'].includes(t.status));
 if(started){const end=await rpc('promotion_ends',{p_tournament:started.id}) as string;if(end==='infinity'||Date.parse(end)>Date.now())return started;}
 return homepageTournament(rows)||null;
}
export async function promotionInventory(tournament?:string){const empty=PROMOTION_SLOTS.map(s=>({...s,state:'closed' as const}));if(!tournament||!configured())return empty;try{return await rpc('promotion_inventory',{p_tournament:tournament}) as PromotionSlot[]}catch{console.warn('Promotion inventory unavailable; check the paid promotion migration.');return empty}}
export async function promotionEnd(tournament?:string){if(!tournament||!configured())return undefined;try{const end=await rpc('promotion_ends',{p_tournament:tournament}) as string;return Number.isFinite(Date.parse(end))?end:undefined}catch{return undefined}}
