'use client';
import {useEffect,useRef,useState} from 'react';
import {ArrowRightIcon,Cross2Icon,ResetIcon} from '@radix-ui/react-icons';
import {PROMOTION_SLOTS,PROMOTION_PLANS,promotionPlan,promotionProtectionLabel,promotionDollars,type PromotionPlan,type PromotionSlot} from '@/lib/promotion-slots';
import type {Product} from '@/lib/types';
import {PromotionHero} from './promotion-hero';
import {PromotionPlanPicker} from './promotion-plan-picker';
import {keepDialogFocus} from './promotion-booking-dialog';
type Stage='quarterfinal'|'semifinal'|'final'|'next';
function DemoPlanDialog({slot,replacement,stage,onClose,onConfirm}:{slot:PromotionSlot;replacement:Product;stage:Stage;onClose:()=>void;onConfirm:(plan:PromotionPlan)=>void}){
 const modal=useRef<HTMLDialogElement>(null),offers=PROMOTION_PLANS.filter(p=>stage==='quarterfinal'||stage==='next'||stage==='semifinal'&&p.id!=='quarterfinal'||p.id==='tournament');
 const [plan,setPlan]=useState<PromotionPlan>(offers[0].id);
 const label=PROMOTION_SLOTS.find(s=>s.position===slot.position)!.label,paid=slot.state==='paid';
 useEffect(()=>{
  const dialog=modal.current;if(!dialog)return;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
  dialog.showModal();document.body.style.overflow='hidden';
  return()=>{dialog.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus()};
 },[]);
 return <dialog ref={modal} className="promotion-dialog demo-bid-dialog" aria-labelledby="demo-plan-title" onKeyDown={keepDialogFocus} onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
  <div className="promotion-dialog-content"><div className="promotion-dialog-heading"><div><p className="eyebrow">INTERACTIVE DEMO · NO PAYMENT</p><h2 id="demo-plan-title">{paid?'Protected':'Book'} {label.toLowerCase()} card.</h2></div><button className="drawer-close" type="button" aria-label="Close sponsorship preview" onClick={onClose}><Cross2Icon width={22} height={22}/></button></div>
   {paid?<><p className="promotion-dialog-price">${promotionDollars(slot.current_amount!)}<span>USD · paid for this card</span></p><h3>{slot.name}</h3><p className="notice">{promotionProtectionLabel(slot.placement_plan)}. Nobody can replace this sponsor during that period.</p><p>Use the round-result controls above the demo to see shorter plans expire and cards become available again.</p></>:<form onSubmit={event=>{event.preventDefault();onConfirm(plan)}}><PromotionPlanPicker offers={offers} selected={plan} onChange={setPlan} name="demo-promotion-plan"/><div className="promotion-total"><span>{replacement.name} · one card</span><b>${promotionDollars(promotionPlan(plan).price)} USD</b></div><p className="demo-detail-note">This preview changes browser memory only. On the live site, a verified Stripe payment publishes your startup and protects the card for the chosen period.</p><button className="button" type="submit">Preview protected placement <ArrowRightIcon/></button></form>}
  </div>
 </dialog>;
}
export function DemoSponsorStage({winner,replacement,initialSlots,ends,serverNow}:{winner:Product;replacement:Product;initialSlots:PromotionSlot[];ends:string;serverNow:string}){
 const [slots,setSlots]=useState(initialSlots),[selected,setSelected]=useState<number|null>(null),[stage,setStage]=useState<Stage>('quarterfinal'),[message,setMessage]=useState('Six sample sponsors, protected at $100, $200 or $300. Preview round results to see when each card reopens.');
 function reset(){setSlots(initialSlots);setStage('quarterfinal');setSelected(null);setMessage('The six original sponsors and their protection periods have been restored.')}
 function advance(next:Stage){setStage(next);setSelected(null);setSlots(previous=>previous.map(slot=>{const release=next==='next'||next==='semifinal'&&slot.placement_plan==='quarterfinal'||next==='final'&&slot.placement_plan!=='tournament';return release?{...slot,price:next==='semifinal'?20000:next==='final'?30000:10000,current_amount:null,placement_plan:null,state:'available',bookable:true,name:null,url:null,tagline:null,logo_url:null}:slot}));setMessage(next==='next'?'Next tournament: every old sponsor has ended. All six cards are available with $100, $200 and $300 plans.':next==='semifinal'?'Quarterfinal results: $100 placements end. $200 and $300 sponsors stay protected. Released cards offer semifinal or whole-tournament coverage.':'Semifinal results: $200 placements end. $300 sponsors stay protected through the final and winner spotlight until the next tournament.')}
 const selectedSlot=slots.find(slot=>slot.position===selected);
 return <><div className="demo-stage-controls"><p role="status" aria-live="polite">{message}</p><div><a className="text-link" href="#demo-winner-benefits">Winner & sponsor benefits ↓</a><button type="button" className="text-link" onClick={()=>advance('semifinal')} disabled={stage!=='quarterfinal'}>Quarterfinal results</button><button type="button" className="text-link" onClick={()=>advance('final')} disabled={stage!=='semifinal'}>Semifinal results</button><button type="button" className="text-link" onClick={()=>advance('next')} disabled={stage==='next'}>Preview next tournament <ArrowRightIcon/></button><button type="button" className="text-link" onClick={reset}><ResetIcon/>Reset demo</button></div></div>
  <PromotionHero winner={stage==='next'?null:winner} championId="demo-edition-001" edition={stage==='next'?2:1} slots={slots} ends={stage==='next'?undefined:ends} serverNow={serverNow} signedIn={false} checkoutEnabled={false} onSponsorSelect={setSelected}/>
  {selectedSlot&&<DemoPlanDialog key={`${stage}-${selectedSlot.position}`} slot={selectedSlot} replacement={replacement} stage={stage} onClose={()=>setSelected(null)} onConfirm={plan=>{setSlots(previous=>previous.map(slot=>slot.position===selectedSlot.position?{...slot,state:'paid',bookable:false,current_amount:promotionPlan(plan).price,placement_plan:plan,name:replacement.name,url:replacement.url,tagline:replacement.tagline,logo_url:replacement.logo_url}:slot));setSelected(null);setMessage(`${replacement.name} has the ${PROMOTION_SLOTS.find(s=>s.position===selectedSlot.position)!.label.toLowerCase()} card for $${promotionDollars(promotionPlan(plan).price)}. ${promotionProtectionLabel(plan)}. Nobody can replace it during that period.`)}}/>}
 </>;
}
