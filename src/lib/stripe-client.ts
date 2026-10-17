import 'server-only';
import Stripe from 'stripe';
export function stripe(){if(!process.env.STRIPE_SECRET_KEY)throw new Error('Stripe is not configured');return new Stripe(process.env.STRIPE_SECRET_KEY)}
export function stripeCheckoutReady(){return Boolean(process.env.STRIPE_SECRET_KEY?.trim()&&process.env.STRIPE_WEBHOOK_SECRET?.trim())}
export function requireStripeCheckout(){if(!stripeCheckoutReady())throw new Error('Payments are not connected yet. Please try again later.');checkoutOrigin()}
export function checkoutOrigin(){const value=process.env.NEXT_PUBLIC_APP_URL||(process.env.NODE_ENV==='production'?'':'http://localhost:3000');let url:URL;try{url=new URL(value)}catch{throw new Error('The payment return address is not configured')};if(url.username||url.password||url.pathname!=='/'||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('The payment return address must be your HTTPS website origin');return url.origin}
