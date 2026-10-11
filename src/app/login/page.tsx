import {LoginForm} from '@/components/forms';
import {configured} from '@/lib/supabase';
export default function Login(){return <div className="page"><div className="login"><p className="eyebrow">WELCOME TO THE CLIMB</p><h1>Your next chapter<br/>starts here.</h1><p>Sign in to enter an app, vote in a battle, or share constructive feedback.</p><LoginForm configured={configured()}/><p className="muted">Browse apps and watch demos without an account.</p></div></div>}
