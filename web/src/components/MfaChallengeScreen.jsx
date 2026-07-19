import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../supabase';
import { formatMfaFactorName } from '../utils/mfa';
import './SecurityAuth.css';

export default function MfaChallengeScreen({ challenge, onVerified, onSignOut }) {
  const factors = challenge?.factors || [];
  const [factorId, setFactorId] = useState(factors[0]?.id || '');
  const [code, setCode] = useState('');
  const [error, setError] = useState(challenge?.error || '');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const selectedFactor = useMemo(() => factors.find(factor => factor.id === factorId), [factorId, factors]);

  useEffect(() => {
    if (!factors.some(factor => factor.id === factorId)) setFactorId(factors[0]?.id || '');
  }, [factorId, factors]);

  useEffect(() => { inputRef.current?.focus(); }, [factorId]);

  const verify = async event => {
    event.preventDefault();
    if (!factorId || code.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    if (verifyError) {
      setBusy(false);
      setCode('');
      setError('That code is invalid or expired. Enter the latest code and try again.');
      inputRef.current?.focus();
      return;
    }
    try {
      await onVerified();
    } catch (refreshError) {
      setError(refreshError?.message || 'Your secure session could not be refreshed.');
      setBusy(false);
    }
  };

  return (
    <main className="mfa-gate">
      <form className="mfa-gate-card" onSubmit={verify}>
        <img src="/logo.png" alt="Aahat" className="mfa-gate-logo" />
        <div className="mfa-gate-icon"><ShieldCheck size={28} /></div>
        <span className="mfa-gate-eyebrow">Protected sign-in</span>
        <h1>Two-step verification</h1>
        <p>Open your authenticator app and enter the current 6-digit code to continue to Aahat.</p>

        {factors.length > 1 && (
          <label className="mfa-factor-select">Authenticator
            <select value={factorId} onChange={event => setFactorId(event.target.value)} disabled={busy}>
              {factors.map(factor => <option value={factor.id} key={factor.id}>{formatMfaFactorName(factor.friendly_name)}</option>)}
            </select>
          </label>
        )}

        {error && <div className="mfa-gate-error" role="alert">{error}</div>}
        {factors.length > 0 ? (
          <>
            <label className="mfa-code-field">
              <KeyRound size={18} />
              <input
                ref={inputRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label={`Code for ${formatMfaFactorName(selectedFactor?.friendly_name)}`}
                placeholder="000000"
                disabled={busy}
                required
              />
            </label>
            <button className="mfa-primary" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
          </>
        ) : <><p className="mfa-gate-help">No verified authenticator is available for this session. Check again or sign out and contact support to recover access.</p><button type="button" className="mfa-primary" onClick={onVerified} disabled={busy}>Check again</button></>}

        <button type="button" className="mfa-signout" onClick={onSignOut} disabled={busy}><LogOut size={15} />Sign out</button>
        <small>Codes refresh about every 30 seconds. Aahat never receives access to your authenticator account.</small>
      </form>
    </main>
  );
}
