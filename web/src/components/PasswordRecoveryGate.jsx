import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

export default function PasswordRecoveryGate(){
  const [active,setActive]=useState(()=>new URLSearchParams(location.search).get('recovery')==='1'||location.hash.includes('type=recovery'));
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setActive(true);});return()=>subscription.unsubscribe();},[]);
  if(!active)return null;
  const submit=async event=>{event.preventDefault();if(password.length<8)return setError('Password must be at least 8 characters.');if(password!==confirm)return setError('Passwords do not match.');setBusy(true);const {error:updateError}=await supabase.auth.updateUser({password});setBusy(false);if(updateError)return setError(updateError.message);history.replaceState({},'',location.pathname);setActive(false);};
  return <div className="modal-overlay" style={{zIndex:5000}}><form className="modal-card" onSubmit={submit}><h3>Choose a new password</h3>{error&&<div className="auth-error">{error}</div>}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password" required/><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm password" required/><button className="btn-primary" disabled={busy}>{busy?'Updating…':'Update password'}</button></form></div>;
}
