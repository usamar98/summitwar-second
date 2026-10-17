import {it,expect} from 'vitest';
import {promotionTotal,PROMOTION_SLOTS} from '../src/lib/promotion-slots';
it('prices both sides at $100 / $700 / $50 and allows a buyer to purchase all six',()=>{expect(PROMOTION_SLOTS.map(s=>s.price)).toEqual([10000,70000,5000,10000,70000,5000]);expect(promotionTotal([1,2,3,4,5,6])).toBe(170000);expect(promotionTotal([2,5])).toBe(140000);expect(promotionTotal([3,6])).toBe(10000)});
it('rejects empty, duplicated and fabricated positions',()=>{for(const slots of [[],[1,1],[0],[7],[1.5]])expect(()=>promotionTotal(slots)).toThrow()});
