'use client';
import {ArrowTopRightIcon} from '@radix-ui/react-icons';

export function WinnerWebsiteLink({product,url}:{product:string;url:string}){
 function track(){void fetch('/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({product,kind:'outbound'}),keepalive:true}).catch(()=>{})}
 return <a className="button" href={url} target="_blank" rel="noopener noreferrer" onClick={track} onAuxClick={event=>{if(event.button===1)track()}}>Visit app <ArrowTopRightIcon/></a>;
}
