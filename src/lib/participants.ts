import type {Entry,Match} from './types';
export function currentParticipants(entries:Entry[],matches:Match[],now=Date.now()){
 const final=matches.find(m=>m.round===3);if(final?.winner_id)return {label:'Champion',round:3,entries:entries.filter(e=>e.id===final.winner_id)};
 const active=matches.filter(m=>Date.parse(m.starts_at)<=now);const round=active.length?Math.max(...active.map(m=>m.round)):1;const roundMatches=matches.filter(m=>m.round===round);
 const ids=new Set(roundMatches.flatMap(m=>[m.entry_a,m.entry_b]));return {label:['Quarterfinal participants','Semifinal participants','Final participants'][round-1],round,entries:roundMatches.length?entries.filter(e=>ids.has(e.id)):entries};
}
