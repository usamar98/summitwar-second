import {z} from 'zod';
import {normalizeUrl} from './rules';
const text=(max:number)=>z.string().trim().min(2).max(max);
const url=z.string().transform((v,ctx)=>{try{normalizeUrl(v);return new URL(v).toString()}catch{ctx.addIssue({code:'custom',message:'Enter a public HTTP or HTTPS URL'});return z.NEVER}});
const media=z.string().url().refine(v=>{try{normalizeUrl(v);return new URL(v).protocol==='https:'}catch{return false}},'Use a public HTTPS media URL');
export const productSchema=z.object({name:text(80),url,logo_url:media,category:text(60),tagline:text(180),audience:text(1000),problem:text(1500),pricing:text(250),free_trial:z.boolean(),screenshot_url:media,demo_url:media,founder:text(80),x_handle:z.string().trim().max(16).regex(/^@?[a-zA-Z0-9_]*$/).optional(),question:text(300),offer_url:z.union([url,z.literal('')]).optional()});
export const uuid=z.string().uuid();
