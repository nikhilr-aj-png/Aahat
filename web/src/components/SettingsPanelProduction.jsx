import { useCallback, useEffect, useState } from 'react';
import { Bell, Download, Key, Laptop, Lock, Shield, Trash2, User } from 'lucide-react';
import { supabase } from '../supabase';
import SafeAvatar from './SafeAvatar';

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

const deviceName = () => `${navigator.platform || 'Web'} · ${/Mobile/i.test(navigator.userAgent) ? 'Mobile' : 'Browser'}`;

export default function SettingsPanelProduction({ user, profile, onLogout, onUpdateProfile, onRequestNotificationPermission }) {
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
  const [mfaCode, setMfaCode] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDetails, setSupportDetails] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const notify = (type, text) => setMessage({ type, text });

  const loadSecurityData = useCallback(async () => {
    if (!user) return;
    const [blockedResult, devicesResult, sessionsResult, factorsResult] = await Promise.all([
      supabase.rpc('get_my_blocked_users'),
      supabase.from('user_devices').select('id,device_name,platform,last_seen_at,created_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.from('user_sessions').select('id,client_session_id,user_agent,created_at,last_seen_at,revoked_at').eq('user_id', user.id).order('last_seen_at', { ascending: false }),
      supabase.auth.mfa.listFactors()
    ]);
    if (blockedResult.error) throw blockedResult.error;
    if (devicesResult.error) throw devicesResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    setBlocked(blockedResult.data || []);
    setDevices(devicesResult.data || []);
    setSessions(sessionsResult.data || []);
    setFactors(factorsResult.data?.totp || []);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const register = async () => {
      const fingerprint = newStableId('aahat_device_fingerprint');
      const clientSessionId = newStableId('aahat_client_session_id');
      const { data: device, error: deviceError } = await supabase.from('user_devices').upsert({
        user_id: user.id, device_name: deviceName(), platform: 'web', device_fingerprint: fingerprint,
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'user_id,device_fingerprint' }).select('id').single();
      if (deviceError) throw deviceError;
      const { error: sessionError } = await supabase.from('user_sessions').upsert({
        user_id: user.id, device_id: device.id, client_session_id: clientSessionId,
        user_agent: navigator.userAgent, last_seen_at: new Date().toISOString(), revoked_at: null
      }, { onConflict: 'user_id,client_session_id' });
      if (sessionError) throw sessionError;
      await loadSecurityData();
    };
    register().catch(error => notify('error', friendlyError(error)));
  }, [loadSecurityData, user]);

  const run = async (operation, success) => {
    setBusy(true); setMessage(null);
    try { await operation(); if (success) notify('success', success); }
    catch (error) { notify('error', friendlyError(error)); }
    finally { setBusy(false); }
  };

  const saveProfile = () => run(async () => onUpdateProfile({ display_name: name.trim(), bio: bio.trim(), avatar_url: avatarUrl }), 'Profile saved.');
  const savePreferences = () => run(async () => onUpdateProfile({ privacy_settings: privacy, notification_settings: notifications }), 'Preferences saved.');

  const uploadAvatar = async (file) => run(async () => {
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) throw new Error('Choose an image smaller than 2MB.');
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${file.name.split('.').pop() || 'png'}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    await onUpdateProfile({ avatar_url: data.publicUrl });
  }, 'Profile photo updated.');

  const changePassword = () => run(async () => {
    if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.');
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
    if (verifyError) throw new Error('Current password is incorrect.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setOldPassword(''); setNewPassword('');
  }, 'Password updated.');

  const startMfa = () => run(async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Aahat Authenticator' });
    if (error) throw error;
    setEnrollment(data);
  });

  const verifyMfa = () => run(async () => {
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.id });
    if (challengeError) throw challengeError;
    const { error } = await supabase.auth.mfa.verify({ factorId: enrollment.id, challengeId: challenge.id, code: mfaCode });
    if (error) throw error;
    setEnrollment(null); setMfaCode(''); await loadSecurityData();
  }, 'Two-factor authentication enabled.');

  const removeMfa = factorId => run(async () => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await loadSecurityData();
  }, 'Two-factor authentication disabled.');

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

  const submitSupport = () => run(async () => {
    if (!supportSubject.trim() || !supportDetails.trim()) throw new Error('Subject and details are required.');
    const { error } = await supabase.from('reports').insert({ reporter_id: user.id, reason: `support:${supportSubject.trim()}`, details: supportDetails.trim() });
    if (error) throw error;
    setSupportSubject(''); setSupportDetails('');
  }, 'Support request submitted.');

  const exportData = () => run(async () => {
    const [contacts, memberships, statuses, reports] = await Promise.all([
      supabase.from('user_contacts').select('*').eq('owner_id', user.id),
      supabase.from('conversation_members').select('*,conversation:conversations(*)').eq('user_id', user.id),
      supabase.from('statuses').select('*').eq('user_id', user.id),
      supabase.from('reports').select('*').eq('reporter_id', user.id)
    ]);
    for (const result of [contacts, memberships, statuses, reports]) if (result.error) throw result.error;
    const payload = { exported_at: new Date().toISOString(), profile, contacts: contacts.data, conversations: memberships.data, statuses: statuses.data, reports: reports.data };
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    link.download = `aahat-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  }, 'Export created.');

  const deleteAccount = () => run(async () => {
    const phrase = prompt('Type DELETE MY AAHAT ACCOUNT to permanently delete your account.');
    if (phrase !== 'DELETE MY AAHAT ACCOUNT') throw new Error('Account deletion cancelled.');
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirmation: phrase } });
    if (error) throw error;
    await onLogout();
  });

  const tabs = [['profile', User, 'Profile'], ['privacy', Shield, 'Privacy'], ['security', Lock, 'Security'], ['devices', Laptop, 'Devices'], ['notifications', Bell, 'Notifications'], ['data', Download, 'Data & support']];
  return <div className="settings-panel">
    <aside className="settings-sidebar"><h2>Settings</h2>{tabs.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/>{label}</button>)}</aside>
    <main className="settings-content">
      {message && <div className={`settings-message ${message.type}`}>{message.text}</div>}
      {tab === 'profile' && <section><h3>Profile</h3><SafeAvatar src={avatarUrl} name={name} size={88}/><input type="file" accept="image/*" onChange={e => e.target.files[0] && uploadAvatar(e.target.files[0])}/><label>Display name<input value={name} onChange={e => setName(e.target.value)}/></label><label>Bio<textarea value={bio} onChange={e => setBio(e.target.value)}/></label><button disabled={busy || !name.trim()} onClick={saveProfile}>Save profile</button></section>}
      {tab === 'privacy' && <section><h3>Privacy</h3>{[['last_seen','Show last seen'],['online','Show online status'],['read_receipts','Read receipts'],['discover_by_aahat_id','Discoverable by Aahat ID']].map(([key,label]) => <label key={key}><input type="checkbox" checked={privacy[key] !== false} onChange={e => setPrivacy(current => ({...current,[key]:e.target.checked}))}/>{label}</label>)}<label>Status audience<select value={privacy.status || 'contacts'} onChange={e => setPrivacy(current => ({...current,status:e.target.value}))}><option value="everyone">Everyone</option><option value="contacts">Contacts</option><option value="private">Only me</option></select></label><button disabled={busy} onClick={savePreferences}>Save privacy</button><h4>Blocked users</h4>{blocked.length ? blocked.map(row => <div key={row.id}><SafeAvatar src={row.avatar_url} name={row.display_name} size={32}/><span>{row.display_name}</span><button onClick={() => unblock(row.id)}>Unblock</button></div>) : <p>No blocked users.</p>}</section>}
      {tab === 'security' && <section><h3>Security</h3><label>Current password<input type="password" value={oldPassword} onChange={e => setOldPassword(e.target.value)}/></label><label>New password<input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}/></label><button disabled={busy || !oldPassword || !newPassword} onClick={changePassword}><Key size={15}/>Update password</button><h4>Authenticator 2FA</h4>{factors.length ? factors.map(factor => <div key={factor.id}><span>{factor.friendly_name || 'Authenticator'} · verified</span><button onClick={() => removeMfa(factor.id)}>Disable</button></div>) : <button onClick={startMfa}>Set up authenticator</button>}{enrollment && <div><img src={enrollment.totp.qr_code} alt="Authenticator QR code"/><code>{enrollment.totp.secret}</code><input inputMode="numeric" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g,''))}/><button onClick={verifyMfa}>Verify code</button></div>}</section>}
      {tab === 'devices' && <section><h3>Registered devices</h3>{devices.length ? devices.map(row => <div key={row.id}><strong>{row.device_name}</strong><span>{new Date(row.last_seen_at).toLocaleString()}</span></div>) : <p>No devices registered.</p>}<h4>Sessions</h4>{sessions.map(row => <div key={row.id}><span>{row.revoked_at ? 'Revoked' : 'Active'} · {new Date(row.last_seen_at).toLocaleString()}</span></div>)}<button disabled={busy} onClick={revokeOtherSessions}>Sign out other sessions</button></section>}
      {tab === 'notifications' && <section><h3>Notifications</h3><label><input type="checkbox" checked={notifications.sound !== false} onChange={e => setNotifications(current => ({...current,sound:e.target.checked}))}/>Sound</label><label><input type="checkbox" checked={notifications.previews !== false} onChange={e => setNotifications(current => ({...current,previews:e.target.checked}))}/>Message previews</label><button onClick={() => run(onRequestNotificationPermission, 'Notification permission updated.')}>Enable push notifications</button><button onClick={savePreferences}>Save preferences</button></section>}
      {tab === 'data' && <section><h3>Data and support</h3><button onClick={exportData}><Download size={15}/>Export my data</button><label>Subject<input value={supportSubject} onChange={e => setSupportSubject(e.target.value)}/></label><label>Details<textarea value={supportDetails} onChange={e => setSupportDetails(e.target.value)}/></label><button onClick={submitSupport}>Submit support request</button><hr/><button className="danger" onClick={deleteAccount}><Trash2 size={15}/>Delete account permanently</button></section>}
    </main>
  </div>;
}
