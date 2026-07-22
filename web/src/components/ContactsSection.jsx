import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Check, Clock3, MessageSquare, MoreVertical, Trash2, UserPlus, Users, X } from 'lucide-react';
import SafeAvatar from './SafeAvatar';
import './ContactActions.css';

export default function ContactsSection({
  conversations,
  incomingRequests,
  outgoingRequests,
  isLoading,
  isUserOnline,
  canViewOnlineStatus,
  onAddContact,
  onSelectConversation,
  onRespond,
  onRemoveContact,
  onBlockContact
}) {
  const directContacts = conversations.filter(conversation => conversation.type === 'direct');
  const pendingIncoming = incomingRequests.filter(request => request.status === 'pending');
  const pendingOutgoing = outgoingRequests.filter(request => request.status === 'pending');
  const [openContactMenu, setOpenContactMenu] = useState(null);
  const [contactAction, setContactAction] = useState(null);
  const [removingContact, setRemovingContact] = useState(false);

  useEffect(() => {
    if (!openContactMenu) return undefined;
    const closeOutside = event => {
      if (event.target.closest('.contact-menu-trigger, .contact-menu-popover')) return;
      setOpenContactMenu(null);
    };
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpenContactMenu(null);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [openContactMenu]);

  const respond = async (request, accept) => {
    try {
      const conversationId = await onRespond(request.id, accept);
      if (accept && conversationId) onSelectConversation(conversationId);
    } catch (error) {
      alert(error.message || 'Could not respond to invitation.');
    }
  };

  const confirmContactAction = async () => {
    const conversation = contactAction?.conversation;
    if (!conversation?.otherMemberId) return;
    setRemovingContact(true);
    try {
      if (contactAction.type === 'block') await onBlockContact(conversation.otherMemberId);
      else await onRemoveContact(conversation.otherMemberId);
      setContactAction(null);
      setOpenContactMenu(null);
    } catch (error) {
      alert(error.message || `Could not ${contactAction.type} this contact.`);
    } finally {
      setRemovingContact(false);
    }
  };

  return (
    <div className="contacts-section aahat-contacts-page">
      <header className="aahat-section-header">
        <div>
          <h2><Users size={22}/>My Contacts</h2>
          <p>Manage the people you are connected with.</p>
        </div>
        <button onClick={onAddContact} className="admin-btn admin-btn-primary"><UserPlus size={16}/>Add Contact</button>
      </header>

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
          <SafeAvatar src="/logo.png" name="Aahat" size={40}/>
          <div><strong>Aahat</strong><small><Clock3 size={12}/>Waiting for acceptance</small></div>
        </article>)}
      </section>}

      {/* Connected people are a compact single-column list, the shape a
          contact list is expected to have. The ID and presence sit on one
          secondary line so a row stays close to the chat-list row height. */}
      <section className="aahat-request-section aahat-contacts-list">
        <h3>Connected people</h3>
        {isLoading ? <div className="aahat-empty">Loading contacts…</div> : directContacts.length === 0 ? (
          <div className="aahat-empty"><Users size={32}/><p>No connected contacts yet.</p><small>Use Add Contact to connect with someone.</small></div>
        ) : directContacts.map(conversation => (
          <article
            className={`aahat-contact-card ${canViewOnlineStatus?.(conversation.otherMemberId) && !isUserOnline(conversation.otherMemberId) ? 'is-offline' : ''}`}
            key={conversation.id}
            onClick={() => { setOpenContactMenu(null); onSelectConversation(conversation.id); }}
          >
            <div className="avatar-wrapper">
              <SafeAvatar src={conversation.avatarUrl} name={conversation.name} size={44}/>
              {canViewOnlineStatus?.(conversation.otherMemberId) && <div className={`status-badge ${isUserOnline(conversation.otherMemberId) ? 'active' : 'offline'}`}/>}
            </div>
            <div>
              <strong>{conversation.name}</strong>
              <small className="aahat-contact-meta">
                {conversation.otherMemberVirtualNumber && <span className="aahat-contact-id">{conversation.otherMemberVirtualNumber}</span>}
                {canViewOnlineStatus?.(conversation.otherMemberId) && <span>{isUserOnline(conversation.otherMemberId) ? 'Online' : 'Offline'}</span>}
              </small>
            </div>
            <div className="contact-card-actions" onClick={event => event.stopPropagation()}>
              {/* Icon-only: the whole row already opens the chat, so a
                  labelled button would repeat it and cost a line of width. */}
              <button className="contact-chat-button" aria-label={`Chat with ${conversation.name}`} onClick={() => onSelectConversation(conversation.id)}><MessageSquare size={17}/></button>
              <button className="contact-menu-trigger" aria-label={`More actions for ${conversation.name}`} onClick={() => setOpenContactMenu(current => current === conversation.id ? null : conversation.id)}><MoreVertical size={17}/></button>
            </div>
            {openContactMenu === conversation.id && <div className="contact-menu-popover" onClick={event => event.stopPropagation()}>
              <button onClick={() => { setContactAction({ type: 'remove', conversation }); setOpenContactMenu(null); }}><Trash2 size={15}/>Remove contact</button>
              <button className="block" onClick={() => { setContactAction({ type: 'block', conversation }); setOpenContactMenu(null); }}><Ban size={15}/>Block & remove</button>
            </div>}
          </article>
        ))}
      </section>

      {contactAction && <div className="contact-delete-overlay" onClick={() => !removingContact && setContactAction(null)}>
        <div className="contact-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="remove-contact-title" onClick={event => event.stopPropagation()}>
          <div className="contact-delete-icon"><AlertTriangle size={24}/></div>
          <h3 id="remove-contact-title">{contactAction.type === 'block' ? 'Block' : 'Remove'} {contactAction.conversation.name}?</h3>
          <p>{contactAction.type === 'block' ? <>This blocks the user and removes the contact/chat for <strong>both of you</strong>. They cannot find you using your Aahat ID until you unblock them.</> : <>This removes the connection and direct chat for <strong>both of you</strong>. Either person can connect again later.</>}</p>
          <div className="contact-delete-actions">
            <button disabled={removingContact} onClick={() => setContactAction(null)}>Cancel</button>
            <button className="danger" disabled={removingContact} onClick={confirmContactAction}>{contactAction.type === 'block' ? <Ban size={15}/> : <Trash2 size={15}/>} {removingContact ? 'Working…' : contactAction.type === 'block' ? 'Block & remove' : 'Remove for both'}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
