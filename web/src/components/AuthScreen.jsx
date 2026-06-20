import React, { useState } from 'react';
import { Mail, User, Lock, Sparkles, ArrowLeft, Shield } from 'lucide-react';
import { supabase } from '../supabase';

/**
 * AuthScreen — Handles login, registration, and OTP verification.
 * Includes a "Try Demo" button for exploring the app without authentication.
 */
export default function AuthScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [authError, setAuthError] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError("Please fill in all fields.");
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      onLogin({
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email.split('@')[0]
      });
    } catch (e) {
      setAuthError(e.message || "Invalid credentials.");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setAuthError("Please fill in all fields.");
      return;
    }
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { name } }
      });
      if (error) throw error;
      setIsOtpMode(true);
    } catch (e) {
      setAuthError(`Registration failed: ${e.message}`);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'signup' });
      if (error) throw error;
      const loggedUser = {
        email: data.user.email,
        name: data.user.user_metadata?.name || email.split('@')[0]
      };
      try {
        await supabase.from('users').upsert({
          email: loggedUser.email, name: loggedUser.name,
          passwordHash: '••••••••', isSessionActive: true
        });
        const { data: profile } = await supabase
          .from('users')
          .select('virtual_number')
          .eq('email', loggedUser.email)
          .single();
        if (profile) {
          loggedUser.virtual_number = profile.virtual_number;
        }
      } catch (dbErr) { /* silent */ }
      onLogin(loggedUser);
      setIsOtpMode(false);
    } catch (e) {
      setAuthError(e.message || "Invalid code.");
    } finally {
      setIsAuthenticating(false);
    }
  };


  // --- OTP Screen ---
  if (isOtpMode) {
    return (
      <div className="auth-wrapper" id="auth-screen">
        <div className="auth-logo-container">
          <img src="/logo.png" alt="Aahat" className="auth-logo" />
        </div>
        <h2 className="auth-title">Verify Your Account</h2>
        <p className="auth-subtitle">Enter the code sent to <strong>{email}</strong></p>

        {authError && <div className="auth-error">{authError}</div>}

        <div className="auth-info-box">
          <Mail size={16} />
          <span>Check your email for a verification link, or enter the 6-digit code below.</span>
        </div>

        <form onSubmit={handleVerifyOtp} className="auth-form">
          <div className="input-group">
            <label htmlFor="otp-input">Verification Code</label>
            <div className="input-wrapper">
              <Shield size={16} />
              <input
                id="otp-input"
                type="text"
                maxLength="6"
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                autoComplete="one-time-code"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={isAuthenticating}>
            {isAuthenticating ? <span className="btn-loading">Verifying...</span> : "Verify Code"}
          </button>
          <button type="button" className="auth-link-btn" onClick={() => setIsOtpMode(false)}>
            <ArrowLeft size={14} /> Go back
          </button>
        </form>
      </div>
    );
  }

  // --- Register Screen ---
  if (isRegistering) {
    return (
      <div className="auth-wrapper" id="auth-screen">
        <div className="auth-logo-container">
          <img src="/logo.png" alt="Aahat" className="auth-logo" />
        </div>
        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Join Aahat and start messaging securely</p>

        {authError && <div className="auth-error">{authError}</div>}

        <form onSubmit={handleRegister} className="auth-form">
          <div className="input-group">
            <label htmlFor="register-name">Full Name</label>
            <div className="input-wrapper">
              <User size={16} />
              <input
                id="register-name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={e => setName(e.target.value)}
                autoComplete="name"
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="register-email">Email Address</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input
                id="register-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </div>
          <div className="input-group">
            <label htmlFor="register-password">Password</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                id="register-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={isAuthenticating}>
            {isAuthenticating ? <span className="btn-loading">Creating account...</span> : "Create Account"}
          </button>
          <div className="auth-toggle">
            Already have an account?{' '}
            <button type="button" className="auth-toggle-link" onClick={() => { setIsRegistering(false); setAuthError(null); }}>
              Sign In
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- Login Screen ---
  return (
    <div className="auth-wrapper" id="auth-screen">
      <div className="auth-logo-container">
        <img src="/logo.png" alt="Aahat" className="auth-logo" />
      </div>
      <h2 className="auth-title">Welcome to Aahat</h2>
      <p className="auth-subtitle">Sign in to continue your conversations</p>

      {authError && <div className="auth-error">{authError}</div>}

      <form onSubmit={handleLogin} className="auth-form">
        <div className="input-group">
          <label htmlFor="login-email">Email Address</label>
          <div className="input-wrapper">
            <Mail size={16} />
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
        </div>
        <div className="input-group">
          <label htmlFor="login-password">Password</label>
          <div className="input-wrapper">
            <Lock size={16} />
            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={isAuthenticating}>
          {isAuthenticating ? <span className="btn-loading">Signing in...</span> : "Sign In"}
        </button>
        <div className="auth-toggle">
          Don't have an account?{' '}
          <button type="button" className="auth-toggle-link" onClick={() => { setIsRegistering(true); setAuthError(null); }}>
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}
