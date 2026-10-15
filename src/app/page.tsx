import Link from 'next/link';
import {votedMatches} from '@/lib/guest-voter';
import {TournamentWatch} from '@/components/tournament-watch';
import {ArrowTopRightIcon,CheckIcon,TriangleUpIcon} from '@radix-ui/react-icons';
import {tournamentData,availability,preview,matchScores} from '@/lib/data';
import {configured,db,user} from '@/lib/supabase';
import {NextEdition} from '@/components/next-edition';
import {ParticipantList} from '@/components/participant-list';
import {Bracket,ProductCard} from '@/components/ui';
import {LocalTime,LiveRefresh} from '@/components/widgets';
export const dynamic='force-dynamic';
export default async function Home(){
 const [{tournament:t,entries,matches,champion},u]=await Promise.all([tournamentData(),user()]);
 const [seats,scores]=await Promise.all([t?availability(t.id):null,matchScores(matches)]);
 const votes=await votedMatches(matches.map(m=>m.id),u?.id);
 const [follows,saved]=u?await Promise.all([db().from('product_follows').select('product_id').eq('user_id',u.id),db().from('saved_products').select('product_id').eq('user_id',u.id)]):[{data:[]},{data:[]}];
 const live=t?.status==='voting';const spotlight=champion&&Date.parse(champion.spotlight_ends)>Date.now()&&!live;let winner=null;
 if(champion&&configured()){const {data}=await db().from('entries').select('snapshot').eq('id',champion.entry_id).single();winner=data?.snapshot;}
 return <>{preview&&<div className="preview-banner">LOCAL PREVIEW · No real entrants, votes, or payments are simulated.</div>}<LiveRefresh tournament={t?.id}/>
 <section className="section arena tournament-first" id="arena">
  <div className="section-head"><div><p className="eyebrow"><span className="status-dot"/>{t?`EDITION ${String(t.edition).padStart(3,'0')} · ${t.status.toUpperCase()}`:'THE INAUGURAL EDITION'}</p><h1 className="tournament-title">{live?'The climb is on.':spotlight?`${winner?.name||'The champion'} rules the summit.`:'The next summit is yours.'}</h1></div><Link className="button" href={t&&['locked','voting','spotlight'].includes(t.status)?'#next-tournament':'/submit'}>{t&&['locked','voting','spotlight'].includes(t.status)?'Pre-enter next tournament':t?.edition===1?'Enter free — inaugural tournament':t?'Enter for $5 — one-time tournament fee':'Take your place'}<ArrowTopRightIcon/></Link></div>
  <div className="arena-top"><div><span className="tag">{t?.theme||'Tools for people who build apps'}</span><p>{live?'Choose the app you would actually use. One final choice per match.':spotlight?'Chosen by the community. 12 hours at the top.':'Eight founders. One app each. Pick an open place and submit your website.'}</p><p className="muted">{t?.fee_amount_cents===0?'The first tournament is free.':t?'$5 per entrant. Watching and voting are always free.':'First published tournament: free. Every later tournament: $5.'}</p>{t&&<p className="muted">Voting starts <LocalTime value={t.starts_at}/></p>}</div><TournamentWatch tournament={t} matches={matches} serverNow={new Date().toISOString()} spotlightEnd={spotlight?champion.spotlight_ends:undefined}/></div>
  <Bracket roundHours={t?.extended_cycle===false?(t.daily_cycle===false?[24,16,8]:[4,4,4]):[24,24,12]} matches={matches} entries={entries} tournamentId={t?.id} bookedSlots={seats?.booked_slots||[]} scores={scores}/>
  <div className="arena-bottom"><span><TriangleUpIcon/>{seats?`${seats.confirmed}/8 confirmed · ${seats.reserved} reserved · ${seats.available} available`:'Applications open when the organizer publishes the first tournament.'}</span><span>24h quarterfinals / 24h semifinals / 12h final · 12h winner spotlight</span></div>
  {spotlight&&winner&&<div className="spotlight panel"><p className="eyebrow">COMMUNITY CHOICE</p><ProductCard product={winner}/><Link className="text-link" href={`/champions/${champion.tournament_id}`}>Champion story & badge ↗</Link><p>Spotlight ends <LocalTime value={champion.spotlight_ends}/></p></div>}
  {live&&winner&&<div className="historical"><p className="eyebrow">PREVIOUS CHAMPION</p><Link href={`/champions/${champion!.tournament_id}`}>{winner.name} ↗</Link></div>}
 </section>
 <ParticipantList entries={entries} matches={matches} scores={scores} userId={u?.id} votedMatches={votes} tournamentStatus={t?.status} followedProducts={follows.data?.map(f=>f.product_id)||[]} savedProducts={saved.data?.map(s=>s.product_id)||[]}/>
 <NextEdition currentId={t?.id}/>
 <section className="section how"><div><p className="eyebrow">A SIMPLE PATH TO THE TOP</p><h2>Built it?<br/>Battle it.</h2><p className="muted">Submit your website. Let the community discover it.</p><Link className="text-link" href="/rules">Read the rules <ArrowTopRightIcon/></Link></div><div className="steps">{[['01','Take an open place','Add your website link. Its favicon and tagline are fetched automatically.'],['02','Let the community decide','Eight apps face off in a 60-hour bracket. Every round starts fresh.'],['03','Take the summit','The champion gets 12 hours in the spotlight. Every entrant stays discoverable.']].map(([n,title,body])=><div className="step" key={n}><span>{n}</span><div><h3>{title}</h3><p>{body}</p></div></div>)}</div></section>
 <section className="entry-strip"><div><p className="eyebrow">YOUR NEXT LAUNCH DESERVES AN AUDIENCE</p><h2>Meet you at the summit.</h2><p><CheckIcon/> Permanent product page <CheckIcon/> Community feedback <CheckIcon/> Battle card</p></div><Link className="button" href="/submit">Take your place <ArrowTopRightIcon/></Link></section>
 </>;
}
