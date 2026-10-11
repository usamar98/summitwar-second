import {submissionContext} from '@/lib/submission-context';
import {uuid} from '@/lib/validation';
export async function GET(req:Request){try{const id=new URL(req.url).searchParams.get('tournament');return Response.json(await submissionContext(id?uuid.parse(id):undefined),{headers:{'Cache-Control':'private, no-store'}})}catch{return Response.json({error:'Could not load available places. Please try again.'},{status:503,headers:{'Cache-Control':'no-store'}})}}
