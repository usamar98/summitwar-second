import {it,expect} from 'vitest';
import {promotionTotal,PROMOTION_SLOTS} from '../src/lib/promotion-slots';
it('prices both sides at $70 / $50 / $30 and allows a buyer to purchase all six for $300',()=>{expect(PROMOTION_SLOTS.map(s=>s.price)).toEqual([7000,5000,3000,7000,5000,3000]);expect(promotionTotal([1,2,3,4,5,6])).toBe(30000);expect(promotionTotal([2,5])).toBe(10000);expect(promotionTotal([3,6])).toBe(6000)});
it('preserves historical booking prices and rejects unknown price versions',()=>{expect(promotionTotal([1,2,3,4,5,6],1)).toBe(170000);expect(()=>promotionTotal([1],3)).toThrow('pricing update')});
it('rejects empty, duplicated and fabricated positions',()=>{for(const slots of [[],[1,1],[0],[7],[1.5]])expect(()=>promotionTotal(slots)).toThrow()});
