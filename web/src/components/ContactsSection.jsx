import { Check, Clock3, Copy, MessageSquare, RefreshCw, UserPlus, Users, X } from 'lucide-react';
import SafeAvatar from './SafeAvatar';

const copyText = async value => {
  if (value) await navigator.clipboard.writeText(value);
};

export default function ContactsSection({
  credentials,
  conversations,
  incomingRequests,
  outgoingRequests,
  isLoading,
  isUserOnline,
  onAddContact,
  onSelectConversation,
  onRespond,
  onRotatePin
}) {
  const directContacts = conversations.filter(conversation => conversation.type === 'direct');
  const pendingIncoming = incomingRequests.filter(request => request.status === 'pending');
  const pendingOutgoing = outgoingRequests.filter(request => request.status === 'pending');

  const respond = async (request, accept) => {
    try {
      const conversationId = await onRespond(request.id, accept);
      if (accept && conversationId) onSelectConversation(conversationId);
    } catch (error) {
      alert(error.message || 'Could not respond to invitation.');
    }
  };

  const rotate = async () => {
    if (!confirm('Generate a new connection PIN? Your old PIN will stop working immediately.')) return;
    try { await onRotatePin(); }
    catch (error) { alert(error.message || 'Could not generate a new PIN.'); }
  };

  return (
    <div className="contacts-section aahat-contacts-page">
      <header className="aahat-section-header">
        <div>
          <h2><Users size={22}/>My Contacts</h2>
          <p>Connect securely using an Aahat ID and PIN.</p>
        </div>
        <button onClick={onAddContact} className="admin-btn admin-btn-primary"><UserPlus size={16}/>Add Contact</button>
      </header>

      <section className="aahat-identity-card">
        <div>
          <span>Your 10-digit Aahat ID</span>
          <strong>{credentials?.aahat_id || '----------'}</strong>
        </div>
        <button title="Copy Aahat ID" onClick={() => copyText(credentials?.aahat_id)}><Copy size={16}/></button>
        <div>
          <span>Your 6-digit connection PIN</span>
          <strong>{credentials?.pin_code || '------'}</strong>
        </div>
        <button title="Copy PIN" onClick={() => copyText(credentials?.pin_code)}><Copy size={16}/></button>
        <button className="aahat-rotate-pin" onClick={rotate}><RefreshCw size={15}/>New PIN</button>
      </section>

      {pendingIncoming.length > 0 && <section className="aahat-request-section">
        <h3>Invitations <span>{pendingIncoming.length}</span></h3>
        {pendingIncoming.map(request => <article className="aahat-request-card" key={request.id}>
          <SafeAvatar src={request.requester?.avatar_url} name={request.requester?.display_name} size={44}/>
          <div><strong>{request.requester?.display_name || 'Aahat user'}</strong><small>AHID {request.requester?.virtual_number}</small></div>
          <div className="aahat-request-actions">
            <button className="accept" onClick={() => respond(request, true)}><Check size={15}/>Accept</button>
            <button onClick={() => respond(request, false)}><X size={15}/>Decline</button>
          </div>
        </article>)}
      </section>}

      {pendingOutgoing.length > 0 && <section className="aahat-request-section">
        <h3>Sent invitations</h3>
        {pendingOutgoing.map(request => <article className="aahat-request-card" key={request.id}>
          <SafeAvatar src={request.recipient?.avatar_url} name={request.recipient?.display_name} size={40}/>
          <div><strong>{request.recipient?.display_name || 'Aahat user'}</strong><small><Clock3 size={12}/>Waiting for acceptance</small></div>
        </article>)}
      </section>}

      <section className="aahat-request-section">
        <h3>Connected people</h3>
        {isLoading ? <div className="aahat-empty">Loading contacts…</div> : directContacts.length === 0 ? (
          <div className="aahat-empty"><Users size={32}/><p>No connected contacts yet.</p><small>Enter a friend's AHID and PIN, then wait for them to accept.</small></div>
        ) : directContacts.map(conversation => (
          <article className="aahat-contact-card" key={conversation.id} onClick={() => onSelectConversation(conversation.id)}>
            <div className="avatar-wrapper">
              <SafeAvatar src={conversation.avatarUrl} name={conversation.name} size={44}/>
              <div className={`status-badge ${isUserOnline(conversation.otherMemberId) ? 'active' : 'offline'}`}/>
            </div>
            <div><strong>{conversation.name}</strong><small>{isUserOnline(conversation.otherMemberId) ? 'Online' : 'Offline'}</small></div>
            <button><MessageSquare size={15}/>Chat</button>
          </article>
        ))}
      </section>
    </div>
  );
}
