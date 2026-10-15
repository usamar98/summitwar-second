'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {VoteControl} from './vote-control';
type Battle={match:string;open:boolean;own:boolean;voted:boolean;entries:{id:string;name:string}[]};
export function VotingLink(){
 const [battle,setBattle]=useState<Battle|null>(null),[token,setToken]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let controller:AbortController|undefined;function load(){controller?.abort();setBattle(null);setError('');setToken('');const hash=new URLSearchParams(location.hash.slice(1)),match=hash.get('match'),value=hash.get('token');if(!match||!value||!/^[A-Za-z0-9_-]{43}$/.test(value)){setError('This voting link is incomplete. Open a battle to create a new one.');return;}setToken(value);controller=new AbortController();const signal=controller.signal;fetch('/api/vote?match='+encodeURIComponent(match),{cache:'no-store',signal}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error);if(!signal.aborted)setBattle(data)}).catch(e=>{if(!signal.aborted)setError(e.message)})}load();window.addEventListener('hashchange',load);return()=>{controller?.abort();window.removeEventListener('hashchange',load)}},[]);
 if(error)return <p className="notice" role="alert">{error} <Link href="/">Explore the tournament ↗</Link></p>;
 if(!battle)return <p role="status">Loading your battle…</p>;
 return <><p className="notice">This single-use link expires after ten minutes or when the match closes. Open it in the browser that created it. Your optional X handle is unverified.</p><Link className="text-link" href={`/matches/${battle.match}`}>Watch both contenders ↗</Link>{battle.voted?<p className="notice">Your final vote is already recorded.</p>:battle.own?<p className="notice">Founders cannot vote in their own match.</p>:!battle.open?<p className="notice">Voting is not open for this match.</p>:<div className="vote-link-choices">{battle.entries.map(e=><article className="panel" key={e.id}><h2>{e.name}</h2><VoteControl match={battle.match} entry={e.id} name={e.name} initialToken={token}/></article>)}</div>}</>;
}
