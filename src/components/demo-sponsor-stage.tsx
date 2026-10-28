'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {ArrowRightIcon,Cross2Icon,ResetIcon} from '@radix-ui/react-icons';
import {PROMOTION_SLOTS,minimumPromotionBid,parsePromotionBid,promotionDollars,type PromotionSlot} from '@/lib/promotion-slots';
import type {Product} from '@/lib/types';
import {PromotionHero} from './promotion-hero';
import {keepDialogFocus} from './promotion-booking-dialog';

function DemoBidDialog({slot,replacement,onClose,onConfirm}:{slot:PromotionSlot;replacement:Product;onClose:()=>void;onConfirm:(amount:number)=>void}){
 const modal=useRef<HTMLDialogElement>(null);
 const minimum=minimumPromotionBid(slot),[input,setInput]=useState(String(minimum/100));
 const amount=parsePromotionBid(input),valid=amount!==null&&amount>=minimum;
 const label=PROMOTION_SLOTS.find(s=>s.position===slot.position)!.label;
 useEffect(()=>{
  const dialog=modal.current;if(!dialog)return;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
  dialog.showModal();document.body.style.overflow='hidden';dialog.querySelector('input')?.focus();
  return()=>{dialog.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus()};
 },[]);
 function submit(event:FormEvent){event.preventDefault();if(valid)onConfirm(amount)}
 return <dialog ref={modal} className="promotion-dialog demo-bid-dialog" aria-labelledby="demo-bid-title" onKeyDown={keepDialogFocus} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <div className="promotion-dialog-content"><div className="promotion-dialog-heading"><div><p className="eyebrow">INTERACTIVE DEMO · NO PAYMENT</p><h2 id="demo-bid-title">{slot.state==='paid'?'Overtake':'Book'} the {label.toLowerCase()} card.</h2></div><button className="drawer-close" type="button" aria-label="Close takeover preview" onClick={onClose}><Cross2Icon width={22} height={22}/></button></div>
   <div className="demo-bid-comparison"><div><span>Current sponsor</span><strong>{slot.name||'Empty card'}</strong><p>{slot.current_amount?`Paid $${promotionDollars(slot.current_amount)}`:'Opening bid $100'}</p></div><ArrowRightIcon aria-hidden="true"/><div><span>Your sample startup</span><strong>{replacement.name}</strong><p>Minimum ${promotionDollars(minimum)}</p></div></div>
   <form onSubmit={submit}><label htmlFor="demo-bid">Your bid in USD</label><div className="demo-bid-input"><span aria-hidden="true">$</span><input id="demo-bid" type="number" inputMode="decimal" min={minimum/100} max="999999.99" step="0.01" required value={input} onChange={event=>setInput(event.target.value)} aria-describedby="demo-bid-help"/></div><p id="demo-bid-help">{slot.state==='paid'?`At least $1 more than ${slot.name} paid for this card.`:'Empty cards start at $100.'} You can enter a higher amount.</p>
    <div className="demo-bid-receipt"><span>After your sample takeover</span><strong>{replacement.name} · {valid?`$${promotionDollars(amount)}`:'Enter a valid bid'}</strong><span>Next minimum takeover</span><strong>{valid?`$${promotionDollars(amount+100)}`:'—'}</strong></div>
    <p className="demo-detail-note">On the live site, the current sponsor stays visible until Stripe verifies the new payment. This button only changes this browser preview. No checkout or payment is created.</p>
    <button className="button" type="submit" disabled={!valid}>Preview verified {slot.state==='paid'?'takeover':'placement'} <ArrowRightIcon/></button>
   </form>
  </div>
 </dialog>;
}

export function DemoSponsorStage({winner,replacement,initialSlots,ends,serverNow}:{winner:Product;replacement:Product;initialSlots:PromotionSlot[];ends:string;serverNow:string}){
 const [slots,setSlots]=useState(initialSlots),[selected,setSelected]=useState<number|null>(null),[next,setNext]=useState(false),[message,setMessage]=useState('Choose any Overtake button to try a higher bid.');
 function reset(){setSlots(initialSlots);setNext(false);setSelected(null);setMessage('The original six sample sponsors have been restored.')}
 function nextEdition(){setSlots(PROMOTION_SLOTS.map(slot=>({...slot,minimum_bid:10000,current_amount:null,state:'available',bookable:true})));setNext(true);setSelected(null);setMessage('Next tournament preview: all old sponsors have ended. Six empty cards open at $100. The completed bracket below remains an example.')}
 const selectedSlot=slots.find(slot=>slot.position===selected);
 return <>
  <div className="demo-stage-controls"><p role="status" aria-live="polite">{message}</p><div><a className="text-link" href="#demo-winner-benefits">Winner & sponsor benefits ↓</a><button type="button" className="text-link" onClick={nextEdition} disabled={next}>Preview next tournament <ArrowRightIcon/></button><button type="button" className="text-link" onClick={reset}><ResetIcon/>Reset demo</button></div></div>
  <PromotionHero winner={next?null:winner} championId="demo-edition-001" edition={next?2:1} slots={slots} ends={next?undefined:ends} serverNow={serverNow} signedIn={false} checkoutEnabled={false} onSponsorSelect={setSelected}/>
  {selectedSlot&&<DemoBidDialog key={`${next}-${selectedSlot.position}`} slot={selectedSlot} replacement={replacement} onClose={()=>setSelected(null)} onConfirm={amount=>{setSlots(previous=>previous.map(slot=>slot.position===selectedSlot.position?{...slot,state:'paid',current_amount:amount,minimum_bid:amount+100,price:amount+100,name:replacement.name,url:replacement.url,tagline:replacement.tagline,logo_url:replacement.logo_url}:slot));setSelected(null);setMessage(`Preview updated: ${replacement.name} now has the ${PROMOTION_SLOTS.find(s=>s.position===selectedSlot.position)!.label.toLowerCase()} card at $${promotionDollars(amount)}. The next takeover starts at $${promotionDollars(amount+100)}. Other cards stay unchanged.`)}}/>}
 </>;
}
