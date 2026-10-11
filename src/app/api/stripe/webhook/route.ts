import {NextResponse} from 'next/server';
import {stripe,handleStripeEvent} from '@/lib/payments';
export async function POST(req:Request){let event;try{event=stripe().webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET||'');}catch{return NextResponse.json({error:'Invalid webhook signature'},{status:400})}try{await handleStripeEvent(event);return NextResponse.json({received:true});}catch{return NextResponse.json({error:'Webhook processing will be retried'},{status:500})}}
