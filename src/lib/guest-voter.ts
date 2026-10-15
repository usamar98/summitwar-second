import 'server-only';
import {cookies} from 'next/headers';
import {VOTER_COOKIE,voterHash} from './guest-identity';
import {configured,db} from './supabase';
export async function currentVoter(){return voterHash((await cookies()).get(VOTER_COOKIE)?.value)}
export async function votedMatches(ids:string[],actor?:string){if(!ids.length||!configured())return [];const voter=await currentVoter();if(!voter&&!actor)return [];let q=db().from('votes').select('match_id').in('match_id',ids);q=voter&&actor?q.or(`voter_hash.eq.${voter},user_id.eq.${actor}`):voter?q.eq('voter_hash',voter):q.eq('user_id',actor!);const {data,error}=await q;if(error)throw new Error('Voting status is temporarily unavailable');return [...new Set((data||[]).map(v=>v.match_id))]}
