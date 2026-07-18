import { useEffect, useMemo, useState } from 'react';
import { Check, Globe2, Search, ShieldCheck, UserCheck, Users } from 'lucide-react';
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
      <div className="privacy-heading">
        <div className="privacy-heading-icon"><ShieldCheck size={22} /></div>
        <div><h3>Privacy</h3><p>Control how people find you and who can see your activity.</p></div>
      </div>

      <div className="privacy-switch-grid">
        {PRIVACY_SWITCHES.map(([key, label, detail]) => (
          <label className="privacy-switch-card" key={key}>
            <span><strong>{label}</strong><small>{detail}</small></span>
            <input
              type="checkbox"
              checked={privacy[key] !== false}
              onChange={event => setPrivacy(current => ({ ...current, [key]: event.target.checked }))}
            />
            <i aria-hidden="true" />
          </label>
        ))}
      </div>

      <div className="status-audience-panel">
        <div className="privacy-section-title"><span>Status audience</span><small>Choose who sees new stories</small></div>
        <div className="audience-option-grid">
          {AUDIENCES.map(({ id, label, detail, Icon }) => {
            const active = (privacy.status || 'contacts') === id;
            return (
              <button
                type="button"
                key={id}
                className={`audience-option ${active ? 'active' : ''}`}
                onClick={() => setPrivacy(current => ({ ...current, status: id }))}
              >
                <span className="audience-option-icon"><Icon size={18} /></span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <i>{active && <Check size={13} />}</i>
              </button>
            );
          })}
        </div>

        {(privacy.status || 'contacts') === 'selected' && (
          <div className="status-member-picker">
            <div className="member-picker-top">
              <div><strong>Select contacts</strong><small>{selectedIds.length} selected</small></div>
              <div className="member-search-box"><Search size={17} /><input className="member-search-input" type="search" value={contactSearch} onChange={event => setContactSearch(event.target.value)} placeholder="Search contacts" /></div>
            </div>
            <div className="member-picker-list">
              {visibleContacts.length ? visibleContacts.map(contact => {
                const selected = selectedIds.includes(contact.otherMemberId);
                return (
                  <button type="button" key={contact.otherMemberId} className={selected ? 'selected' : ''} onClick={() => toggleStatusMember(contact.otherMemberId)}>
                    <SafeAvatar src={contact.avatarUrl} name={contact.name} size={38} />
                    <span><strong>{contact.name}</strong><small>AHID {contact.otherMemberVirtualNumber || 'Private'}</small></span>
                    <i>{selected && <Check size={14} />}</i>
                  </button>
                );
              }) : <p>No matching connected contacts.</p>}
            </div>
          </div>
        )}
      </div>

      <button className="privacy-save-button" disabled={busy || ((privacy.status || 'contacts') === 'selected' && selectedIds.length === 0)} onClick={onSave}>
        {busy ? 'Saving…' : 'Save privacy'}
      </button>

      <div className="blocked-users-panel">
        <div className="privacy-section-title"><span>Blocked users</span><small>They cannot find or contact you</small></div>
        {blocked.length ? blocked.map(row => (
          <div className="blocked-user-row" key={row.id}>
            <SafeAvatar src={row.avatar_url} name={row.display_name} size={36} />
            <span>{row.display_name}</span>
            <button type="button" onClick={() => onUnblock(row.id)}>Unblock</button>
          </div>
        )) : <p className="privacy-empty-state">No blocked users.</p>}
      </div>
    </section>
  );
}

