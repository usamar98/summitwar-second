import {NextResponse} from 'next/server';
import {stripe,handleStripeEvent} from '@/lib/payments';
import {stripeCheckoutReady} from '@/lib/stripe-client';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(req:Request){if(!stripeCheckoutReady())return NextResponse.json({error:'Payment service unavailable'},{status:503});let event;try{event=stripe().webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET!);}catch{return NextResponse.json({error:'Invalid webhook signature'},{status:400})}try{await handleStripeEvent(event);return NextResponse.json({received:true});}catch{return NextResponse.json({error:'Webhook processing will be retried'},{status:500})}}
