import {VotingLink} from '@/components/voting-link';
export const metadata={title:'Your single-use voting link',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function VotePage(){return <div className="page narrow"><p className="eyebrow">EMAIL-FREE VOTING</p><h1>Your link.<br/>Your final choice.</h1><p className="lede">Watch both contenders, then choose the app you would actually use.</p><VotingLink/></div>}
