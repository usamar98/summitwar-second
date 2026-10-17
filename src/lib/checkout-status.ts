import 'server-only';
import {db} from './supabase';
import {paymentState,type PaymentKind} from './payment-state';

export async function checkoutStatus(kind:PaymentKind,id:string,owner:string){
 const table=kind==='entry'?'entries':'promotion_orders';
 const fields=kind==='entry'?'id,status,review_status,tournament:tournaments(fee_amount_cents),payments:payments(status,checkout_id),reservations:reservations(released,expires_at,checkout_id)':'id,status,amount,reserved_until,payments:promotion_payments(status)';
 const {data,error}=await db().from(table).select(fields).eq('id',id).eq('user_id',owner).maybeSingle();
 if(error)throw new Error('Payment status is temporarily unavailable');
 return data?paymentState(kind,data as unknown as Parameters<typeof paymentState>[1]):null;
}
