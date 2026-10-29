import 'server-only';
import {rpc} from './supabase';
export async function limitVoteRequest(network:string,kind:'issue'|'cast'){
 const result=await rpc('limit_vote_request',{p_network:network,p_kind:kind}) as {allowed?:boolean;retry_after?:number};
 if(typeof result?.allowed!=='boolean')throw new Error('Voting protection is temporarily unavailable');
 if(!result.allowed)throw Object.assign(new Error('Too many voting requests. Please wait and try again.'),{retryAfter:Math.max(1,Math.min(600,result.retry_after||60))});
}
export function votingFailure(error:unknown,headers:Record<string,string>){
 const message=error instanceof Error?error.message:'Vote could not be recorded';
 const retryAfter=error instanceof Error&&'retryAfter' in error?Number(error.retryAfter):0;
 const github=message.startsWith('GitHub verification required');
 const context=message.startsWith('Your network changed')||message.startsWith('Your account changed');
 return Response.json({error:message,code:github?'GITHUB_REQUIRED':context?'NEW_LINK_REQUIRED':retryAfter?'RATE_LIMITED':'VOTE_REJECTED'},{status:github?403:retryAfter?429:400,headers:{...headers,...(retryAfter?{'Retry-After':String(retryAfter)}:{})}});
}
