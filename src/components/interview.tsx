'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {command} from './forms';
export function Interview({id}:{id:string}){const [message,set]=useState('');const router=useRouter();return <form className="panel" onSubmit={async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{await command({action:'admin',command:'interview',target:id,data:Object.fromEntries(f)});set('Interview saved');router.refresh()}catch(e){set((e as Error).message)}}}><h3>Prepare the founder interview</h3>{['What did you build?','Who does it help?','Why did you build it?'].map(q=><label key={q}>{q}<textarea name={q} required maxLength={2000}/></label>)}<button className="button secondary">Save interview</button><p role="status">{message}</p></form>}
