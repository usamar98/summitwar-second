export type PaymentKind='entry'|'promotion';
export type PaymentState={state:'pending'|'confirmed'|'review'|'refund_pending'|'refunded'|'disputed'|'expired'|'removed'|'superseded';title:string;description:string;amount:number;canResume:boolean};
type Payment={status:string;checkout_id?:string|null};
type Booking={status:string;payments?:Payment[];amount?:number;reserved_until?:string;review_status?:string;tournament?:{fee_amount_cents:number};reservations?:{released:boolean;expires_at:string;checkout_id?:string|null}[]};

export function paymentState(kind:PaymentKind,booking:Booking,now=Date.now()):PaymentState{
 const activeReservation=booking.reservations?.find(r=>!r.released&&Date.parse(r.expires_at)>now);
 // A fresh reservation can follow a refunded attempt for the same tournament entry.
 const payments=kind==='entry'&&booking.status==='approved'&&activeReservation?(booking.payments||[]).filter(p=>p.checkout_id&&p.checkout_id===activeReservation.checkout_id):booking.payments||[],paid=payments.some(p=>p.status==='paid');
 const amount=kind==='entry'?booking.tournament?.fee_amount_cents||0:booking.amount||0;
 const result=(state:PaymentState['state'],title:string,description:string,canResume=false):PaymentState=>({state,title,description,amount,canResume});
 // A duplicate capture awaiting refund does not override a separate valid paid booking.
 if(!paid){
  if(payments.some(p=>p.status==='disputed'))return result('disputed','Payment under review.','This payment is disputed. The organizer is reviewing its status.');
  if(payments.some(p=>p.status==='refund_pending'))return result('refund_pending','Your refund is processing.','Your payment could not be used for this booking. Its refund is being processed; no additional payment is needed.');
  if(payments.some(p=>p.status==='refunded'))return result('refunded','Payment refunded.','The refund has been confirmed by the payment provider. Your bank controls when it appears in your account.');
 }
 if(booking.status==='removed'||booking.status==='rejected'||booking.status==='waitlisted')return result('removed','This booking is unavailable.','Check your dashboard for the organizer’s decision and any payment or refund updates.');
 if(kind==='promotion'){
  if(booking.status==='superseded')return result('superseded','Your sponsor card was overtaken.','Another sponsor has replaced your placement. You can book a card again for $100.');
  if(booking.status==='paid'&&paid)return result('confirmed','Your promotion is confirmed.','Your payment is verified. Your startup appears until another sponsor overtakes the card or the tournament ends.');
  if(booking.status==='expired'||booking.reserved_until&&Date.parse(booking.reserved_until)<=now)return result('expired',paid?'Your promotion has ended.':'Your reservation has ended.',paid?'This paid placement has reached the end of its tournament.':'If a late payment arrives after another buyer takes a selected card, it will be refunded. You can choose an available card for a new booking.');
  return result('pending','Waiting for payment confirmation.','This page updates automatically when Stripe confirms your payment. You can safely return to your dashboard while confirmation is pending.',booking.status==='pending');
 }
 if(booking.status==='confirmed'&&(paid||amount===0))return booking.review_status==='approved'?result('confirmed','You’re in.',amount===0?'Your free entry is confirmed.':'Your payment is verified and your tournament place is confirmed.'):result('review',amount===0?'Your entry is awaiting review.':'Payment verified. Review pending.','Your place is reserved. The organizer will review your app before it enters voting.');
 const active=booking.reservations?.some(r=>!r.released&&Date.parse(r.expires_at)>now);
 if(amount===0&&active)return result('review','Your free entry is awaiting review.','The organizer will review your app. No payment is required in any edition.');
 if(!active&&!paid)return result('expired','Your reservation has ended.','Open your dashboard to reclaim an available place for the same app. A payment that cannot secure a place will be refunded.');
 return result('pending','Waiting for payment confirmation.','This page updates automatically after your payment is verified. Completing a redirect alone does not confirm a payment.',false);
}
