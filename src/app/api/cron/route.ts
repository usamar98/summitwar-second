import {timingSafeEqual} from 'node:crypto';
import {rpc} from '@/lib/supabase';
import {processRefunds} from '@/lib/payments';
import {processPromotionRefunds} from '@/lib/promotion-payments';
import {processScreenshot} from '@/lib/screenshots';
export const maxDuration=60;
export async function GET(req:Request){const expected=`Bearer ${process.env.CRON_SECRET||''}`;const given=req.headers.get('authorization')||'';if(!process.env.CRON_SECRET||given.length!==expected.length||!timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});try{await rpc('tick');await processScreenshot();if(process.env.STRIPE_SECRET_KEY){const refunds=await Promise.allSettled([processRefunds(),processPromotionRefunds()]);if(refunds.some(r=>r.status==='rejected'))throw new Error('Refund retry required')}return Response.json({ok:true});}catch{return Response.json({error:'Scheduled work failed; retry required'},{status:500})}}
