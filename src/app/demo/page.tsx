import Link from 'next/link';
import {TournamentRewards} from '@/components/tournament-rewards';
import type {Metadata} from 'next';
import {completedDemo} from '@/lib/demo-tournament';
import {DemoPreview} from '@/components/demo-preview';
import {DemoSponsorStage} from '@/components/demo-sponsor-stage';
import {DemoRewardsShowcase} from '@/components/demo-rewards-showcase';
import {Bracket} from '@/components/bracket';
import {ParticipantList} from '@/components/participant-list';
import {TournamentWatch} from '@/components/tournament-watch';
import './demo.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Winner & sponsor demo',description:'Preview fictional protected sponsorship plans at $100, $200 and $300 and preview the winner’s startup page, badge and sponsor benefits.',robots:{index:false,follow:false}};
export default function DemoPage(){
 const demo=completedDemo();
 return <DemoPreview projects={demo.projects} entries={demo.entries} matches={demo.matches}>
  <div className="demo-preview-banner" role="note"><span>INTERACTIVE DEMO</span><p>A fictional winner, six sponsors and protected plans. Nothing is purchased or published.</p><Link href="/">Back to the live tournament ↗</Link></div>
  <DemoSponsorStage winner={demo.winner} replacement={demo.replacement} initialSlots={demo.slots} ends={demo.spotlightEnd} serverNow={demo.serverNow}/>
  <section className="section arena tournament-first" id="arena"><div className="section-head"><div><p className="eyebrow"><span className="status-dot"/>DEMO EDITION 001 · COMPLETED</p><h2 className="tournament-title">Forgepad rules the summit.</h2></div><span className="tag">WINNER SPOTLIGHT</span></div><div className="arena-top"><div><span className="tag">{demo.tournament.theme}</span><p>The final is finished. The community’s choice takes the center stage.</p><p className="muted">24h quarterfinals · 24h semifinals · 12h final · 12h winner spotlight.</p></div><TournamentWatch tournament={demo.tournament} matches={demo.matches} serverNow={demo.serverNow} spotlightEnd={demo.spotlightEnd}/></div><Bracket matches={demo.matches} entries={demo.entries} scores={demo.scores}/><div className="arena-bottom"><span>Seven completed matches. One community champion.</span><span>All projects and vote totals on this page are examples.</span></div></section>
  <TournamentRewards/>
  <DemoRewardsShowcase winner={demo.winner} sponsor={demo.sponsors[0]}/>
 <ParticipantList entries={demo.entries} matches={demo.matches} scores={demo.scores} tournamentStatus="spotlight"/>
  <section className="section demo-next-edition"><div><p className="eyebrow">AFTER THE SPOTLIGHT</p><h2>A new tournament.<br/>A fresh set of sponsors.</h2><p>When the edition ends, its sponsored placements expire. The next tournament gets six new places around the next community champion.</p></div><Link className="button" href="/">Explore the live tournament ↗</Link></section>
 </DemoPreview>;
}
