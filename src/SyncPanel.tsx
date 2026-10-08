import { useEffect, useState } from 'react';
import { supabase, syncWorkouts } from './sync';
export function SyncPanel({visible}: {visible:boolean}) {
  const [email,setEmail]=useState(''), [password,setPassword]=useState('');
  const [user,setUser]=useState<string | null>(null), [status,setStatus]=useState('Sign in to sync.'), [busy,setBusy]=useState(false);
  async function sync(cloudOnly=false) {
    if(!navigator.onLine) {setStatus('Offline: changes saved on this device.'); return;}
    try {const result=await syncWorkouts(cloudOnly); if(result) setStatus(result);} catch(e) {setStatus(e instanceof Error ? e.message : String(e));}
  }
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setUser(data.session?.user.email || null));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user.email || null));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{
    if(!user) return;
    void sync();
    const tick=setInterval(()=>void sync(),5000);
    const wake=()=>void sync();
    addEventListener('online',wake);addEventListener('focus',wake);
    return ()=>{clearInterval(tick);removeEventListener('online',wake);removeEventListener('focus',wake);};
  },[user]);
  async function auth(signUp=false) {
    setBusy(true);
    try {
      const credentials={email,password};
      const {data,error}=signUp ? await supabase.auth.signUp({...credentials,options:{emailRedirectTo:location.origin+location.pathname}}) : await supabase.auth.signInWithPassword(credentials);
      if(error) throw error;
      setPassword('');setStatus(data.session ? 'Signed in. Syncing…' : 'Check email to confirm the account, then sign in on both devices.');
    } catch(e) {setStatus(e instanceof Error ? e.message : String(e));}
    finally{setBusy(false);}
  }
  if(!visible) return null;
  return <section className="card"><h2>Device syncing</h2><p>Use the same email and password on both devices. Changes sync every five seconds while the app is open and online; offline changes sync after reconnecting. Conflicting edits pause syncing instead of overwriting data.</p>
    {user ? <><p>Signed in: {user}</p><button onClick={()=>void sync()}>Sync now</button><button className="secondary" onClick={async()=>{const {error}=await supabase.auth.signOut();if(error)setStatus(error.message);else setStatus('Signed out. Local data retained.');}}>Sign out</button>
    {status.includes('conflict') && <button className="secondary" onClick={()=>{if(confirm('Download a backup of local changes and replace them with the cloud version?'))void sync(true);}}>Resolve using cloud version (backup first)</button>}</> : <form onSubmit={e=>{e.preventDefault();void auth();}}><label>Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" minLength={6} required value={password} onChange={e=>setPassword(e.target.value)} /></label><button disabled={busy}>Sign in</button><button type="button" disabled={busy || !email || password.length<6} className="secondary" onClick={()=>void auth(true)}>Create account</button></form>}
    <p role="status">{status}</p></section>;
}
