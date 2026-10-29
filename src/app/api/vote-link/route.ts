import {cookies} from 'next/headers';
import {user,rpc} from '@/lib/supabase';
import {uuid} from '@/lib/validation';
import {VOTER_COOKIE,newVoterCookie,voterHash,newVotingToken,votingTokenHash} from '@/lib/guest-identity';
import {verifyVoteChallenge,voteNetwork} from '@/lib/vote-protection';
import {limitVoteRequest,votingFailure} from '@/lib/voting-security';
export async function POST(req:Request){const headers={'Cache-Control':'private, no-store'};if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});try{const body=await req.json(),match=uuid.parse(body.match),network=voteNetwork(req);await limitVoteRequest(network,'issue');await verifyVoteChallenge(req,body.challenge,true);const jar=await cookies();const existing=jar.get(VOTER_COOKIE)?.value;const cookie=voterHash(existing)?existing!:newVoterCookie();const voter=voterHash(cookie)!;const actor=await user(),token=newVotingToken();const expires=await rpc('issue_voting_link',{p_match:match,p_voter:voter,p_token:votingTokenHash(token),p_network:network,p_actor:actor?.id||null});jar.set(VOTER_COOKIE,cookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:365*86400});return Response.json({token,href:`/vote#match=${match}&token=${token}`,expires},{headers});}catch(e){return votingFailure(e,headers)}}
