import { Check, Laptop, MonitorSmartphone, Pencil, ShieldCheck, Smartphone } from 'lucide-react';
import { useState } from 'react';
import './DeviceSessionsSection.css';

const formatActivity = value => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Unknown activity';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const DeviceIcon = ({ platform = '', name = '' }) => /android|ios|iphone|mobile/i.test(`${platform} ${name}`)
  ? <Smartphone size={19}/>
  : <Laptop size={19}/>;

export default function DeviceSessionsSection({
  devices,
  sessions,
  currentFingerprint,
  currentSessionId,
  busy,
  onRenameDevice,
  onRevokeOtherSessions
}) {
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const activeOtherSessions = sessions.filter(session => !session.revoked_at && session.client_session_id !== currentSessionId).length;

  const openRename = device => {
    setRenameTarget(device);
    setRenameValue(device.device_name || '');
  };
  const closeRename = () => {
    if (busy) return;
    setRenameTarget(null);
    setRenameValue('');
  };
  const saveRename = async event => {
    event.preventDefault();
    if (!renameTarget) return;
    const cleanName = renameValue.trim().replace(/\s+/g, ' ');
    if (!cleanName || cleanName.length > 60 || cleanName === renameTarget.device_name) return;
    await onRenameDevice(renameTarget.id, cleanName);
    setRenameTarget(null);
    setRenameValue('');
  };

  return <section className="device-security-section">
    <header className="device-section-heading">
      <span className="device-heading-icon"><MonitorSmartphone size={22}/></span>
      <div><h3>Registered devices</h3><p>Devices that have signed in to this Aahat account.</p></div>
    </header>

    <div className="registered-device-list">
      {devices.length ? devices.map(device => {
        const isCurrent = device.device_fingerprint === currentFingerprint;
        return <article className="registered-device-card" key={device.id}>
          <span className="registered-device-icon"><DeviceIcon platform={device.platform} name={device.device_name}/></span>
          <div className="registered-device-copy">
            <span><strong>{device.device_name}</strong>{isCurrent && <i>Current device</i>}</span>
            <small>Last active {formatActivity(device.last_seen_at)}</small>
          </div>
          <button type="button" onClick={() => openRename(device)} disabled={busy} aria-label={`Rename ${device.device_name}`}><Pencil size={15}/><span>Rename</span></button>
        </article>;
      }) : <p className="device-empty-state">No registered devices found.</p>}
    </div>

    <div className="session-explainer">
      <ShieldCheck size={20}/>
      <div><h4>Login sessions</h4><p>A session is one active Aahat login in a browser or installed app. The same phone can have separate browser and PWA sessions.</p></div>
    </div>

    <div className="login-session-list">
      {sessions.length ? sessions.map(session => {
        const isCurrent = session.client_session_id === currentSessionId;
        const deviceName = session.device?.device_name || 'Previously registered device';
        return <article className="login-session-card" key={session.id}>
          <span className={`session-status-dot ${session.revoked_at ? 'is-revoked' : ''}`}/>
          <div><span><strong>{session.revoked_at ? 'Signed out' : 'Active session'}</strong>{isCurrent && <i>Current</i>}</span><small>{deviceName} · {formatActivity(session.last_seen_at)}</small></div>
        </article>;
      }) : <p className="device-empty-state">No login sessions found.</p>}
    </div>

    <button className="revoke-other-sessions" type="button" disabled={busy || activeOtherSessions === 0} onClick={onRevokeOtherSessions}>
      <ShieldCheck size={17}/>Sign out other sessions{activeOtherSessions ? ` (${activeOtherSessions})` : ''}
    </button>
    {renameTarget && <div className="device-rename-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && closeRename()}>
      <form className="device-rename-dialog" onSubmit={saveRename} role="dialog" aria-modal="true" aria-labelledby="device-rename-title">
        <span className="device-rename-icon"><Pencil size={21}/></span>
        <p className="device-rename-eyebrow">DEVICE NAME</p>
        <h4 id="device-rename-title">Rename this device</h4>
        <p>Choose a name that makes this device easy to recognize in your Aahat account.</p>
        <label>Device name <span>{renameValue.length}/60</span><input autoFocus value={renameValue} maxLength={60} autoComplete="off" onChange={event => setRenameValue(event.target.value)} placeholder="For example, My phone"/></label>
        <div className="device-rename-actions"><button type="button" onClick={closeRename}>Cancel</button><button type="submit" disabled={busy || !renameValue.trim() || renameValue.trim().replace(/\s+/g, ' ') === renameTarget.device_name}><Check size={16}/>{busy ? 'Saving…' : 'Save name'}</button></div>
      </form>
    </div>}
  </section>;
}
