'use client';
import {useState} from 'react';
export function SiteLogo({src,name,size=48}:{src:string;name:string;size?:number}){const [failed,setFailed]=useState(false);return <img src={failed?'/site-placeholder.svg':src||'/site-placeholder.svg'} onError={()=>setFailed(true)} width={size} height={size} alt={`${name} website favicon`} loading="lazy"/>}
