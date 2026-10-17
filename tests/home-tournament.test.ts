import {it,expect} from 'vitest';
import {homepageTournament} from '../src/lib/home-tournament';
import type {Tournament} from '../src/lib/types';
const start=Date.parse('2026-10-17T00:00:00Z');
function row(id:string,status:string,hours:number):Tournament{return {id,status,starts_at:new Date(start+hours*3600000).toISOString(),registration_ends:new Date(start+(hours-1)*3600000).toISOString(),edition:1,theme:'Test',fee_amount_cents:0,currency:'usd',archived:false,daily_cycle:true,extended_cycle:true}}
it('keeps the current spotlight and its paid placements featured for the full period despite the next bracket locking',()=>{const current=row('current','spotlight',0),next=row('next','locked',72);expect(homepageTournament([next,current],start+71*3600000)?.id).toBe('current');expect(homepageTournament([next,current],start+72*3600000)?.id).toBe('next')});
it('prioritizes a running battle and supports registration and empty states',()=>{expect(homepageTournament([row('next','locked',72),row('current','voting',0)],start+10*3600000)?.id).toBe('current');expect(homepageTournament([row('new','registration',72)])?.id).toBe('new');expect(homepageTournament([])).toBeUndefined()});
