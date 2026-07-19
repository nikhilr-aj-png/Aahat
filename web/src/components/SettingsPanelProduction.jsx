import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Bell, Copy, Download, Globe2, ImagePlus, Laptop, Lock, Pencil, RefreshCw, Shield, Trash2, User } from 'lucide-react';
import { supabase, supabaseKey, supabaseUrl } from '../supabase';
import SafeAvatar from './SafeAvatar';
import AvatarCropModal from './AvatarCropModal';
import PrivacySettingsSection from './PrivacySettingsSection';
import SecuritySettingsSection from './SecuritySettingsSection';
import DeviceSessionsSection from './DeviceSessionsSection';
import NotificationSettingsSection from './NotificationSettingsSection';
import DataSupportSection from './DataSupportSection';
import { getDeviceIdentity, isLegacyGenericDeviceName } from '../utils/deviceIdentity';
import './ProfileConnectionMode.css';
import './ProfileCredentialsLayout.css';

const newStableId = (key) => {
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
};

const friendlyError = (error) => {
  const text = error?.message || '';
  if (/schema cache|PGRST20[25]|user_devices|user_sessions|get_my_blocked_users/i.test(text)) {
    return 'Security services are being upgraded. Your profile settings are still available.';
  }
  return text || 'We could not complete that action. Please try again.';
};

const managedAvatarPath = (url, userId) => {
  if (!url || !userId) return null;
  try {
    const marker = '/storage/v1/object/public/avatars/';
    const parsed = new URL(url);
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return path.startsWith(`${userId}/`) ? path : null;
  } catch {
    return null;
  }
};

const verifyAccountPassword = async (email, password) => {
  const credentialClient = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
  });
  const { error } = await credentialClient.auth.signInWithPassword({ email, password });
  if (!error) await credentialClient.auth.signOut({ scope: 'local' });
  if (error) throw new Error('Current password is incorrect.');
};

const isStrongPassword = password => (
  password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
);

export default function SettingsPanelProduction({ user, profile, conversations, onLogout, onUpdateProfile, onRequestNotificationPermission, aahatCredentials, onRotateAahatPin }) {
  const [tab, setTab] = useState('profile');
  const [name, setName] = useState(profile?.display_name || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || '');
  const [privacy, setPrivacy] = useState(profile?.privacy_settings || {});
  const [notifications, setNotifications] = useState(profile?.notification_settings || {});
  const [blocked, setBlocked] = useState([]);
  const [devices, setDevices] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [factors, setFactors] = useState([]);
  const [enrollment, setEnrollment] = useState(null);
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [isAvatarMenuOpen, setIsAvatarMenuOpen] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const avatarInputRef = useRef(null);
  const [cropFile, setCropFile] = useState(null);


  const publicConnections = privacy.aahat_connection_mode === 'public';
  const notify = (type, text) => setMessage({ type, text });

  const loadSecurityData = useCallback(async () => {
    if (!user) return;
    const [blockedResult, devicesResult, sessionsResult, factorsResult] = await Promise.all([
      supabase.rpc('get_my_blocked_users'),
      supabase.from('user_devices').select('id,device_name,platform,device_fingerprint,last_seen_at,created_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.from('user_sessions').select('id,client_session_id,user_agent,created_at,last_seen_at,revoked_at,device:user_devices!user_sessions_device_id_fkey(device_name,platform)').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.auth.mfa.listFactors()
    ]);
    if (!blockedResult.error) setBlocked(blockedResult.data || []);
    if (!devicesResult.error) setDevices(devicesResult.data || []);
    if (!sessionsResult.error) setSessions(sessionsResult.data || []);
    if (!factorsResult.error) setFactors((factorsResult.data?.totp || []).filter(factor => factor.status === 'verified'));
    const firstError = blockedResult.error || devicesResult.error || sessionsResult.error || factorsResult.error;
    if (firstError) throw firstError;
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const register = async () => {
      const fingerprint = newStableId('aahat_device_fingerprint');
      const clientSessionId = newStableId('aahat_client_session_id');
      const identity = await getDeviceIdentity();
      const { data: existingDevice } = await supabase.from('user_devices')
        .select('device_name').eq('user_id', user.id).eq('device_fingerprint', fingerprint).maybeSingle();
      const registeredName = existingDevice?.device_name && !isLegacyGenericDeviceName(existingDevice.device_name)
        ? existingDevice.device_name
        : identity.name;
      const { data: device, error: deviceError } = await supabase.from('user_devices').upsert({
        user_id: user.id, device_name: registeredName, platform: identity.platform, device_fingerprint: fingerprint,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'user_id,device_fingerprint' }).select('id').single();
      let registrationError = deviceError;
      if (!deviceError) {
        const { error: sessionError } = await supabase.from('user_sessions').upsert({
          user_id: user.id, device_id: device.id, client_session_id: clientSessionId,
          user_agent: navigator.userAgent, last_seen_at: new Date().toISOString(), revoked_at: null
        }, { onConflict: 'user_id,client_session_id' });
        registrationError = sessionError;
      }
      try { await loadSecurityData(); }
      catch (error) { registrationError ||= error; }
      if (registrationError) throw registrationError;
    };
    register().catch(error => notify('error', friendlyError(error)));
  }, [loadSecurityData, user]);

  const run = async (operation, success, action = 'general') => {
    setBusy(true); setBusyAction(action); setMessage(null);
    try {
      await operation();
      if (success) notify('success', success);
      return true;
    } catch (error) {
      notify('error', friendlyError(error));
      return false;
    }
    finally { setBusy(false); setBusyAction(null); }
  };

  const saveProfile = () => run(async () => onUpdateProfile({ display_name: name.trim(), bio: bio.trim(), avatar_url: avatarUrl }), 'Profile saved.');
  const savePreferences = () => run(async () => onUpdateProfile({ privacy_settings: privacy, notification_settings: notifications }), 'Preferences saved.');
  const toggleAahatConnectionMode = () => {
    const nextMode = publicConnections ? 'private' : 'public';
    const nextPrivacy = {
      ...privacy,
      discover_by_aahat_id: true,
      aahat_connection_mode: nextMode
    };
    return run(async () => {
      await onUpdateProfile({ privacy_settings: nextPrivacy });
      setPrivacy(nextPrivacy);
    }, nextMode === 'public' ? 'Your Aahat ID is now public.' : 'Private connections restored.');
  };

  const uploadAvatar = async (file) => run(async () => {
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[file.type];
    if (!extension || file.size > 2 * 1024 * 1024) throw new Error('Choose a JPG, PNG, WebP, or GIF image smaller than 2MB.');
    const oldPath = managedAvatarPath(avatarUrl, user.id);
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    try {
      await onUpdateProfile({ avatar_url: data.publicUrl });
      setAvatarUrl(data.publicUrl);
    } catch (error) {
      await supabase.storage.from('avatars').remove([path]);
      throw error;
    }
    if (oldPath && oldPath !== path) {
      const { error: removeError } = await supabase.storage.from('avatars').remove([oldPath]);
      if (removeError) throw new Error('Photo updated, but the previous storage file could not be removed.');
    }
    setIsAvatarMenuOpen(false);
  }, 'Profile photo updated.');


  const saveCroppedAvatar = async blob => {
    const croppedFile = new File([blob], 'avatar.webp', { type: 'image/webp' });
    const saved = await uploadAvatar(croppedFile);
    if (saved) setCropFile(null);
  };

  const removeAvatar = () => run(async () => {
    const oldPath = managedAvatarPath(avatarUrl, user.id);
    await onUpdateProfile({ avatar_url: '' });
    setAvatarUrl('');
    if (oldPath) {
      const { error } = await supabase.storage.from('avatars').remove([oldPath]);
      if (error) throw new Error('Profile photo was cleared, but its storage file could not be removed.');
    }
    setIsAvatarMenuOpen(false);
  }, 'Profile photo removed.');

  const changePassword = ({ currentPassword, newPassword, confirmPassword }) => run(async () => {
    if (!isStrongPassword(newPassword)) throw new Error('Use at least 8 characters with uppercase, lowercase, and a number.');
    if (newPassword !== confirmPassword) throw new Error('New passwords do not match.');
    if (newPassword === currentPassword) throw new Error('Your new password must be different from the current password.');
    await verifyAccountPassword(user.email, currentPassword);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'others' });
    if (signOutError) throw new Error('Password updated, but other sessions could not be signed out. Use Devices to revoke them manually.');
    await supabase.from('user_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).is('revoked_at', null).neq('client_session_id', newStableId('aahat_client_session_id'));
  }, 'Password updated and other sessions signed out.', 'password');

  const startMfa = () => run(async () => {
    const { data: existing, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) throw listError;
    const incomplete = (existing?.all || []).filter(factor => factor.factor_type === 'totp' && factor.status !== 'verified');
    for (const factor of incomplete) {
      const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (cleanupError) throw cleanupError;
    }
    const friendlyName = `Aahat Authenticator ${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
    if (error) throw error;
    setEnrollment(data);
  }, null, 'mfa-setup');

  const verifyMfa = code => run(async () => {
    if (!enrollment?.id || !/^\d{6}$/.test(code)) throw new Error('Enter the current 6-digit authenticator code.');
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challengeError) throw challengeError;
    const { error } = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code });
    if (error) throw error;
    setEnrollment(null);
    await loadSecurityData();
  }, 'Two-factor authentication enabled. New sign-ins now require your authenticator code.', 'mfa-verify');

  const cancelMfa = () => run(async () => {
    if (enrollment?.id) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: enrollment.id });
      if (error) throw error;
    }
    setEnrollment(null);
  }, 'Authenticator setup cancelled.', 'mfa-cancel');

  const removeMfa = (factorId, currentPassword) => run(async () => {
    await verifyAccountPassword(user.email, currentPassword);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await loadSecurityData();
  }, 'Two-factor authentication disabled.', 'mfa-disable');

  const unblock = id => run(async () => {
    const { error } = await supabase.from('blocked_users').delete().eq('id', id).eq('blocker_id', user.id);
    if (error) throw error;
    await loadSecurityData();
  }, 'User unblocked.');

  const revokeOtherSessions = () => run(async () => {
    const current = newStableId('aahat_client_session_id');
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    if (error) throw error;
    await supabase.from('user_sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', user.id).neq('client_session_id', current);
    await loadSecurityData();
  }, 'Other sessions revoked.');

  const renameDevice = (deviceId, deviceName) => run(async () => {
    const { error } = await supabase.from('user_devices').update({ device_name: deviceName }).eq('id', deviceId).eq('user_id', user.id);
    if (error) throw error;
    await loadSecurityData();
  }, 'Device name updated.', 'device-rename');

  const submitSupport = () => run(async () => {
    if (!supportSubject.trim() || !supportDetails.trim()) throw new Error('Subject and details are required.');
    if (supportSubject.trim().length > 120 || supportDetails.trim().length > 2000) throw new Error('Support request is too long.');
    const { error } = await supabase.from('reports').insert({ reporter_id: user.id, reason: `support:${supportSubject.trim()}`, details: supportDetails.trim() });
    if (error) throw error;
    setSupportSubject(''); setSupportDetails('');
  }, 'Support request submitted.', 'support-request');

  const exportData = () => run(async () => {
    const [contacts, memberships, messages, statuses, calls, reports] = await Promise.all([
      supabase.from('user_contacts').select('*').eq('owner_id', user.id),
      supabase.from('conversation_members').select('*,conversation:conversations(*)').eq('user_id', user.id),
      supabase.from('messages').select('*').eq('sender_id', user.id).order('created_at', { ascending: true }),
      supabase.from('statuses').select('*').eq('user_id', user.id),
      supabase.from('calls').select('*').or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`).order('started_at', { ascending: true }),
      supabase.from('reports').select('*').eq('reporter_id', user.id)
    ]);
    for (const result of [contacts, memberships, messages, statuses, calls, reports]) if (result.error) throw result.error;
    const payload = { exported_at: new Date().toISOString(), profile, contacts: contacts.data, conversations: memberships.data, messages: messages.data, statuses: statuses.data, calls: calls.data, reports: reports.data };
    const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `aahat-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }, 'Export created.', 'data-export');

  const deleteAccount = phrase => run(async () => {
    if (phrase !== 'DELETE MY AAHAT ACCOUNT') throw new Error('Account deletion cancelled.');
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirmation: phrase } });
    if (error) throw error;
    await onLogout();
  }, null, 'delete-account');

  const tabs = [['profile', User, 'Profile'], ['privacy', Shield, 'Privacy'], ['security', Lock, 'Security'], ['devices', Laptop, 'Devices'], ['notifications', Bell, 'Notifications'], ['data', Download, 'Data & support']];
  return <div className="settings-panel">
    <aside className="settings-sidebar"><h2>Settings</h2>{tabs.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{label}</button>)}</aside>
    <main className="settings-content">
      {message && tab !== 'security' && <div className={`settings-message ${message.type}`}>{message.text}</div>}
      {tab === 'profile' && <section>
        <h3>Profile</h3>
        <div className="settings-avatar-row">
        <SafeAvatar src={avatarUrl} name={name} size={88} className="user-avatar settings-profile-avatar"/>
        <div className="settings-avatar-editor">
          <button type="button" className="settings-avatar-edit-button" disabled={busy} onClick={() => setIsAvatarMenuOpen(open => !open)}>
            <Pencil size={15}/>Edit
          </button>
          {isAvatarMenuOpen && <div className="settings-avatar-menu">
            <button type="button" onClick={() => { setIsAvatarMenuOpen(false); avatarInputRef.current?.click(); }}>
              <ImagePlus size={16}/>Choose photo
            </button>
            <button type="button" className="remove" disabled={!avatarUrl || busy} onClick={removeAvatar}>
              <Trash2 size={16}/>Remove photo
            </button>
          </div>}
        </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            setIsAvatarMenuOpen(false);
            setCropFile(file);
          }
        }}/>
        <label>Display name<input value={name} onChange={e => setName(e.target.value)}/></label>
        <label>Bio<textarea value={bio} onChange={e => setBio(e.target.value)}/></label>
        <button disabled={busy || !name.trim()} onClick={saveProfile}>Save profile</button>
        <div className={`settings-aahat-card ${publicConnections ? 'has-public-mode' : ''}`}>
          <div className="settings-aahat-credentials">
            <div className="settings-aahat-credential">
              <span>Your 10-digit Aahat ID</span>
              <strong>{aahatCredentials?.aahat_id || '----------'}</strong>
            </div>
            <button type="button" className="settings-credential-copy" title="Copy Aahat ID" aria-label="Copy Aahat ID" onClick={() => navigator.clipboard.writeText(aahatCredentials?.aahat_id || '')}><Copy size={17}/></button>
            {!publicConnections && <>
              <div className="settings-aahat-credential">
                <span>Your 6-digit connection PIN</span>
                <strong>{aahatCredentials?.pin_code || '------'}</strong>
              </div>
              <div className="settings-pin-actions">
                <button type="button" className="settings-credential-copy" title="Copy PIN" aria-label="Copy connection PIN" onClick={() => navigator.clipboard.writeText(aahatCredentials?.pin_code || '')}><Copy size={17}/></button>
                <button type="button" className="settings-pin-rotate" disabled={busy} onClick={() => {
                  if (!confirm('Generate a new connection PIN? Your old PIN will stop working immediately.')) return;
                  run(onRotateAahatPin, 'A new connection PIN is active.');
                }}><RefreshCw size={16}/>Generate new PIN</button>
              </div>
            </>}
          </div>
          <div className="profile-connection-mode">
            <div className={`profile-mode-icon ${publicConnections ? 'is-public' : ''}`}>
              {publicConnections ? <Globe2 size={22}/> : <Lock size={22}/>}
            </div>
            <div className="profile-mode-copy">
              <span>Aahat ID connection</span>
              <strong>{publicConnections ? 'Public · instant chat' : 'Private · approval required'}</strong>
              <small>{publicConnections
                ? 'People can connect with your Aahat ID only. Your PIN stays hidden.'
                : 'People need your Aahat ID and 6-digit PIN. You approve every request.'}</small>
            </div>
            <button type="button" className={`profile-mode-toggle ${publicConnections ? 'is-on' : ''}`} role="switch" aria-checked={publicConnections} aria-label="Allow instant connections using only your Aahat ID" disabled={busy} onClick={toggleAahatConnectionMode}><span/></button>
          </div>
          <p>{publicConnections ? 'Your Aahat ID is searchable. Switch back to Private whenever you want PIN-protected requests.' : 'Share both only with someone you want to connect with. Their invitation must still be accepted by you.'}</p>
        </div>
      </section>}
      {tab === 'privacy' && <PrivacySettingsSection
        privacy={privacy}
        setPrivacy={setPrivacy}
        conversations={conversations}
        blocked={blocked}
        onUnblock={unblock}
        onSave={savePreferences}
        busy={busy}
      />}
      {tab === 'security' && <SecuritySettingsSection
        busy={busy}
        busyAction={busyAction}
        feedback={message}
        factors={factors}
        enrollment={enrollment}
        onChangePassword={changePassword}
        onStartMfa={startMfa}
        onVerifyMfa={verifyMfa}
        onCancelMfa={cancelMfa}
        onDisableMfa={removeMfa}
      />}
      {tab === 'devices' && <DeviceSessionsSection
        devices={devices}
        sessions={sessions}
        currentFingerprint={newStableId('aahat_device_fingerprint')}
        currentSessionId={newStableId('aahat_client_session_id')}
        busy={busy}
        onRenameDevice={renameDevice}
        onRevokeOtherSessions={revokeOtherSessions}
      />}
      {tab === 'notifications' && <NotificationSettingsSection
        notifications={notifications}
        setNotifications={setNotifications}
        permission={'Notification' in window ? Notification.permission : 'unsupported'}
        busy={busy}
        onEnablePush={() => run(onRequestNotificationPermission, 'Push notifications enabled.', 'notification-permission')}
        onSave={savePreferences}
      />}
      {tab === 'data' && <DataSupportSection
        subject={supportSubject}
        details={supportDetails}
        setSubject={setSupportSubject}
        setDetails={setSupportDetails}
        busy={busy}
        busyAction={busyAction}
        onExport={exportData}
        onSubmitSupport={submitSupport}
        onDeleteAccount={deleteAccount}
      />}
    </main>
    {cropFile && <AvatarCropModal file={cropFile} busy={busy} onCancel={() => !busy && setCropFile(null)} onSave={saveCroppedAvatar}/>}
  </div>;
}
