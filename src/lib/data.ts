import 'server-only';
import {configured,db} from './supabase';
import type {Tournament,Product,Entry,Match} from './types';
export const preview = process.env.DEMO_MODE==='true' && process.env.NODE_ENV!=='production';
export async function tournamentData(id?:string) {
 if(!configured()) return {tournament:null as Tournament|null,entries:[] as Entry[],matches:[] as Match[],champion:null as {entry_id:string;spotlight_ends:string;tournament_id:string}|null};
 let q=db().from('tournaments').select('*').neq('status','draft');q=id?q.eq('id',id):q.eq('archived',false).order('edition',{ascending:false}).limit(30);
 const {data,error}=await q;if(error)throw new Error('Tournament data is temporarily unavailable');
 const rows=data as Tournament[];const t=id?rows[0]:rows.find(t=>['voting','locked'].includes(t.status))||rows.find(t=>t.status==='spotlight')||rows[0];
 if(!t)return {tournament:null,entries:[],matches:[],champion:null};
 const [e,m,c]=await Promise.all([db().from('entries').select('id,user_id,product_id,tournament_id,status,priority,snapshot,product:products(*)').eq('tournament_id',t.id).eq('status','confirmed'),db().from('matches').select('*').eq('tournament_id',t.id).order('round').order('position'),db().from('champions').select('*').order('spotlight_starts',{ascending:false}).limit(1).maybeSingle()]);
 if(e.error||m.error||c.error)throw new Error('Tournament data is temporarily unavailable');return {tournament:t,entries:e.data as unknown as Entry[],matches:m.data as Match[],champion:c.data};
}
export async function products() { if(!configured())return [] as Product[]; const {data,error}=await db().from('products').select('*').eq('published',true).order('name'); if(error)throw error; return data as Product[]; }
export async function availability(id:string) { if(!configured())return {confirmed:0,reserved:0,available:8}; return db().rpc('seat_availability',{p_tournament:id}).then(({data,error})=>{if(error)throw error;return data as {confirmed:number;reserved:number;available:number}}); }
