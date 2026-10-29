import {notFound,redirect} from 'next/navigation';
import {user} from '@/lib/supabase';
import {promotionInventory,promotionEnd,promotionTournament} from '@/lib/promotions';
import {PromotionForm} from '@/components/promotion-form';
import {PromotionOrders} from '@/components/promotion-orders';
import {LocalTime,LiveRefresh} from '@/components/widgets';
import {uuid} from '@/lib/validation';
import {stripeCheckoutReady} from '@/lib/stripe-client';
import {PROMOTION_PLANS} from '@/lib/promotion-slots';
export const dynamic='force-dynamic';
export default async function Promote({searchParams}:{searchParams:Promise<{tournament?:string;slot?:string;order?:string}>}){
 const params=await searchParams;
 if(params.order){if(!uuid.safeParse(params.order).success)notFound();redirect(`/checkout?promotion=${params.order}`)}
 if(params.tournament&&!uuid.safeParse(params.tournament).success)notFound();
 const [t,actor]=await Promise.all([promotionTournament(params.tournament),user()]);
 const [slots,end]=await Promise.all([promotionInventory(t?.id),promotionEnd(t?.id)]);
 const slot=Number(params.slot);
 return <div className="page promotion-page"><LiveRefresh tournament={t?.id}/><p className="eyebrow">SIX PLACES BESIDE THE SUMMIT</p><h1>Your place.<br/>Your protection period.</h1><p className="lede">Choose one card or all six. Pay $100 through quarterfinal results, $200 through semifinal results, or $300 for the whole tournament. Nobody can replace you during your purchased period.</p>{t?<p className="notice">Edition #{t.edition}: {t.theme}. Every plan begins after verified payment. Shorter plans release after all results for the corresponding round are final. Whole-tournament coverage includes the winner spotlight{end?<> and ends when the next tournament starts, currently scheduled for <LocalTime value={end}/></>:', until the next tournament starts'}.</p>:<p className="notice">Promotion booking opens after an edition is published.</p>}<div className="promotion-purchase-layout"><PromotionForm tournament={t?.id} slots={slots} signedIn={Boolean(actor)} selectedSlot={slot>=1&&slot<=6?slot:undefined} enabled={Boolean(t&&stripeCheckoutReady())}/><aside className="promotion-terms"><h2>Choose how long you stay</h2>{PROMOTION_PLANS.map(plan=><p key={plan.id}><b>${plan.price/100} per card · {plan.label}</b><br/>{plan.description}</p>)}<p>These are fixed one-time prices. The chosen period applies to every card in the purchase. You may book any available card, including all six. Once paid, a card is protected until that plan ends. It can then be booked again for a remaining period.</p><p>Cards are labelled Promoted. Sponsorship does not enter the competition, add votes or buy the winner position.</p><p>Checkout reserves your cards for up to 60 minutes. Each plan closes for booking 31 minutes before its scheduled end. Cancellation, organizer removal or failed placement is refundable. Ordinary expiry is not refundable. No traffic or sales guarantee.</p></aside></div>{actor&&<PromotionOrders actor={actor.id}/>}</div>;
}
