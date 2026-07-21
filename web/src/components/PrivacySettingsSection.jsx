import { useEffect, useMemo, useState } from 'react';
import { Check, Globe2, Search, UserCheck, Users } from 'lucide-react';
import SafeAvatar from './SafeAvatar';
import './PrivacySettingsSection.css';

const AUDIENCES = [
  { id: 'everyone', label: 'Everyone', detail: 'Any Aahat user can view', Icon: Globe2 },
  { id: 'contacts', label: 'Contacts', detail: 'All connected people', Icon: Users },
  { id: 'selected', label: 'Selected', detail: 'Only people you choose', Icon: UserCheck },
];

const PRIVACY_SWITCHES = [
  ['last_seen', 'Show last seen', 'Let contacts see when you were last active'],
  ['online', 'Show online status', 'Show when Aahat is open on this device'],
  ['read_receipts', 'Read receipts', 'Send blue ticks after you read messages']
];

export default function PrivacySettingsSection({
  privacy,
  setPrivacy,
  conversations,
  blocked,
  onUnblock,
  onSave,
  busy
}) {
  const [contactSearch, setContactSearch] = useState('');
  const directContacts = useMemo(() => {
    const seen = new Set();
    return (conversations || []).filter(conversation => {
      if (conversation.type !== 'direct' || !conversation.otherMemberId || seen.has(conversation.otherMemberId)) return false;
      seen.add(conversation.otherMemberId);
      return true;
    });
  }, [conversations]);
  const selectedIds = Array.isArray(privacy.status_members) ? privacy.status_members : [];
  const visibleContacts = directContacts.filter(contact => (
    `${contact.name || ''} ${contact.otherMemberVirtualNumber || ''}`.toLowerCase().includes(contactSearch.trim().toLowerCase())
  ));
  useEffect(() => {
    if (!['everyone', 'contacts', 'selected'].includes(privacy.status || 'contacts')) {
      setPrivacy(current => ({ ...current, status: 'contacts' }));
    }
  }, [privacy.status, setPrivacy]);


  const toggleStatusMember = contactId => {
    setPrivacy(current => {
      const currentIds = Array.isArray(current.status_members) ? current.status_members : [];
      return {
        ...current,
        status_members: currentIds.includes(contactId)
          ? currentIds.filter(id => id !== contactId)
          : [...currentIds, contactId]
      };
    });
  };

  return (
    <section className="settings-privacy">
      <header className="settings-section-head">
        <h3>Privacy</h3>
        <p>Control how people find you and who can see your activity.</p>
      </header>

      <div className="settings-list-group">
        <p className="settings-group-label">Activity</p>
        {PRIVACY_SWITCHES.map(([key, label, detail]) => (
          <label className="settings-row" key={key}>
            <span className="settings-row-copy">
              <strong>{label}</strong>
              <small>{detail}</small>
            </span>
            <input
              type="checkbox"
              checked={privacy[key] !== false}
              onChange={event => setPrivacy(current => ({ ...current, [key]: event.target.checked }))}
            />
            <i className="settings-switch" aria-hidden="true" />
          </label>
        ))}
      </div>

      <div className="settings-list-group">
        <p className="settings-group-label">Status audience</p>
        {AUDIENCES.map(({ id, label, detail, Icon }) => {
          const active = (privacy.status || 'contacts') === id;
          return (
            <button
              type="button"
              key={id}
              className={`settings-row settings-row-selectable ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              onClick={() => setPrivacy(current => ({ ...current, status: id }))}
            >
              <span className="settings-row-icon"><Icon size={18} /></span>
              <span className="settings-row-copy">
                <strong>{label}</strong>
                <small>{detail}</small>
              </span>
              <span className="settings-row-check">{active && <Check size={16} />}</span>
            </button>
          );
        })}
      </div>

      {(privacy.status || 'contacts') === 'selected' && (
        <div className="settings-list-group">
          <p className="settings-group-label">
            Select contacts<span className="settings-group-meta">{selectedIds.length} selected</span>
          </p>
          <div className="settings-search-row">
            <Search size={17} />
            <input
              type="search"
              value={contactSearch}
              onChange={event => setContactSearch(event.target.value)}
              placeholder="Search contacts"
              aria-label="Search contacts"
            />
          </div>
          <div className="settings-scroll-list">
            {visibleContacts.length ? visibleContacts.map(contact => {
              const selected = selectedIds.includes(contact.otherMemberId);
              return (
                <button
                  type="button"
                  key={contact.otherMemberId}
                  className={`settings-row settings-row-selectable ${selected ? 'is-active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => toggleStatusMember(contact.otherMemberId)}
                >
                  <SafeAvatar src={contact.avatarUrl} name={contact.name} size={36} />
                  <span className="settings-row-copy">
                    <strong>{contact.name}</strong>
                    <small>AHID {contact.otherMemberVirtualNumber || 'Private'}</small>
                  </span>
                  <span className="settings-row-check">{selected && <Check size={16} />}</span>
                </button>
              );
            }) : <p className="settings-empty-state">No matching connected contacts.</p>}
          </div>
        </div>
      )}

      <button
        className="settings-primary-action"
        disabled={busy || ((privacy.status || 'contacts') === 'selected' && selectedIds.length === 0)}
        onClick={onSave}
      >
        {busy ? 'Saving…' : 'Save privacy'}
      </button>

      <div className="settings-list-group">
        <p className="settings-group-label">Blocked users<span className="settings-group-meta">They cannot find or contact you</span></p>
        {blocked.length ? blocked.map(row => (
          <div className="settings-row" key={row.id}>
            <SafeAvatar src={row.avatar_url} name={row.display_name} size={36} />
            <span className="settings-row-copy"><strong>{row.display_name}</strong></span>
            <button type="button" className="settings-row-action danger" onClick={() => onUnblock(row.id)}>Unblock</button>
          </div>
        )) : <p className="settings-empty-state">No blocked users.</p>}
      </div>
    </section>
  );
}
