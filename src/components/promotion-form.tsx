'use client';
import {useState} from 'react';
import Link from 'next/link';
import {PROMOTION_SLOTS,promotionTotal,canBookPromotion,type PromotionSlot} from '@/lib/promotion-slots';
async function post(body:unknown){const response=await fetch('/api/promotions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.error);return data}
export function PromotionForm({tournament,slots,signedIn,selectedSlot,enabled,fixedSlot}:{tournament?:string;slots:PromotionSlot[];signedIn:boolean;selectedSlot?:number;enabled:boolean;fixedSlot?:number}){
 const [selected,setSelected]=useState<number[]>(fixedSlot?[fixedSlot]:selectedSlot&&slots.some(s=>s.position===selectedSlot&&canBookPromotion(s))?[selectedSlot]:[]);
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[request,setRequest]=useState('');
 const total=selected.length?promotionTotal(selected):0;
 const unavailable=selected.some(p=>!slots.some(s=>s.position===p&&canBookPromotion(s)));
 const replacing=selected.filter(p=>slots.some(s=>s.position===p&&s.state==='paid'));
 function change(position:number){setSelected(s=>s.includes(position)?s.filter(p=>p!==position):[...s,position]);setRequest('')}
 return <form className="promotion-form" onSubmit={async event=>{
  event.preventDefault();setError('');setBusy(true);
  const id=request||crypto.randomUUID();setRequest(id);
  try{const result=await post({tournament,slots:selected,name,url,request:id});window.location.assign(result.url)}catch(error){setError((error as Error).message)}finally{setBusy(false)}
 }}><fieldset disabled={busy}>
  <legend>{fixedSlot?'Your startup details':'1. Choose your promotion cards'}</legend>
  {!fixedSlot&&<><div className="promotion-selector">{PROMOTION_SLOTS.map(slot=>{
   const current=slots.find(s=>s.position===slot.position),available=canBookPromotion(current);
   return <label key={slot.position} className={selected.includes(slot.position)?'selected':''}><input type="checkbox" checked={selected.includes(slot.position)} disabled={!available&&!selected.includes(slot.position)} onChange={()=>change(slot.position)}/><span>{slot.label}<small>{available?(current?.state==='paid'?`Overtake ${current.name||'current sponsor'}`:'Available'):'Unavailable'}</small></span><b>${slot.price/100}</b></label>;
  })}</div><button type="button" className="text-link" onClick={()=>{setSelected(slots.filter(canBookPromotion).map(s=>s.position));setRequest('')}}>Select all bookable cards</button></>}
  <label htmlFor="promotion-name">{fixedSlot?'Startup or app name':'2. Startup or app name'}</label><input id="promotion-name" value={name} onChange={event=>{setName(event.target.value);setRequest('')}} required minLength={2} maxLength={80} placeholder="Your startup"/>
  <label htmlFor="promotion-url">Website URL</label><input id="promotion-url" value={url} onChange={event=>{setUrl(event.target.value);setRequest('')}} required type="url" maxLength={2000} placeholder="https://yourstartup.com"/>
  <p className="muted">Your website’s favicon and tagline will be fetched automatically.</p>
  <div className="promotion-total"><span>{selected.length} {selected.length===1?'card':'cards'} · until overtaken or tournament ends</span><b>${total/100} USD</b></div>
  {replacing.length>0&&<p className="muted">Your payment will replace the current sponsor on {replacing.length===1?'this card':`these ${replacing.length} cards`}. Their ad stays visible until your payment is verified.</p>}
  <p className="muted">Any sponsor can overtake your card for $100. Your placement ends when replaced or when this tournament’s spotlight ends. Being overtaken does not trigger a refund.</p>
  {!signedIn&&<p className={fixedSlot?'promotion-signin':'notice'}><Link href="/login">Sign in to book promotion ↗</Link></p>}
  <button className="button" disabled={busy||!signedIn||!enabled||!tournament||!selected.length||unavailable}>{busy?'Opening secure checkout…':`Continue to checkout · $${total/100}`}</button>
  {!enabled&&(!fixedSlot||tournament)&&<p className="muted">Booking is currently unavailable.</p>}
  {unavailable&&!fixedSlot&&<p className="notice">Some selected cards are unavailable. Uncheck them or resume your booking below.</p>}
  <p className="form-error" role="alert">{error}</p>
 </fieldset></form>;
}
export function PromotionResume({order}:{order:string}){const [busy,setBusy]=useState(false),[error,setError]=useState('');return <div><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);try{const result=await post({action:'checkout',order});window.location.assign(result.url)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Loading checkout…':'Resume checkout'}</button><p className="form-error" role="alert">{error}</p></div>}
export function PromotionRemove({order}:{order:string}){const [reason,setReason]=useState(''),[message,setMessage]=useState('');return <div><label>Removal reason<input value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className="button secondary" disabled={reason.trim().length<3} onClick={async()=>{try{await post({action:'remove',order,reason});setMessage('Placement removed. Paid purchases are queued for refund.')}catch(e){setMessage((e as Error).message)}}}>Remove placement and queue refund</button><p role="status">{message}</p></div>}


