import path from 'node:path';
import nextEnv from '@next/env';
import Stripe from 'stripe';
import {createClient} from '@supabase/supabase-js';

nextEnv.loadEnvConfig(path.resolve(import.meta.dirname,'..'),true,{info(){},error(){}});
const required=['NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'];
const present=name=>Boolean(process.env[name]?.trim());
const missing=required.filter(name=>!present(name));
for(const name of required)console.log(`${present(name)?'SET':'MISSING'} ${name}`);
if(missing.length){console.log('Fill the missing values in .env.local or the hosting environment. No secret values are printed.');process.exitCode=1}
else if(process.argv.includes('--connect')){
 try{const account=await new Stripe(process.env.STRIPE_SECRET_KEY).balance.retrieve();console.log(`PASS: Stripe account is reachable in ${account.livemode?'LIVE':'TEST'} mode.`)}catch(error){console.log(`FAIL: Stripe account connection (${error.type||'provider request error'}). Check the account key and its permissions.`);process.exitCode=1}
 try{const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await db.rpc('promotion_price',{p_slot:1});if(error||data!==7000)throw Error('Database setup incomplete');console.log('PASS: Supabase is reachable and the current sponsor pricing is installed.')}catch{console.log('FAIL: Supabase connection or migration check. Verify its URL/server key and apply the setup files.');process.exitCode=1}
 console.log('A webhook signing secret can only be confirmed by receiving a signed event; no payment or refund was created.');
}
