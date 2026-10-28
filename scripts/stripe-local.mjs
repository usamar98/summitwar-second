import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import nextEnv from '@next/env';

const root=path.resolve(import.meta.dirname,'..');
nextEnv.loadEnvConfig(root,true,{info(){},error(){}});
const hide=value=>String(value).replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g,'[private value hidden]');
const events='checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,charge.refunded,charge.dispute.created,payment_intent.payment_failed';

async function main(){
 if(process.argv.includes('--help')){console.log('npm run stripe:listen [-- --prepare]\nSaves the local signing secret, then forwards required TEST events to localhost:3000. --prepare only saves the secret.');return;}
 const key=process.env.STRIPE_SECRET_KEY?.trim();
 if(!/^(sk|rk)_test_/.test(key||''))throw Error('Set a Stripe test key in .env.local before starting the local listener. Live keys are not accepted.');
 const shim=path.join(root,'node_modules/@stripe/cli/bin/shim.js');
 if(!fs.existsSync(shim))throw Error('Install the project development dependencies before starting Stripe.');
 const temp=path.join(root,'.tmp');fs.mkdirSync(temp,{recursive:true});
 const config=path.join(temp,'stripe-local.toml');
 const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>!/^SUPABASE_|^NEXT_PUBLIC_|^STRIPE_|^VOTER_|^VOTE_RISK_|^CRON_|^TURNSTILE_/.test(name)));
 Object.assign(environment,{STRIPE_API_KEY:key,STRIPE_NO_AUTO_UPDATE:'1'});
 const common=['--skip-update','--config',config];
 const {stdout}=await promisify(execFile)(process.execPath,[shim,'listen','--print-secret',...common],{env:environment,windowsHide:true,timeout:30000});
 const signingSecret=stdout.match(/whsec_[A-Za-z0-9]+/)?.[0];
 if(!signingSecret)throw Error('Stripe did not return a local webhook signing secret.');
 const file=path.join(root,'.env.local'),previous=fs.readFileSync(file,'utf8');
 const next=/^STRIPE_WEBHOOK_SECRET=.*$/m.test(previous)?previous.replace(/^STRIPE_WEBHOOK_SECRET=.*$/m,'STRIPE_WEBHOOK_SECRET='+signingSecret):previous+'\nSTRIPE_WEBHOOK_SECRET='+signingSecret+'\n';
 if(next!==previous)fs.writeFileSync(file,next);
 console.log('Local Stripe signing secret is saved privately in .env.local.');
 if(process.argv.includes('--prepare'))return;
 console.log('Forwarding Stripe TEST events to http://localhost:3000/api/stripe/webhook. Keep this terminal running.');
 const child=spawn(process.execPath,[shim,'listen','--events',events,'--events-from','@self','--forward-to','http://localhost:3000/api/stripe/webhook',...common],{env:environment,windowsHide:true,stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr]){
  let pending='';
  stream.on('data',chunk=>{pending+=chunk.toString();const lines=pending.split(/[\r\n]+/);pending=lines.pop()||'';for(const line of lines)if(line)console.log(hide(line));});
  stream.on('end',()=>{if(pending)console.log(hide(pending));});
 }
 child.on('error',()=>{console.error('The local Stripe listener could not start.');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
 process.on('SIGINT',()=>child.kill());
 process.on('SIGTERM',()=>child.kill());
}
main().catch(error=>{console.error(hide(error.code==='ENOENT'?'The Stripe CLI is unavailable. Run npm install.':error.message||'Stripe connection failed.'));process.exitCode=1;});
