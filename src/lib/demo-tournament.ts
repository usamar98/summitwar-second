import type {Entry,Match,Product,Tournament} from './types';
import {PROMOTION_SLOTS,PROMOTION_PLANS,type PromotionSlot,type PromotionPlan} from './promotion-slots';

function logo(letter:string,color:string){
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${color}"/><path d="M68 15 81 28M15 68 28 81" stroke="#15201a" stroke-opacity=".2" stroke-width="5" stroke-linecap="round"/><text x="48" y="63" text-anchor="middle" font-family="Arial,sans-serif" font-size="48" font-weight="700" fill="#15201a">${letter}</text></svg>`;
 return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
function project(name:string,tagline:string,color:string,category:string,founder:string):Product{
 const slug=`demo-${name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
 return {id:slug,owner_id:`${slug}-founder`,name,slug,url:`https://${name.toLowerCase().replace(/[^a-z0-9]/g,'')}.example`,logo_url:logo(name[0],color),category,tagline,founder,audience:null,problem:null,pricing:null,free_trial:false,screenshot_url:null,demo_url:null,x_handle:null,question:null,offer_url:null,published:false};
}
function workspacePreview(){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="650" viewBox="0 0 1000 650"><rect width="1000" height="650" rx="16" fill="#171e1b"/><rect width="200" height="650" fill="#101514"/><text x="28" y="56" font-family="Arial,sans-serif" font-size="27" font-weight="700" fill="#d7eb9b">forgepad.</text><g font-family="Arial,sans-serif" font-size="17" fill="#9ea89e"><text x="30" y="132">Overview</text><text x="30" y="180">Projects</text><text x="30" y="228">Notes</text><text x="30" y="276">Your team</text></g><text x="246" y="64" font-family="Arial,sans-serif" font-size="27" fill="#edf0e6">Build something good.</text><text x="246" y="101" font-family="Arial,sans-serif" font-size="16" fill="#9ea89e">Your next launch starts here.</text><rect x="244" y="143" width="710" height="165" rx="12" fill="#293523"/><text x="272" y="183" font-family="Arial,sans-serif" font-size="16" fill="#d7eb9b">THIS WEEK</text><text x="272" y="231" font-family="Arial,sans-serif" font-size="30" fill="#edf0e6">Ship the first version.</text><path d="M274 270h510" stroke="#d7eb9b" stroke-width="8" stroke-linecap="round"/><g fill="#222d25"><rect x="244" y="338" width="220" height="235" rx="10"/><rect x="489" y="338" width="220" height="235" rx="10"/><rect x="734" y="338" width="220" height="235" rx="10"/></g><g font-family="Arial,sans-serif" font-size="18" fill="#edf0e6"><text x="268" y="377">Plan</text><text x="513" y="377">Build</text><text x="758" y="377">Launch</text></g><g stroke="#53634f" stroke-width="10" stroke-linecap="round"><path d="M269 422h160m-160 34h118m-118 34h145"/><path d="M514 422h160m-160 34h133m-133 34h100"/><path d="M759 422h160m-160 34h118m-118 34h145"/></g><text x="245" y="617" font-family="Arial,sans-serif" font-size="15" fill="#9ea89e">Fictional product interface for the SummitWar demo.</text></svg>';
 return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Display-only fixtures. Never insert these projects, votes or bookings into the database. */
export function completedDemo(now=Date.now()){
 const entrants=[
  project('Forgepad','From first idea to shipped product, all in one calm workspace.','#d7eb9b','Productivity','Mina Torres'),
  project('Briefbox','Turn scattered research into a clear creative brief.','#9dc5f2','Writing','Alex Chen'),
  project('Orbitdesk','Keep your small team moving in the same direction.','#e9c87d','Teamwork','Sam Rivera'),
  project('Lumaform','Beautiful forms that feel like a conversation.','#c1afe9','Forms','Jules Parker'),
  project('Patchly','Know your website is healthy before your customers ask.','#efb5ca','Developer tools','Kai Morgan'),
  project('Hexnote','Capture the thought. Keep the context. Find it later.','#e3b47c','Notes','Riley Stone'),
  project('Launchleaf','A thoughtful home for your next big launch.','#a3d2bd','Marketing','Avery Cole'),
  project('Kiteboard','Less project management. More progress.','#a4d9e6','Productivity','Noah Reed'),
 ];
 entrants[0].screenshot_url=workspacePreview();
 const sponsors=[
  project('Kilo CRM','Your next customer relationship starts here.','#97d1bd','Sales','Demo sponsor'),
  project('Pagecraft','Launch a site that looks like you mean it.','#a5c6f1','Websites','Demo sponsor'),
  project('Metricnest','Understand what brings people back.','#ebbc85','Analytics','Demo sponsor'),
  project('Calmstack','Simple infrastructure for ambitious little teams.','#e1adc2','Developer tools','Demo sponsor'),
  project('Flowpost','One good idea. A week of thoughtful content.','#bdb0ed','Marketing','Demo sponsor'),
  project('Formhive','Collect the right answers. Start the right conversations.','#d1da91','Forms','Demo sponsor'),
 ];
 const tournamentId='demo-edition-001';
 const finalEnd=now-30*60*1000,start=finalEnd-60*3600000;
 const iso=(value:number)=>new Date(value).toISOString();
 const tournament:Tournament={id:tournamentId,edition:1,theme:'Small tools. Big possibilities.',status:'spotlight',fee_amount_cents:0,currency:'usd',registration_ends:iso(start-3600000),starts_at:iso(start),daily_cycle:false,extended_cycle:true,archived:false};
 const entries:Entry[]=entrants.map((product,index)=>({id:`demo-entry-${index+1}`,user_id:product.owner_id,product_id:product.id,tournament_id:tournamentId,status:'confirmed',registration_slot:index+1,priority:index+1,snapshot:product,product}));
 function match(id:string,round:number,position:number,a:number,b:number,scoreA:number,scoreB:number):Match{
  const begins=start+[0,24,48][round-1]*3600000;
  return {id:`demo-${id}`,tournament_id:tournamentId,round,position,entry_a:entries[a-1].id,entry_b:entries[b-1].id,winner_id:entries[(scoreA>scoreB?a:b)-1].id,score_a:scoreA,score_b:scoreB,starts_at:iso(begins),ends_at:iso(begins+[24,24,12][round-1]*3600000)};
 }
 const matches=[match('quarterfinal-1',1,1,1,2,412,286),match('quarterfinal-2',1,2,3,4,354,312),match('quarterfinal-3',1,3,5,6,298,342),match('quarterfinal-4',1,4,7,8,361,337),match('semifinal-1',2,1,1,3,522,418),match('semifinal-2',2,2,6,7,407,463),match('final',3,1,1,7,684,526)];
 const scores=Object.fromEntries(matches.map(match=>[match.id,{a:match.score_a!,b:match.score_b!}]));
 const plans:PromotionPlan[]=['quarterfinal','semifinal','tournament','tournament','semifinal','quarterfinal'];
 const slots:PromotionSlot[]=PROMOTION_SLOTS.map((slot,index)=>({...slot,price:10000,available_plans:[...PROMOTION_PLANS],current_amount:PROMOTION_PLANS.find(p=>p.id===plans[index])!.price,placement_plan:plans[index],state:'paid',bookable:false,name:sponsors[index].name,url:sponsors[index].url,tagline:sponsors[index].tagline,logo_url:sponsors[index].logo_url}));
 const replacement=project('Launchlane','A clearer path from your first idea to launch.','#a4d9e6','Launch tools','Demo sponsor');
 return {tournament,entries,matches,scores,slots,sponsors,replacement,winner:entrants[0],projects:[...entrants,...sponsors,replacement],spotlightEnd:iso(finalEnd+12*3600000),serverNow:iso(now)};
}
