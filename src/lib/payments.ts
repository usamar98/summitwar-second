import 'server-only';
import Stripe from 'stripe';
import {db,requireUser,rpc} from './supabase';
import {stripe} from './stripe-client';
export {stripe} from './stripe-client';
import {fulfillPromotionSession,promotionSignal} from './promotion-payments';
export async function checkout(entryId:string) {
 const u=await requireUser(); const client=db();
 const {data:e,error}=await client.from('entries').select('*,tournament:tournaments(*)').eq('id',entryId).eq('user_id',u.id).single();
 if(error||!e||e.status!=='approved')throw new Error('An approved application is required');
 const t=e.tournament; if(t.status!=='registration'||Date.now()>=Date.parse(t.registration_ends)||t.fee_amount_cents!==500||t.currency!=='usd')throw new Error('Entry is not eligible for checkout');
 const {data:r}=await client.from('reservations').select('*').eq('entry_id',e.id).eq('released',false).gt('expires_at',new Date(Date.now()+30*60000).toISOString()).maybeSingle();
 // Existing sessions remain reusable until their original provider expiry.
 const {data:existing}=await client.from('reservations').select('*').eq('entry_id',e.id).eq('released',false).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(existing?.checkout_id){const s=await stripe().checkout.sessions.retrieve(existing.checkout_id);if(s.status==='open'&&s.url)return s.url;throw new Error('Checkout has ended. Wait for payment confirmation or request another reservation.');}
 if(!r)throw new Error('Reservation expired or has less than 30 minutes remaining. Ask the organizer for a new reservation.');
 const base=process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000';
 const session=await stripe().checkout.sessions.create({mode:'payment',allowed_payment_method_types:['card'],adaptive_pricing:{enabled:false},line_items:[{price_data:{currency:t.currency,unit_amount:t.fee_amount_cents,product_data:{name:`SummitWar edition #${t.edition} entry`}},quantity:1}],expires_at:Math.floor(Date.parse(r.expires_at)/1000),client_reference_id:e.id,metadata:{entry_id:e.id,tournament_id:t.id,reservation_id:r.id},payment_intent_data:{metadata:{entry_id:e.id,tournament_id:t.id,reservation_id:r.id}},success_url:`${base}/checkout?entry=${e.id}`,cancel_url:`${base}/dashboard`,custom_text:{submit:{message:'One-time entry fee. Participation and promotion included. No traffic or sales guarantee. Organizer cancellation or removal before participation is refundable; losing is not.'}}},{idempotencyKey:`entry-reservation-${r.id}`});
 const {error:updateError}=await client.from('reservations').update({checkout_id:session.id,checkout_url:session.url}).eq('id',r.id); if(updateError)throw updateError;
 return session.url!;
}
export async function processRefunds() {
 const {data,error}=await db().from('payments').select('*').eq('status','refund_pending').limit(50); if(error)throw error;
 let failures=0;
 for(const p of data||[]){try{const refund=p.refund_id?await stripe().refunds.retrieve(p.refund_id):await stripe().refunds.create({payment_intent:p.intent_id},{idempotencyKey:`refund-${p.id}-${p.refund_attempts||0}`});const failed=refund.status==='failed'||refund.status==='canceled';const {error:e}=await db().from('payments').update({status:refund.status==='succeeded'?'refunded':'refund_pending',refund_id:failed?null:refund.id,refund_attempts:failed?(p.refund_attempts||0)+1:p.refund_attempts||0,last_refund_error:failed?'Provider refund failed':null}).eq('id',p.id).eq('status','refund_pending');if(e)throw e;}catch{failures++;await db().from('payments').update({last_refund_error:'Provider request failed; will retry with the same idempotency key'}).eq('id',p.id);}}
 if(failures)throw new Error('Some refunds require another retry');
}
export async function handleStripeEvent(event:Stripe.Event) {
 if(event.type==='checkout.session.completed'){
  const s=await stripe().checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id);
  if(s.metadata?.kind==='promotion'){await fulfillPromotionSession(event,s);return;}
  if(s.payment_status!=='paid'||s.mode!=='payment')return;
  const meta=s.metadata; if(!meta?.entry_id||!meta.reservation_id||!meta.tournament_id||!s.payment_intent)throw new Error('Missing checkout metadata');
  const {data:e}=await db().from('entries').select('tournament_id').eq('id',meta.entry_id).single();if(e?.tournament_id!==meta.tournament_id)throw new Error('Tournament mismatch');
  const intentId=typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id;
  const pi=await stripe().paymentIntents.retrieve(intentId,{expand:['latest_charge']});
  if(pi.status!=='succeeded'||pi.amount_received!==s.amount_total||pi.currency!==s.currency)throw new Error('Payment intent mismatch');
  const charge=typeof pi.latest_charge==='object'?pi.latest_charge:null;
  if(charge&&(charge.disputed||charge.amount_refunded===charge.amount))await rpc('record_payment_signal',{p_event:`${event.id}-signal`,p_type:event.type,p_intent:intentId,p_entry:meta.entry_id,p_status:charge.amount_refunded===charge.amount?'refunded':'disputed'});
  await rpc('fulfill_payment',{p_event:event.id,p_type:event.type,p_entry:meta.entry_id,p_checkout:s.id,p_intent:typeof s.payment_intent==='string'?s.payment_intent:s.payment_intent.id,p_amount:s.amount_total,p_currency:s.currency,p_reservation:meta.reservation_id});
 }else if(event.type==='checkout.session.expired'){
  const s=event.data.object as Stripe.Checkout.Session; const live=await stripe().checkout.sessions.retrieve(s.id);if(live.metadata?.kind==='promotion'){if(live.status==='expired'){const {error}=await db().from('promotion_orders').update({status:'expired'}).eq('checkout_id',live.id).eq('status','pending');if(error)throw error;}return;}if(live.status!=='expired')return;
  const {error}=await db().from('reservations').update({released:true}).eq('checkout_id',s.id);if(error)throw error;
 }else if(event.type==='charge.dispute.created'||event.type==='charge.refunded'){
  const obj=event.data.object as Stripe.Dispute|Stripe.Charge; const chargeId=event.type==='charge.dispute.created'?(typeof (obj as Stripe.Dispute).charge==='string'?(obj as Stripe.Dispute).charge as string:((obj as Stripe.Dispute).charge as Stripe.Charge).id):(obj as Stripe.Charge).id;const charge=await stripe().charges.retrieve(chargeId);
  if(charge.payment_intent){const intentId=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent.id;const pi=await stripe().paymentIntents.retrieve(intentId);if(await promotionSignal(event,pi,charge))return;if(pi.metadata.entry_id&&(charge.disputed||charge.amount_refunded===charge.amount))await rpc('record_payment_signal',{p_event:event.id,p_type:event.type,p_intent:intentId,p_entry:pi.metadata.entry_id,p_status:charge.amount_refunded===charge.amount?'refunded':'disputed'});}
 }
}

