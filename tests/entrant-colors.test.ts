import {it,expect} from 'vitest';
import {entrantColor,ENTRANT_COLORS} from '../src/lib/entrant-color';
import type {Entry} from '../src/lib/types';
it('gives all eight places different colors and keeps a founder’s color after advancing',()=>{const colors=Array.from({length:8},(_,i)=>entrantColor(undefined,i+1)['--entrant-color' as keyof ReturnType<typeof entrantColor>]);expect(new Set(colors).size).toBe(8);const entrant={registration_slot:5,priority:2} as Entry;expect(entrantColor(entrant)).toEqual(entrantColor(undefined,5));expect(ENTRANT_COLORS).toHaveLength(8);});
