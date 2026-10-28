export const PROMOTION_SLOTS=[{position:1,label:'Top left',price:10000},{position:2,label:'Middle left',price:10000},{position:3,label:'Bottom left',price:10000},{position:4,label:'Top right',price:10000},{position:5,label:'Middle right',price:10000},{position:6,label:'Bottom right',price:10000}] as const;
export const MAX_PROMOTION_TOTAL=99999999;
export type PromotionSlot={position:number;price:number;minimum_bid?:number;current_amount?:number|null;state:'available'|'reserved'|'paid'|'closed';bookable?:boolean;name?:string|null;url?:string|null;tagline?:string|null;logo_url?:string|null};
export function canBookPromotion(slot?:PromotionSlot){return slot?.bookable??slot?.state==='available'}
export function minimumPromotionBid(slot?:PromotionSlot){return Math.max(10000,slot?.minimum_bid??slot?.price??10000,slot?.state==='paid'?(slot.current_amount??10000)+100:10000)}
export function promotionDollars(cents:number){return (cents/100).toLocaleString('en-US',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2})}
export function parsePromotionBid(value:string){if(!/^\d{1,6}(?:\.\d{1,2})?$/.test(value))return null;const [whole,fraction='']=value.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(cents)&&cents<=MAX_PROMOTION_TOTAL?cents:null}
// Historical bookings retain their agreed prices, including when checkout resumes.
export function promotionPrice(position:number,version=3){const slot=PROMOTION_SLOTS.find(s=>s.position===position);if(!slot)throw new Error('Choose a valid promotion card');if(version===1)return [10000,70000,5000][(position-1)%3];if(version===2)return [7000,5000,3000][(position-1)%3];if(version!==3)throw new Error('Promotion pricing update is required before checkout');return slot.price}
export function promotionAmounts(slots:number[],version=3,bids?:unknown):Record<string,number>{
 if(!slots.length||new Set(slots).size!==slots.length||slots.some(p=>!PROMOTION_SLOTS.some(s=>s.position===p)))throw new Error('Choose distinct promotion cards');
 if(version!==4)return Object.fromEntries(slots.map(p=>[String(p),promotionPrice(p,version)]));
 if(!bids||typeof bids!=='object'||Array.isArray(bids))throw new Error('A recorded bid is required for each card');
 const amounts=bids as Record<string,unknown>;
 if(Object.keys(amounts).length!==slots.length||slots.some(p=>!Object.hasOwn(amounts,String(p))||!Number.isSafeInteger(amounts[p])||(amounts[p] as number)<10000||(amounts[p] as number)>MAX_PROMOTION_TOTAL))throw new Error('Invalid recorded sponsor bids');
 const result=amounts as Record<string,number>;
 if(Object.values(result).reduce((sum,n)=>sum+n,0)>MAX_PROMOTION_TOTAL)throw new Error('The combined bid exceeds the checkout limit');
 return result;
}
export function promotionTotal(slots:number[],version=3,bids?:unknown){return Object.values(promotionAmounts(slots,version,bids)).reduce((sum,n)=>sum+n,0)}
