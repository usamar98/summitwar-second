import {ImageResponse} from 'next/og';
export const alt='SummitWar — 8 apps. 12 hours. One champion.';
export const size={width:1200,height:630};
export const contentType='image/png';
export default function Image(){return new ImageResponse(<div style={{background:'#152017',width:'100%',height:'100%',display:'flex',padding:80,flexDirection:'column',color:'#ecf0e1',fontFamily:'sans-serif'}}><span style={{fontSize:28,color:'#d7eb9b'}}>summitwar.</span><div style={{fontSize:76,fontWeight:700,display:'flex',flexDirection:'column',marginTop:50}}><span>8 apps. 12 hours.</span><span style={{color:'#d7eb9b'}}>One champion.</span></div><span style={{fontSize:25,marginTop:40,color:'#b3bfa8'}}>Ship your app. Enter the battle. Rule the summit.</span></div>,size)}
