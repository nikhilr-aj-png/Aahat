import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const auth = read('web/src/hooks/useAuth.js');
const app = read('web/src/App.jsx');
const gate = read('web/src/components/MfaChallengeScreen.jsx');
const settings = read('web/src/components/SettingsPanelProduction.jsx');
const security = read('web/src/components/SecuritySettingsSection.jsx');
const securityCss = read('web/src/components/SecurityAuth.css');
const recovery = read('web/src/components/PasswordRecoveryGate.jsx');
const mfaNames = read('web/src/utils/mfa.js');

test('verified TOTP factors gate application data behind an AAL2 challenge', () => {
  assert.match(auth, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(auth, /nextLevel === 'aal2'[\s\S]+currentLevel !== 'aal2'/);
  assert.match(auth, /filter\(factor => factor\.status === 'verified'\)/);
  assert.match(auth, /setUser\(null\)[\s\S]+setMfaChallenge/);
  assert.match(app, /if \(mfaChallenge\)[\s\S]+<MfaChallengeScreen/);
  assert.ok(app.indexOf('if (mfaChallenge)') < app.lastIndexOf('if (!user)'));
  assert.match(gate, /mfa\.challengeAndVerify\(\{ factorId, code \}\)/);
  assert.match(securityCss, /\.mfa-gate \{[^}]*background: #09051d/);
  assert.match(securityCss, /\.mfa-gate-card \{[^}]*max-height: calc\(100dvh - 32px\)/);
  assert.match(securityCss, /\.mfa-gate-card \{[^}]*background: #120c2e/);
  assert.doesNotMatch(securityCss, /\.mfa-gate \{[^}]*radial-gradient/);
  assert.match(securityCss, /@media \(max-height: 650px\)/);
  assert.match(gate, /autoComplete="one-time-code"/);
  assert.match(gate, /invalid or expired/);
});

test('password change verifies credentials without replacing the active MFA session', () => {
  assert.match(settings, /createClient\(supabaseUrl, supabaseKey/);
  assert.match(settings, /persistSession: false/);
  assert.match(settings, /verifyAccountPassword\(user\.email, currentPassword\)/);
  assert.match(settings, /supabase\.auth\.updateUser\(\{ password: newPassword \}\)/);
  assert.match(settings, /signOut\(\{ scope: 'others' \}\)/);
  assert.match(security, /Confirm new password/);
  assert.match(security, /One uppercase letter/);
  assert.match(security, /One lowercase letter/);
  assert.match(security, /One number/);
  assert.match(security, /newPassword !== currentPassword/);
});

test('authenticator enrollment is verifiable, cancellable, repeatable, and protected on disable', () => {
  assert.match(settings, /mfa\.enroll\(\{ factorType: 'totp'/);
  assert.match(settings, /factor\.status !== 'verified'/);
  assert.match(settings, /mfa\.challenge\(\{ factorId: enrollment\.id \}\)/);
  assert.match(settings, /existing\?\.all/);
  assert.match(settings, /factor\.factor_type === 'totp'/);
  assert.match(settings, /crypto\.randomUUID\(\)[\s\S]+friendlyName/);
  assert.doesNotMatch(settings, /existing\?\.totp \|\| \[\]\)\.filter\(factor => factor\.status !== 'verified'/);
  assert.match(settings, /mfa\.verify\(\{ factorId: enrollment\.id, challengeId: challenge\.id, code \}\)/);
  assert.match(settings, /const cancelMfa/);
  assert.match(settings, /mfa\.unenroll\(\{ factorId: enrollment\.id \}\)/);
  assert.match(settings, /const removeMfa = \(factorId, currentPassword\)/);
  assert.match(security, /Add another authenticator/);
  assert.match(security, /Enter your current password to confirm/);
  assert.match(security, /enrollment\.totp\.qr_code/);
  assert.match(security, /Copy key/);
});

  assert.match(security, /passwordBusy \? 'Updating…' : 'Update password'/);
  assert.match(security, /formatMfaFactorName\(factor\.friendly_name\)/);
  assert.match(gate, /formatMfaFactorName\(factor\.friendly_name\)/);
  assert.match(mfaNames, /replace\(\/\\s\+\[A-F0-9\]\{6\}\$\/i, ''\)/);
  assert.match(mfaNames, /return 'Aahat Authenticator'/);
  assert.match(security, /setupBusy \? 'Preparing setup…' : 'Set up authenticator'/);
  assert.match(security, /security-inline-message/);
  assert.equal([...security.matchAll(/Add another authenticator/g)].length, 1);
  assert.match(settings, /tab !== 'security'/);
test('password recovery uses the same strong policy and revokes other sessions', () => {
  assert.match(recovery, /\[A-Z\]/);
  assert.match(recovery, /\[a-z\]/);
  assert.match(recovery, /\\d/);
  assert.match(recovery, /Passwords do not match/);
  assert.match(recovery, /signOut\(\{scope:'others'\}\)/);
  assert.match(recovery, /autoComplete="new-password"/);
});
