import { BellRing, Eye, EyeOff, Save, Volume2, VolumeX } from 'lucide-react';
import './NotificationSettingsSection.css';

function SettingToggle({ icon, offIcon, title, description, checked, onChange }) {
  const Icon = checked ? icon : offIcon;
  return <button type="button" className={`notification-setting-card ${checked ? 'is-on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
    <span className="notification-setting-icon"><Icon size={20}/></span>
    <span className="notification-setting-copy"><strong>{title}</strong><small>{description}</small></span>
    <span className="notification-premium-toggle" aria-hidden="true"><i/></span>
  </button>;
}

export default function NotificationSettingsSection({ notifications, setNotifications, permission, busy, onEnablePush, onSave }) {
  const soundEnabled = notifications.sound !== false;
  const previewsEnabled = notifications.previews !== false;
  const permissionLabel = permission === 'granted' ? 'Push enabled' : permission === 'denied' ? 'Blocked by browser' : 'Push not enabled';

  return <section className="notification-settings-section">
    <header className="notification-section-header">
      <span><BellRing size={23}/></span>
      <div><h3>Notifications</h3><p>Choose how new messages appear and sound on this device.</p></div>
      <i className={`notification-permission-badge is-${permission}`}>{permissionLabel}</i>
    </header>

    <div className="notification-settings-grid">
      <SettingToggle
        icon={Volume2}
        offIcon={VolumeX}
        title="Notification sound"
        description="Play a chime for new messages. Background sound follows your device settings."
        checked={soundEnabled}
        onChange={value => setNotifications(current => ({ ...current, sound: value }))}
      />
      <SettingToggle
        icon={Eye}
        offIcon={EyeOff}
        title="Message previews"
        description="Show sender and message text. Turn off to display a private generic alert."
        checked={previewsEnabled}
        onChange={value => setNotifications(current => ({ ...current, previews: value }))}
      />
    </div>

    <div className="notification-action-row">
      <button type="button" className="notification-enable-button" disabled={busy || permission === 'granted'} onClick={onEnablePush}><BellRing size={17}/>{permission === 'granted' ? 'Push notifications enabled' : 'Enable push notifications'}</button>
      <button type="button" className="notification-save-button" disabled={busy} onClick={onSave}><Save size={17}/>Save preferences</button>
    </div>
  </section>;
}
