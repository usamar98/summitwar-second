import {it,expect} from 'vitest';
import {promotionTotal,PROMOTION_SLOTS,canBookPromotion} from '../src/lib/promotion-slots';
it('prices every card at $100 and allows all six for $600',()=>{expect(PROMOTION_SLOTS.map(s=>s.price)).toEqual([10000,10000,10000,10000,10000,10000]);expect(promotionTotal([1,2,3,4,5,6])).toBe(60000);expect(promotionTotal([2,5])).toBe(20000);expect(promotionTotal([3,6])).toBe(20000)});
it('preserves both historical price contracts and rejects unknown versions',()=>{expect(promotionTotal([1,2,3,4,5,6],1)).toBe(170000);expect(promotionTotal([1,2,3,4,5,6],2)).toBe(30000);expect(()=>promotionTotal([1],4)).toThrow('pricing update')});
it('allows a paid takeover only when inventory permits booking',()=>{expect(canBookPromotion({position:1,price:10000,state:'paid',bookable:true})).toBe(true);expect(canBookPromotion({position:1,price:10000,state:'paid',bookable:false})).toBe(false);expect(canBookPromotion(undefined)).toBe(false)});
it('rejects empty, duplicated and fabricated positions',()=>{for(const slots of [[],[1,1],[0],[7],[1.5]])expect(()=>promotionTotal(slots)).toThrow()});
