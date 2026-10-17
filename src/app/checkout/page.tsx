import {user} from '@/lib/supabase';
import {redirect,notFound} from 'next/navigation';
import {checkoutStatus} from '@/lib/checkout-status';
import {PaymentConfirmation} from '@/components/payment-confirmation';
import {uuid} from '@/lib/validation';
export const dynamic='force-dynamic';
export default async function CheckoutStatus({searchParams}:{searchParams:Promise<{entry?:string;promotion?:string;cancelled?:string}>}){
 const owner=await user();if(!owner)redirect('/login');const params=await searchParams;
 if(Boolean(params.entry)===Boolean(params.promotion))notFound();const kind=params.promotion?'promotion':'entry',id=uuid.safeParse(params.promotion||params.entry);if(!id.success)notFound();
 const status=await checkoutStatus(kind,id.data,owner.id);if(!status)notFound();
 return <div className="page narrow"><PaymentConfirmation key={`${kind}:${id.data}`} kind={kind} id={id.data} initial={status} cancelled={params.cancelled==='1'}/></div>;
}
