import {requireUser} from '@/lib/supabase';
import {entryReport} from '@/lib/entry-report';
import {uuid} from '@/lib/validation';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const u=await requireUser();const {id}=await params;return Response.json(await entryReport(uuid.parse(id),u.id),{headers:{'Cache-Control':'private,no-store','Content-Disposition':`attachment; filename="summitwar-results-${id}.json"`}})}catch{return Response.json({error:'Sign in as the project owner to view this report'},{status:403})}}
