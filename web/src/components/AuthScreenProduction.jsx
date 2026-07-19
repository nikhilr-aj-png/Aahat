import { useState } from 'react';
import { ArrowLeft, Lock, Mail, Shield, User } from 'lucide-react';
import { supabase } from '../supabase';

export default function AuthScreenProduction() {
  const [mode,setMode]=useState('login'); const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
  const [name,setName]=useState(''); const [otp,setOtp]=useState(''); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(null);
  const run=async operation=>{setBusy(true);setMessage(null);try{await operation();}catch(error){setMessage({type:'error',text:error.message});}finally{setBusy(false);}};
  const submit=event=>{event.preventDefault();run(async()=>{
    if(mode==='login'){const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;}
    if(mode==='register'){if(name.trim().length<2)throw new Error('Enter your full name.');const {error}=await supabase.auth.signUp({email,password,options:{data:{name:name.trim()}}});if(error)throw error;setMode('otp');setMessage({type:'success',text:'Verification code sent to your email.'});}
    if(mode==='otp'){const {error}=await supabase.auth.verifyOtp({email,token:otp,type:'signup'});if(error)throw error;}
    if(mode==='forgot'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/?recovery=1`});if(error)throw error;setMessage({type:'success',text:'Password reset link sent. Check your email.'});}
  });};
  return <div className={`auth-wrapper aahat-auth-card auth-mode-${mode}`}>
    <header className="aahat-auth-header">
      <img src="/logo.png" alt="Aahat" className="auth-logo"/>
      <h2 className="auth-title">{mode==='login'?'Welcome back':mode==='register'?'Create account':mode==='otp'?'Verify account':'Reset password'}</h2>
    </header>
    {message&&<div className={`auth-${message.type}`} role={message.type==='error'?'alert':'status'}>{message.text}</div>}
    <form onSubmit={submit} className="auth-form">
      {mode==='register'&&<label>Full name<div className="input-wrapper"><User size={16}/><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name" required/></div></label>}
      {mode!=='otp'&&<label>Email<div className="input-wrapper"><Mail size={16}/><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></div></label>}
      {(mode==='login'||mode==='register')&&<label>Password<div className="input-wrapper"><Lock size={16}/><input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode==='login'?'current-password':'new-password'} required/></div></label>}
      {mode==='otp'&&<label>Verification code<div className="input-wrapper"><Shield size={16}/><input inputMode="numeric" maxLength={6} value={otp} onChange={e=>setOtp(e.target.value.replace(/\D/g,''))} required/></div></label>}
      <button className="btn-primary" disabled={busy}>{busy?'Please wait…':mode==='login'?'Sign in':mode==='register'?'Create account':mode==='otp'?'Verify':'Send reset link'}</button>
    </form>
    {mode==='login' ? <div className="auth-footer-actions">
      <button type="button" className="auth-link-btn" onClick={()=>setMode('forgot')}>Forgot password?</button>
      <button type="button" className="auth-link-btn" onClick={()=>setMode('register')}>Create an account</button>
    </div> : <div className="auth-footer-actions single">
      <button type="button" className="auth-link-btn" onClick={()=>setMode('login')}><ArrowLeft size={14}/>Back to sign in</button>
    </div>}
  </div>;
}
import './AuthScreenProduction.css';
