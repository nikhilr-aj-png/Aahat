import { useMemo, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck, Smartphone, X } from 'lucide-react';
import './SecurityAuth.css';
import { formatMfaFactorName } from '../utils/mfa';

const passwordChecks = password => [
  { label: 'At least 8 characters', met: password.length >= 8 },
  { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'One lowercase letter', met: /[a-z]/.test(password) },
  { label: 'One number', met: /\d/.test(password) }
];

export default function SecuritySettingsSection({
  busy, busyAction, feedback, factors, enrollment,
  onChangePassword, onStartMfa, onVerifyMfa, onCancelMfa, onDisableMfa
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [factorToDisable, setFactorToDisable] = useState(null);
  const [disablePassword, setDisablePassword] = useState('');
  const checks = useMemo(() => passwordChecks(newPassword), [newPassword]);
  const passwordReady = currentPassword && checks.every(check => check.met) && newPassword === confirmPassword && newPassword !== currentPassword;
  const passwordBusy = busyAction === 'password';
  const setupBusy = busyAction === 'mfa-setup';
  const verifyBusy = busyAction === 'mfa-verify';
  const cancelBusy = busyAction === 'mfa-cancel';
  const disableBusy = busyAction === 'mfa-disable';

  const changePassword = async event => {
    event.preventDefault();
    if (!passwordReady) return;
    const changed = await onChangePassword({ currentPassword, newPassword, confirmPassword });
    if (changed) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const verifyEnrollment = async event => {
    event.preventDefault();
    if (mfaCode.length !== 6) return;
    const verified = await onVerifyMfa(mfaCode);
    if (verified) setMfaCode('');
  };

  const cancelEnrollment = async () => {
    const cancelled = await onCancelMfa();
    if (cancelled) setMfaCode('');
  };

  const disableFactor = async event => {
    event.preventDefault();
    if (!factorToDisable || !disablePassword) return;
    const disabled = await onDisableMfa(factorToDisable.id, disablePassword);
    if (disabled) {
      setFactorToDisable(null);
      setDisablePassword('');
    }
  };

  return (
    <section className="security-settings-section">
      <div className="security-title">
        <div><LockKeyhole size={22} /></div>
        <span><h3>Security</h3><p>Protect your password and sign-ins.</p></span>
      </div>
      {feedback && <div className={`security-inline-message ${feedback.type}`} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.text}</div>}

      <form className="password-security-card" onSubmit={changePassword}>
        <div className="security-card-heading"><KeyRound size={19} /><span><strong>Update password</strong><small>Changing it signs out your other active sessions.</small></span></div>
        <div className="security-password-grid">
          <label>Current password<div className="secure-input"><input type={showPasswords ? 'text' : 'password'} autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /><button type="button" onClick={() => setShowPasswords(value => !value)} aria-label={showPasswords ? 'Hide passwords' : 'Show passwords'}>{showPasswords ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>
          <label>New password<div className="secure-input"><input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></div></label>
          <label>Confirm new password<div className="secure-input"><input type={showPasswords ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div></label>
        </div>
        <div className="password-checks">
          {checks.map(check => <span className={check.met ? 'met' : ''} key={check.label}>{check.met ? <Check size={13}/> : <span className="check-dot"/>}{check.label}</span>)}
          {confirmPassword && <span className={newPassword === confirmPassword ? 'met' : 'warning'}>{newPassword === confirmPassword ? <Check size={13}/> : <X size={13}/>}Passwords match</span>}
        </div>
        <button className="security-primary" disabled={busy || !passwordReady}><KeyRound size={15}/>{passwordBusy ? 'Updating…' : 'Update password'}</button>
      </form>

      <div className={`mfa-security-card ${factors.length > 0 ? 'is-enabled' : ''}`}>
        <div className="security-card-heading"><ShieldCheck size={20}/><span><strong>Authenticator 2FA</strong><small>Add a rotating code after your password at every new sign-in.</small></span>{factors.length > 0 && <i className="security-enabled-badge"><Check size={13}/>Enabled</i>}</div>

        {factors.map(factor => (
          <div className="mfa-factor-row" key={factor.id}>
            <span className="mfa-phone-icon"><Smartphone size={18}/></span>
            <span><strong>{formatMfaFactorName(factor.friendly_name)}</strong><small>Verified authenticator</small></span>
            <button type="button" className="security-danger-link" onClick={() => { setFactorToDisable(factor); setDisablePassword(''); }} disabled={busy}>Disable</button>
          </div>
        ))}

        {!enrollment && factors.length === 0 && <div className="mfa-empty"><Smartphone size={24}/><span><strong>No authenticator connected</strong><small>Use Google Authenticator, Microsoft Authenticator, Authy, 1Password, or another TOTP app.</small></span><button type="button" className="security-primary" onClick={onStartMfa} disabled={busy}>{setupBusy ? 'Preparing setup…' : 'Set up authenticator'}</button></div>}
        {!enrollment && factors.length > 0 && <button type="button" className="security-secondary mfa-add-factor" onClick={onStartMfa} disabled={busy}>{setupBusy ? 'Preparing setup…' : 'Add another authenticator'}</button>}

        {enrollment && (
          <form className="mfa-enrollment" onSubmit={verifyEnrollment}>
            <div className="mfa-steps"><span><b>1</b>Scan this QR code</span><span><b>2</b>Enter the 6-digit code</span></div>
            <div className="mfa-enrollment-body">
              <img src={enrollment.totp.qr_code} alt="Authenticator QR code" />
              <div className="mfa-manual-setup">
                <small>Cannot scan? Enter this setup key manually:</small>
                <code>{enrollment.totp.secret}</code>
                <button type="button" onClick={() => navigator.clipboard?.writeText(enrollment.totp.secret)}><Copy size={14}/>Copy key</button>
              </div>
            </div>
            <label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={event => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" required /></label>
            <div className="mfa-enrollment-actions"><button type="submit" className="security-primary" disabled={busy || mfaCode.length !== 6}>{verifyBusy ? 'Verifying…' : 'Verify and enable'}</button><button type="button" className="security-secondary" onClick={cancelEnrollment} disabled={busy}>{cancelBusy ? 'Cancelling…' : 'Cancel setup'}</button></div>
          </form>
        )}
      </div>

      {factorToDisable && (
        <div className="security-confirm-overlay" onClick={() => !busy && setFactorToDisable(null)}>
          <form className="security-confirm-dialog" onSubmit={disableFactor} onClick={event => event.stopPropagation()}>
            <div className="security-warning-icon"><LockKeyhole size={22}/></div>
            <h3>Disable two-factor authentication?</h3>
            <p>Your account will return to password-only sign-in. Enter your current password to confirm.</p>
            <label>Current password<input type="password" autoComplete="current-password" value={disablePassword} onChange={event => setDisablePassword(event.target.value)} autoFocus required /></label>
            <div><button type="button" className="security-secondary" onClick={() => setFactorToDisable(null)} disabled={busy}>Cancel</button><button type="submit" className="security-danger" disabled={busy || !disablePassword}>{disableBusy ? 'Disabling…' : 'Disable 2FA'}</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
