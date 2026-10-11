import {describe,it,expect} from 'vitest';
import {currentParticipants} from '../src/lib/participants';
import type {Entry,Match} from '../src/lib/types';
const entries=Array.from({length:8},(_,i)=>({id:`e${i+1}`} as Entry));
const match=(round:number,position:number,a:number,b:number,winner_id:string|null=null)=>({id:`m${round}-${position}`,round,position,entry_a:`e${a}`,entry_b:`e${b}`,winner_id,starts_at:new Date(round*1000).toISOString(),ends_at:new Date((round+1)*1000).toISOString()} as Match);
const quarters=[match(1,1,1,2),match(1,2,3,4),match(1,3,5,6),match(1,4,7,8)];
describe('round participant list',()=>{
 it('shows all eight quarterfinal participants',()=>expect(currentParticipants(entries,quarters,1500).entries).toHaveLength(8));
 it('shows only four semifinal participants, with no eliminated entries',()=>{const stage=currentParticipants(entries,[...quarters,match(2,1,1,3),match(2,2,5,7)],2500);expect(stage.label).toBe('Semifinal participants');expect(stage.entries.map(e=>e.id)).toEqual(['e1','e3','e5','e7']);});
 it('shows only both finalists in the final and only the champion after closure',()=>{const stage=[...quarters,match(2,1,1,3),match(2,2,5,7),match(3,1,1,5)];expect(currentParticipants(entries,stage,3500).entries.map(e=>e.id)).toEqual(['e1','e5']);stage[6].winner_id='e5';expect(currentParticipants(entries,stage,4500).entries.map(e=>e.id)).toEqual(['e5']);});
});
