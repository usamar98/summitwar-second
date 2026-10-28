import Link from 'next/link';
import {ArrowTopRightIcon,CheckIcon,StarFilledIcon} from '@radix-ui/react-icons';
import styles from './tournament-rewards.module.css';

const benefits=[
 {title:'Tournament exposure & community feedback',detail:'Compete, collect votes, and let visitors follow or save your app.',everyone:true},
 {title:'Battle cards & shareable match links',detail:'Bring your community to the battle with a card built for sharing.',everyone:true},
 {title:'Private performance report',detail:'See your valid votes, recorded project views, website clicks and feedback.',everyone:true},
 {title:'Permanent startup page with a do-follow website link',detail:'Win a permanent page on SummitWar with a do-follow link to your startup’s website.',everyone:false},
 {title:'12-hour homepage winner spotlight',detail:'Take the center card above the tournament.',everyone:false},
 {title:'Champion badge & Hall of Fame',detail:'Keep your result and put the winner badge on your own website.',everyone:false},
 {title:'X promotion & founder interview',detail:'A winner announcement, pinned post and short interview.',everyone:false,manual:true},
];

export function TournamentRewards(){return <section className={`section tournament-rewards ${styles.rewards}`} aria-labelledby="rewards-heading">
 <div className={styles.heading}><div><p className="eyebrow">THE REWARDS</p><h2 id="rewards-heading">What you get from SummitWar.</h2></div><p>Free to enter. A stage for every founder.<br/>A permanent startup page for the winner.</p></div>
 <div className={styles.tableWrap}><table className={styles.table}><caption className="sr-only">Participant and winner benefits</caption><thead><tr><th scope="col">Your reward</th><th scope="col">Every participant</th><th scope="col"><span className={styles.winnerLabel}><StarFilledIcon aria-hidden="true"/>The winner</span></th></tr></thead><tbody>{benefits.map(benefit=><tr key={benefit.title}><th scope="row"><strong>{benefit.title}</strong><span>{benefit.detail}</span></th><td>{benefit.everyone?<span className={styles.included}><CheckIcon aria-hidden="true"/><span>Included</span></span>:<span className={styles.exclusive}>Winner only</span>}</td><td><span className={styles.included}><CheckIcon aria-hidden="true"/><span>{benefit.manual?'Organizer provided':'Included'}</span></span></td></tr>)}</tbody></table></div>
 <div className={styles.footer}><p>X posting, pinning and interviews are completed manually by the organizer. Permanent startup pages and their do-follow website links are reserved for winners; everyone keeps their tournament results and private report.</p><Link className="button secondary" href="/submit">Enter free <ArrowTopRightIcon aria-hidden="true"/></Link></div>
 </section>}
