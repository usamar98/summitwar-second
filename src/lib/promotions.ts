import 'server-only';
import {configured,rpc} from './supabase';
import {PROMOTION_SLOTS,type PromotionSlot} from './promotion-slots';
export async function promotionInventory(tournament?:string){const empty=PROMOTION_SLOTS.map(s=>({...s,state:'closed' as const}));if(!tournament||!configured())return empty;try{return await rpc('promotion_inventory',{p_tournament:tournament}) as PromotionSlot[]}catch{console.warn('Promotion inventory unavailable; check the paid promotion migration.');return empty}}
export async function promotionEnd(tournament?:string){if(!tournament||!configured())return undefined;try{return await rpc('promotion_ends',{p_tournament:tournament}) as string}catch{return undefined}}
