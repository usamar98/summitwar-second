'use client';
import {useState} from 'react';
import Link from 'next/link';
import {PROMOTION_SLOTS,PROMOTION_PLANS,promotionPlan,promotionDollars,canBookPromotion,type PromotionPlan,type PromotionSlot} from '@/lib/promotion-slots';
import {PromotionPlanPicker} from './promotion-plan-picker';
async function post(body:unknown){const response=await fetch('/api/promotions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data}
export function PromotionForm({tournament,slots,signedIn,selectedSlot,enabled,fixedSlot}:{tournament?:string;slots:PromotionSlot[];signedIn:boolean;selectedSlot?:number;enabled:boolean;fixedSlot?:number}){
 const offers=slots.find(slot=>slot.available_plans!==undefined)?.available_plans??PROMOTION_PLANS;
 const [selected,setSelected]=useState<number[]>(fixedSlot?[fixedSlot]:selectedSlot&&slots.some(s=>s.position===selectedSlot&&canBookPromotion(s))?[selectedSlot]:[]);
 const [plan,setPlan]=useState<PromotionPlan>(offers[0]?.id??'tournament');
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[request,setRequest]=useState('');
 const total=selected.length*promotionPlan(plan).price;
 const unavailable=selected.some(p=>!slots.some(s=>s.position===p&&canBookPromotion(s)));
 const planAvailable=offers.some(p=>p.id===plan);
 function change(position:number){setSelected(s=>s.includes(position)?s.filter(p=>p!==position):[...s,position]);setRequest('')}
 return <form className="promotion-form" onSubmit={async event=>{
  event.preventDefault();setError('');setBusy(true);
  const id=request||crypto.randomUUID();setRequest(id);
  try{if(!planAvailable||unavailable)throw new Error('This card or protection period is unavailable. Refresh to see current availability.');const result=await post({tournament,slots:selected,plan,name,url,request:id});window.location.assign(result.url)}catch(error){setError((error as Error).message)}finally{setBusy(false)}
 }}><fieldset disabled={busy}>
  <legend>{fixedSlot?'Your startup details':'Choose your promotion cards'}</legend>
  {!fixedSlot&&<><div className="promotion-selector">{PROMOTION_SLOTS.map(slot=>{
   const current=slots.find(s=>s.position===slot.position),available=canBookPromotion(current);
   return <label key={slot.position} className={selected.includes(slot.position)?'selected':''}><input type="checkbox" checked={selected.includes(slot.position)} disabled={!available&&!selected.includes(slot.position)} onChange={()=>change(slot.position)}/><span>{slot.label}<small>{current?.state==='paid'?'Protected sponsor':available?'Available':'Unavailable'}</small></span></label>;
  })}</div><button type="button" className="text-link" onClick={()=>{setSelected(slots.filter(canBookPromotion).map(s=>s.position));setRequest('')}}>Select all available cards</button></>}
  <PromotionPlanPicker offers={offers} selected={plan} onChange={value=>{setPlan(value);setRequest('')}}/>
  {selected.length>1&&<p className="muted">The selected protection period applies to all {selected.length} cards in this purchase.</p>}
  <label htmlFor="promotion-name">Startup or app name</label><input id="promotion-name" value={name} onChange={event=>{setName(event.target.value);setRequest('')}} required minLength={2} maxLength={80} placeholder="Your startup"/>
  <label htmlFor="promotion-url">Website URL</label><input id="promotion-url" value={url} onChange={event=>{setUrl(event.target.value);setRequest('')}} required type="url" maxLength={2000} placeholder="https://yourstartup.com"/>
  <p className="muted">Your website’s favicon and tagline will be fetched automatically.</p>
  <div className="promotion-total"><span>{selected.length} {selected.length===1?'card':'cards'} · one-time payment</span><b>${promotionDollars(total)} USD</b></div>
  <p className="muted">Your placement begins after verified payment. It cannot be replaced during the purchased period. After that period, the card becomes available again. Every placement ends before the next tournament starts.</p>
  {!signedIn&&<p className={fixedSlot?'promotion-signin':'notice'}><Link href="/login">Sign in to book promotion ↗</Link></p>}
  <button className="button" disabled={busy||!signedIn||!enabled||!tournament||!selected.length||unavailable||!planAvailable}>{busy?'Opening secure checkout…':`Continue to checkout · $${promotionDollars(total)}`}</button>
  {!enabled&&(!fixedSlot||tournament)&&<p className="muted">Booking is currently unavailable.</p>}
  {unavailable&&tournament&&<p className="notice">A selected card is unavailable. Choose an available card or refresh after its protection period.</p>}
  <p className="form-error" role="alert">{error}</p>
 </fieldset></form>;
}
export function PromotionResume({order}:{order:string}){const [busy,setBusy]=useState(false),[error,setError]=useState('');return <div><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await post({action:'checkout',order});window.location.assign(result.url)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Loading checkout…':'Resume checkout'}</button><p className="form-error" role="alert">{error}</p></div>}
export function PromotionRemove({order}:{order:string}){const [reason,setReason]=useState(''),[message,setMessage]=useState('');return <div><label>Removal reason<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="button secondary" disabled={reason.trim().length<3} onClick={async()=>{try{await post({action:'remove',order,reason});setMessage('Placement removed. Paid purchases are queued for refund.')}catch(e){setMessage((e as Error).message)}}}>Remove placement and queue refund</button><p role="status">{message}</p></div>}
