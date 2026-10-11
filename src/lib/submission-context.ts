import 'server-only';
import {user,configured,db} from './supabase';
import {availability} from './data';
export async function submissionContext(tournamentId?:string){
 const u=await user();let query=configured()?db().from('tournaments').select('*').eq('status','registration').gt('registration_ends',new Date().toISOString()):null;
 if(tournamentId&&query)query=query.eq('id',tournamentId);
 const {data:t}=query?await query.order('edition').limit(1).maybeSingle():{data:null};
 const [seats,products,application]=await Promise.all([t?availability(t.id):null,u?db().from('products').select('id,name').eq('owner_id',u.id):{data:[]},u&&t?db().from('entries').select('id,status').eq('user_id',u.id).eq('tournament_id',t.id).maybeSingle():{data:null}]);
 return {tournament:t?.id||null,signedIn:Boolean(u),existing:products.data||[],bookedSlots:seats?.booked_slots||[],fee:t?.fee_amount_cents||0,alreadyEntered:Boolean(application.data),edition:t?.edition||null,theme:t?.theme||null};
}
