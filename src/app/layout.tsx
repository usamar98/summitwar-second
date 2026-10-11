import type {Metadata} from 'next';
import Link from 'next/link';
import {Logo} from '@/components/ui';
import {SubmissionDrawer} from '@/components/submission-drawer';
import {VisitorStats} from '@/components/visitor-stats';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL(process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000'),title:{default:'SummitWar — 8 apps. 48 hours. One champion.',template:'%s · SummitWar'},description:'Ship your app. Enter the battle. Rule the summit. Weekly indie app tournaments chosen by the community.',icons:{icon:{url:'/war-logo.svg',type:'image/svg+xml'},apple:'/war-logo.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="nav-shell"><div className="nav brand-only"><Logo/></div></header><VisitorStats/><main id="main">{children}</main><SubmissionDrawer/><footer><Logo/><p>Built for the ones who ship.</p><div><Link href="/dashboard">Founder dashboard</Link><Link href="/rules">Rules & pricing</Link><Link href="/submit">Enter an app</Link><Link href="/admin">Admin</Link></div><small>Community choice. Real feedback. A place on the summit.</small></footer></body></html>}
