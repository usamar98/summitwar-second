import type {Tournament} from './types';
export function homepageTournament(rows:Tournament[],now=Date.now()){
 return rows.find(t=>t.status==='voting')||rows.find(t=>t.status==='spotlight'&&now<Date.parse(t.starts_at)+(t.extended_cycle?72:t.daily_cycle===false?168:24)*3600000)||rows.find(t=>t.status==='locked')||rows.find(t=>t.status==='registration')||rows[0];
}
