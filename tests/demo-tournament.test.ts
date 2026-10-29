import {expect,it} from 'vitest';
import {completedDemo} from '../src/lib/demo-tournament';
import {canBookPromotion} from '../src/lib/promotion-slots';

it('fills all six example sponsor cards with fixed protection periods at three price points',()=>{
 const demo=completedDemo(1793232000000);
 expect(demo.slots).toHaveLength(6);
 expect(demo.slots.map(s=>s.current_amount)).toEqual([10000,20000,30000,30000,20000,10000]);
 expect(demo.slots.map(s=>s.placement_plan)).toEqual(['quarterfinal','semifinal','tournament','tournament','semifinal','quarterfinal']);
 expect(demo.slots.every(s=>s.state==='paid'&&!canBookPromotion(s)&&s.name&&s.logo_url)).toBe(true);
});
it('keeps all demo startups fictional and produces a fresh simulation on each load',()=>{
 const first=completedDemo(),second=completedDemo();
 first.slots[0].name='Local preview takeover';
 expect(second.slots[0].name).toBe('Kilo CRM');
 expect(second.projects.every(p=>new URL(p.url).hostname.endsWith('.example')&&p.id.startsWith('demo-')&&!p.published)).toBe(true);
 expect(second.replacement.name).toBe('Launchlane');
 expect(second.matches.find(m=>m.round===3)?.winner_id).toBe(second.entries[0].id);
 expect(second.winner.name).toBe('Forgepad');
});
