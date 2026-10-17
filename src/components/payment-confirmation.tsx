'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {ActionButton} from './forms';
import {PromotionResume} from './promotion-form';
import type {PaymentKind,PaymentState} from '@/lib/payment-state';

export function PaymentConfirmation({kind,id,initial,cancelled=false}:{kind:PaymentKind;id:string;initial:PaymentState;cancelled?:boolean}){
 const [status,setStatus]=useState(initial),[message,setMessage]=useState(''),[checking,setChecking]=useState(false);
 const request=useRef<AbortController|null>(null),mounted=useRef(true);
 const check=useCallback(async()=>{
  if(request.current)return;const controller=new AbortController();request.current=controller;setChecking(true);
  try{const response=await fetch(`/api/payments/status?kind=${kind}&id=${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal});const data=await response.json();if(!response.ok)throw new Error(data.error||'Payment status is temporarily unavailable');if(mounted.current){setStatus(data);setMessage('')}}catch(error){if(mounted.current&&!controller.signal.aborted)setMessage(error instanceof Error?error.message:'Please check your payment status again.')}finally{request.current=null;if(mounted.current)setChecking(false)}
 },[kind,id]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;request.current?.abort()}},[]);
 useEffect(()=>{
  if(status.state!=='pending')return;const started=Date.now();
  const update=()=>{if(Date.now()-started>=120000){clearInterval(timer);setMessage('Confirmation is taking longer than usual. Use Check status or return to your dashboard; please avoid paying again.');return}if(!document.hidden)void check()};
  const timer=setInterval(update,3000);document.addEventListener('visibilitychange',update);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update)};
 },[status.state,check]);
 return <section className="panel" aria-label="Payment confirmation">
  <p className="eyebrow">{kind==='promotion'?'SPONSORSHIP':'TOURNAMENT ENTRY'} · {status.amount?`$${(status.amount/100).toFixed(2)} USD`:'FREE ENTRY'}</p>
  <div aria-live="polite"><h1>{status.title}</h1><p className="lede">{status.description}</p></div>
  {cancelled&&status.state==='pending'&&<p className="notice">You left checkout before it finished. You can resume the same reservation below.</p>}
  {status.canResume&&(kind==='entry'?<ActionButton payload={{action:'checkout',entry:id}}>Resume secure checkout ↗</ActionButton>:<PromotionResume order={id}/>)}
  <div className="row"><Link className="button" href="/dashboard">Your dashboard ↗</Link>{kind==='promotion'&&status.state==='confirmed'&&<Link className="text-link" href="/">View the tournament ↗</Link>}<button type="button" className="button secondary" disabled={checking} onClick={()=>void check()}>{checking?'Checking…':'Check status'}</button></div>
  <p className="form-error" role="status">{message}</p>
 </section>;
}
