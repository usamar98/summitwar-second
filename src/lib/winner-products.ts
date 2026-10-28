import 'server-only';
import {cache} from 'react';
import {configured,db} from './supabase';
import type {Product} from './types';

// Publication means organizer approval. Only an actual champion earns a startup page.
// Both inner joins are required: a confirmed entry alone must never grant a page.
const championRelation='entries!inner(champions!inner(tournament_id))';
type WinHistory={entries?:{champions?:{tournament_id:string}[]}[]};
function hasRecordedWin(record:WinHistory){return record.entries?.some(entry=>entry.champions?.some(champion=>Boolean(champion.tournament_id)))===true}
export const winnerProduct=cache(async(column:'id'|'slug',value:string):Promise<Product|null>=>{
 if(!configured())return null;
 const {data,error}=await db().from('products').select(`*,${championRelation}`).eq(column,value).eq('published',true).maybeSingle();
 if(error)throw new Error('Winner startup page is temporarily unavailable');
 if(!data||!hasRecordedWin(data))return null;
 const {entries:history,...product}=data;
 return product as Product;
});

export async function winnerProductIds(ids:string[]):Promise<Set<string>>{
 if(!ids.length||!configured())return new Set();
 const {data,error}=await db().from('products').select(`id,${championRelation}`).in('id',[...new Set(ids)]).eq('published',true);
 if(error)throw new Error('Winner startup pages are temporarily unavailable');
 return new Set((data||[]).filter(hasRecordedWin).map(product=>product.id));
}
