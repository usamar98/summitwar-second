import {record} from '@/lib/analytics';
import {uuid} from '@/lib/validation';
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});try{const {product}=await req.json();await record(req,uuid.parse(product),'view');return new Response(null,{status:204});}catch{return new Response(null,{status:400})}}
