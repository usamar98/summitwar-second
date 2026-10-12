import type {Match,Tournament} from './types';
export function tournamentClock(t:Pick<Tournament,'starts_at'|'registration_ends'|'status'|'daily_cycle'|'extended_cycle'>|null,matches:Match[],now:number,spotlightEnd?:string){
 if(!t)return {label:'Awaiting tournament',remaining:0,progress:0,round:0,running:false};
 const start=Date.parse(t.starts_at),durations=t.extended_cycle!==false?[24,24,12]:t.daily_cycle!==false?[4,4,4]:[24,16,8];
 if(t.status==='registration'&&now>=start)return {label:'Awaiting approved lineup',remaining:0,progress:0,round:0,running:false};
 if(t.status==='completed'||t.status==='cancelled')return {label:t.status==='completed'?'Tournament complete':'Tournament cancelled',remaining:0,progress:1,round:0,running:false};
 if(now<start)return {label:t.status==='registration'&&now<Date.parse(t.registration_ends)?'Pre-entry closes in':'Voting starts in',remaining:Math.max(0,(t.status==='registration'&&now<Date.parse(t.registration_ends)?Date.parse(t.registration_ends):start)-now),progress:0,round:0,running:false};
 let offset=0;for(let round=1;round<=3;round++){const match=matches.find(m=>m.round===round);const from=match?Date.parse(match.starts_at):start+offset*3600000;const to=match?Date.parse(match.ends_at):from+durations[round-1]*3600000;offset+=durations[round-1];if(now<to)return {label:now<from?'Next round starts in':`${['Quarterfinals','Semifinals','Final'][round-1]} ends in`,remaining:Math.max(0,(now<from?from:to)-now),progress:Math.min(1,Math.max(0,(now-from)/(to-from))),round,running:now>=from&&t.status==='voting'};}
 const end=spotlightEnd?Date.parse(spotlightEnd):start+(offset+12)*3600000;return {label:now<end?'Winner spotlight ends in':'Tournament complete',remaining:Math.max(0,end-now),progress:Math.min(1,Math.max(0,1-(end-now)/(12*3600000))),round:4,running:false};
}
