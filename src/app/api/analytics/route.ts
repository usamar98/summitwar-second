import {record} from '@/lib/analytics';
import {uuid} from '@/lib/validation';
export async function POST(req:Request){if(req.headers.get('origin')!==new URL(req.url).origin)return new Response(null,{status:403});try{const {product,kind='view'}=await req.json();if(kind!=='view'&&kind!=='outbound')return new Response(null,{status:400});await record(req,uuid.parse(product),kind);return new Response(null,{status:204});}catch{return new Response(null,{status:400})}}
