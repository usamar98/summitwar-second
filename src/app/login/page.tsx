import {LoginForm} from '@/components/forms';
import {configured} from '@/lib/supabase';
export default function Login(){return <div className="page"><div className="login"><p className="eyebrow">WELCOME TO THE CLIMB</p><h1>Your next chapter<br/>starts here.</h1><p>Founders sign in to enter an app, manage their projects, or share constructive feedback.</p><LoginForm configured={configured()}/><p className="muted">Browse, watch and vote without an account or email.</p></div></div>}
