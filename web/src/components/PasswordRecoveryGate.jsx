import { useEffect, useState } from 'react';
import { supabase } from '../supabase';

const isStrongPassword = password => password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);

export default function PasswordRecoveryGate(){
  const [active,setActive]=useState(()=>new URLSearchParams(location.search).get('recovery')==='1'||location.hash.includes('type=recovery'));
  const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  useEffect(()=>{const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setActive(true);});return()=>subscription.unsubscribe();},[]);
  if(!active)return null;
  const submit=async event=>{
    event.preventDefault();setError('');
    if(!isStrongPassword(password))return setError('Use at least 8 characters with uppercase, lowercase, and a number.');
    if(password!==confirm)return setError('Passwords do not match.');
    setBusy(true);
    const {error:updateError}=await supabase.auth.updateUser({password});
    if(updateError){setBusy(false);return setError(updateError.message);}
    const {error:signOutError}=await supabase.auth.signOut({scope:'others'});
    setBusy(false);
    if(signOutError)return setError('Password updated, but other sessions could not be signed out.');
    history.replaceState({},'',location.pathname);setPassword('');setConfirm('');setActive(false);
  };
  return <div className="modal-overlay" style={{zIndex:5000}}><form className="modal-card" onSubmit={submit}><h3>Choose a new password</h3><p>Use at least 8 characters with uppercase, lowercase, and a number.</p>{error&&<div className="auth-error" role="alert">{error}</div>}<input type="password" autoComplete="new-password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} placeholder="New password" required/><input type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Confirm password" required/><button className="btn-primary" disabled={busy||!password||!confirm}>{busy?'Updating…':'Update password'}</button></form></div>;
}
