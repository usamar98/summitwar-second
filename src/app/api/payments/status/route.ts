import {requireUser} from '@/lib/supabase';
import {checkoutStatus} from '@/lib/checkout-status';
import {uuid} from '@/lib/validation';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 let owner;try{owner=await requireUser()}catch{return Response.json({error:'Sign in to view your payment status'},{status:401,headers})}
 const params=new URL(request.url).searchParams,kind=params.get('kind'),id=uuid.safeParse(params.get('id'));
 if(!id.success||kind!=='entry'&&kind!=='promotion')return Response.json({error:'Invalid payment booking'},{status:400,headers});
 try{const status=await checkoutStatus(kind,id.data,owner.id);return status?Response.json(status,{headers}):Response.json({error:'Booking not found'},{status:404,headers})}catch{return Response.json({error:'Payment status is temporarily unavailable'},{status:503,headers})}
}
