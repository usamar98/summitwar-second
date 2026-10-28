import 'server-only';
import Stripe from 'stripe';
import {db,requireUser,rpc} from './supabase';
import {stripe} from './stripe-client';
export {stripe} from './stripe-client';
import {fulfillPromotionSession,promotionSignal} from './promotion-payments';
export async function checkout(_entryId:string):Promise<string> {
 await requireUser();
 throw new Error('Tournament entry is always free. Submit your app without payment.');
}
export async function processRefunds() {
 const {data,error}=await db().from('payments').select('*').eq('status','refund_pending').limit(50); if(error)throw error;
 let failures=0;
 for(const p of data||[]){try{const refund=p.refund_id?await stripe().refunds.retrieve(p.refund_id):await stripe().refunds.create({payment_intent:p.intent_id},{idempotencyKey:`refund-${p.id}-${p.refund_attempts||0}`});const failed=refund.status==='failed'||refund.status==='canceled';const {error:e}=await db().from('payments').update({status:refund.status==='succeeded'?'refunded':'refund_pending',refund_id:failed?null:refund.id,refund_attempts:failed?(p.refund_attempts||0)+1:p.refund_attempts||0,last_refund_error:failed?'Provider refund failed':null}).eq('id',p.id).eq('status','refund_pending');if(e)throw e;}catch{failures++;await db().from('payments').update({last_refund_error:'Provider request failed; will retry with the same idempotency key'}).eq('id',p.id);}}
 if(failures)throw new Error('Some refunds require another retry');
}
export async function handleStripeEvent(event:Stripe.Event) {
 if(event.type==='checkout.session.completed'||event.type==='checkout.session.async_payment_succeeded'){
  const s=await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
  if(s.metadata?.kind==='promotion'){await fulfillPromotionSession(event,s);return;}
  if(s.payment_status!=='paid'||s.mode!=='payment')return;
  const meta=s.metadata; if(!meta?.entry_id||!meta.reservation_id||!meta.tournament_id||!s.payment_intent)throw new Error('Missing checkout metadata');
  const {data:e}=await db().from('entries').select('tournament_id').eq('id',meta.entry_id).single();if(e?.tournament_id!==meta.tournament_id)throw new Error('Tournament mismatch');
  const intentId=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id;
  const pi=await stripe().paymentIntents.retrieve(intentId,{expand:['latest_charge']});
  if(pi.status!=='succeeded'||pi.amount_received!==s.amount_total||pi.currency!==s.currency||pi.metadata?.entry_id!==meta.entry_id||pi.metadata?.tournament_id!==meta.tournament_id||pi.metadata?.reservation_id!==meta.reservation_id)throw new Error('Payment intent mismatch');
  const charge=typeof pi.latest_charge==='object'?pi.latest_charge:null;
  if(charge&&(charge.disputed||charge.amount_refunded===charge.amount))await rpc('record_payment_signal',{p_event:`${event.id}-signal`,p_type:event.type,p_intent:intentId,p_entry:meta.entry_id,p_status:charge.amount_refunded===charge.amount?'refunded':'disputed'});
  await rpc('fulfill_payment',{p_event:event.id,p_type:event.type,p_entry:meta.entry_id,p_checkout:s.id,p_intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id,p_amount:s.amount_total,p_currency:s.currency,p_reservation:meta.reservation_id});
 }else if(event.type==='checkout.session.expired'){
  const s=event.data.object as Stripe.Checkout.Session; const live=await stripe().checkout.sessions.retrieve(s.id);if(live.metadata?.kind==='promotion'){if(live.status==='expired'){const {error}=await db().from('promotion_orders').update({status:'expired'}).eq('checkout_id',live.id).eq('status','pending');if(error)throw error;}return;}// Legacy entry checkout expiry must not release a now-free application.
  return;
 }else if(event.type==='charge.dispute.created'||event.type==='charge.refunded'){
  const obj=event.data.object as Stripe.Dispute|Stripe.Charge; const chargeId=event.type==='charge.dispute.created'?(typeof (obj as Stripe.Dispute).charge==='string'?(obj as Stripe.Dispute).charge as string:((obj as Stripe.Dispute).charge as Stripe.Charge).id):(obj as Stripe.Charge).id;const charge=await stripe().charges.retrieve(chargeId);
  if(charge.payment_intent){const intentId=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent.id;const pi=await stripe().paymentIntents.retrieve(intentId);if(await promotionSignal(event,pi,charge))return;if(pi.metadata.entry_id&&(charge.disputed||charge.amount_refunded===charge.amount))await rpc('record_payment_signal',{p_event:event.id,p_type:event.type,p_intent:intentId,p_entry:pi.metadata.entry_id,p_status:charge.amount_refunded===charge.amount?'refunded':'disputed'});}
 }
}

