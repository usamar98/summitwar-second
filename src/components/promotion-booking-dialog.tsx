'use client';
import {useEffect,useRef,type KeyboardEvent} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {PROMOTION_SLOTS,canBookPromotion,minimumPromotionBid,promotionDollars,type PromotionSlot} from '@/lib/promotion-slots';
import {PromotionForm} from './promotion-form';
import {LocalTime} from './widgets';

export function keepDialogFocus(event:KeyboardEvent<HTMLDialogElement>){
 if(event.key!=='Tab')return;
 const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')).filter(element=>element.tabIndex>=0&&element.getClientRects().length>0);
 const first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}

export function PromotionBookingDialog({position,tournament,edition,ends,slots,signedIn,enabled,onClose}:{position:number;tournament?:string;edition?:number;ends?:string;slots:PromotionSlot[];signedIn:boolean;enabled:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const placement=PROMOTION_SLOTS.find(slot=>slot.position===position)!;
 const slot=slots.find(slot=>slot.position===position);
 const reserved=slot?.state==='reserved';
 useEffect(()=>{
  const modal=dialog.current;
  if(!modal)return;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const overflow=document.body.style.overflow;
  modal.showModal();
  document.body.style.overflow='hidden';
  modal.querySelector<HTMLInputElement>('#promotion-name')?.focus();
  return()=>{modal.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus()};
 },[]);
 return <dialog ref={dialog} className="promotion-dialog" aria-labelledby="promotion-dialog-title" aria-describedby="promotion-dialog-description" onKeyDown={keepDialogFocus} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <div className="promotion-dialog-content">
   <div className="promotion-dialog-heading"><div><p className="eyebrow">SPONSOR BY</p><h2 id="promotion-dialog-title">{placement.label} card</h2></div><button type="button" className="drawer-close" aria-label="Close sponsor details" onClick={onClose}><Cross2Icon width={22} height={22}/></button></div>
   <p className="promotion-dialog-price">${promotionDollars(minimumPromotionBid(slot))}<span>USD · minimum bid</span></p>
   <p id="promotion-dialog-description">Show your startup beside the community winner in this {placement.label.toLowerCase()} placement.</p>
   {edition&&ends?<p className="promotion-dialog-edition">Edition #{edition} · Ends <LocalTime value={ends}/></p>:<p className="promotion-dialog-edition">Booking opens with the next published tournament.</p>}
   {reserved&&<p className="notice">This card is reserved while another checkout finishes.</p>}
   {slot?.state==='paid'&&<p className="notice">Currently sponsored by <strong>{slot.name||'another startup'}</strong>. Bid at least ${promotionDollars(minimumPromotionBid(slot))} USD to take this card after payment verification.</p>}
   {enabled&&!reserved&&!canBookPromotion(slot)&&<p className="notice">Booking is temporarily unavailable. Another checkout may be finishing, or booking has closed.</p>}
   <PromotionForm tournament={tournament} slots={slots} signedIn={signedIn} enabled={enabled} fixedSlot={position}/>
   <p className="promotion-dialog-terms">Your placement appears after verified payment and lasts until another sponsor overtakes it or this edition ends. All sponsors expire before the next tournament starts. Sponsorship does not add votes or enter the free competition.</p>
  </div>
 </dialog>;
}
