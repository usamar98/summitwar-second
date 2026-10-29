'use client';
import {useEffect,useRef,useState,type MouseEvent,type ReactNode} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import type {Entry,Match,Product} from '@/lib/types';
import {SiteLogo} from './site-logo';
import {keepDialogFocus} from './promotion-booking-dialog';

type Detail={key:string;title:string;body:string;project?:Product};
function DemoDetail({detail,onClose}:{detail:Detail;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const modal=dialog.current;if(!modal)return;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;
  modal.showModal();document.body.style.overflow='hidden';
  return()=>{modal.close();document.body.style.overflow=overflow;if(trigger?.isConnected)trigger.focus()};
 },[]);
 return <dialog ref={dialog} className="promotion-dialog demo-detail" aria-labelledby="demo-detail-title" onCancel={event=>{event.preventDefault();onClose()}} onClick={event=>{if(event.target===event.currentTarget)onClose()}} onKeyDown={keepDialogFocus}><div className="promotion-dialog-content"><div className="promotion-dialog-heading"><div><p className="eyebrow">FICTIONAL DEMO</p><h2 id="demo-detail-title">{detail.title}</h2></div><button type="button" className="drawer-close" onClick={onClose} aria-label="Close demo details"><Cross2Icon width={22} height={22}/></button></div>{detail.project&&<div className="demo-project-heading"><SiteLogo src={detail.project.logo_url} name={detail.project.name} size={64}/><div><p>{detail.project.category}</p><p>by {detail.project.founder}</p></div></div>}<p className="demo-detail-body">{detail.body}</p>{detail.project&&<p className="demo-example-url">{detail.project.url}</p>}<p className="demo-detail-note">This is sample content for the visual preview. No real project, vote, sponsorship or purchase is created.</p></div></dialog>;
}

export function DemoPreview({projects,entries,matches,children}:{projects:Product[];entries:Entry[];matches:Match[];children:ReactNode}){
 const [detail,setDetail]=useState<Detail|null>(null);
 function inspect(event:MouseEvent<HTMLDivElement>){
  if(!(event.target instanceof Element))return;
  const anchor=event.target.closest('a');
  if(anchor){
   const url=new URL(anchor.href,location.href);
   if(url.pathname==='/promote'){event.preventDefault();event.stopPropagation();setDetail({key:'sample-sponsors',title:'Six sample sponsor places',body:'Fixed plans protect a card through quarterfinal results ($100), semifinal results ($200), or the next tournament start ($300). Nobody can replace a sponsor during that period. Use the demo controls to release shorter plans and preview a new placement. Visit the live tournament to make a real booking.'});return}
   let product=projects.find(project=>url.pathname===`/products/${project.slug}`||url.pathname===`/api/outbound/${project.id}`||url.href===project.url||url.href===`${project.url}/`);
   if(url.pathname==='/champions/demo-edition-001'||url.pathname===`/products/${projects[0].slug}`){event.preventDefault();event.stopPropagation();document.getElementById('demo-winner-benefits')?.scrollIntoView({block:'start'});return}
   const match=matches.find(match=>url.pathname===`/matches/${match.id}`);
   if(product){event.preventDefault();event.stopPropagation();setDetail({key:product.id,title:product.name,body:product.tagline,project:product});return}
   if(match){
    event.preventDefault();event.stopPropagation();
    const a=entries.find(entry=>entry.id===match.entry_a)?.snapshot,b=entries.find(entry=>entry.id===match.entry_b)?.snapshot;
    setDetail({key:match.id,title:match.round===3?'The final':match.round===2?'Semifinal result':'Quarterfinal result',body:`${a?.name}: ${match.score_a} sample votes. ${b?.name}: ${match.score_b} sample votes. ${match.winner_id===match.entry_a?a?.name:b?.name} advances${match.round===3?' as the community champion':''}.`});return;
   }
  }
  if(event.target.closest('.participant-row')&&(event.target.closest('button')||anchor?.getAttribute('href')==='/login')){event.preventDefault();event.stopPropagation();setDetail({key:'read-only',title:'A preview of the finished tournament',body:'These are fictional projects and sample votes. Saved apps, follows and voting work with real projects on the live tournament.'})}
 }
 return <div className="demo-preview" onClickCapture={inspect}>{children}{detail&&<DemoDetail key={detail.key} detail={detail} onClose={()=>setDetail(null)}/>}</div>;
}
