import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  MessageSquare, ArrowLeft, ChevronDown, Phone, Video, Search, 
  MoreVertical, Info, Users, Shield, Image, Sparkles, X, Send 
} from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';

/**
 * ChatView — Main chat area with header, calling buttons, in-chat search,
 * group details panel on the right, forwarding overlay, and input toolbar.
 */
export default function ChatView({
  activeContact, activeMessages, typingStatus,
  onSend, onAddReaction, onDeleteMessage, onUploadFile,
  onBack, // mobile back handler
  onStartCall,
  contacts, // to support forwarding contacts select
  onClearChat,
  onDeleteChat
}) {
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  
  // Ref hooks for click-outside handlers
  const moreMenuRef = useRef(null);
  const groupDetailsRef = useRef(null);
  const inChatSearchRef = useRef(null);
  
  // UI States
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  
  // Custom features
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  
  // Reply & Forward States
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardingMessage, setForwardingMessage] = useState(null);

  // Handle click outside to close dropdown menu, details sidebar, and search overlay
  useEffect(() => {
    const handleClickOutside = (event) => {
      // 1. More Menu Dropdown
      if (showMoreMenu && 
          moreMenuRef.current && 
          !moreMenuRef.current.contains(event.target) &&
          !event.target.closest('#btn-more-chat')) {
        setShowMoreMenu(false);
      }
      
      // 2. Group/Contact Details Sidebar
      if (showGroupDetails && 
          groupDetailsRef.current && 
          !groupDetailsRef.current.contains(event.target) &&
          !event.target.closest('#btn-info-chat')) {
        setShowGroupDetails(false);
      }
      
      // 3. In-chat Search Bar Overlay
      if (showInChatSearch && 
          inChatSearchRef.current && 
          !inChatSearchRef.current.contains(event.target) &&
          !event.target.closest('#btn-search-chat')) {
        setShowInChatSearch(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu, showGroupDetails, showInChatSearch]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages, typingStatus]);

  // Show/hide scroll-to-bottom button
  const handleScroll = () => {
    if (!messagesListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesListRef.current;
    setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 150);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Filter messages based on in-chat search
  const searchedMessages = useMemo(() => {
    if (!chatSearchQuery.trim()) return activeMessages;
    return activeMessages.filter(m => 
      m.text && m.text.toLowerCase().includes(chatSearchQuery.toLowerCase())
    );
  }, [activeMessages, chatSearchQuery]);

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = '';
    
    searchedMessages.forEach(msg => {
      const msgDate = new Date(msg.timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let dateLabel;
      if (msgDate.toDateString() === today.toDateString()) {
        dateLabel = 'Today';
      } else if (msgDate.toDateString() === yesterday.toDateString()) {
        dateLabel = 'Yesterday';
      } else {
        dateLabel = msgDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      if (dateLabel !== lastDate) {
        groups.push({ type: 'date', label: dateLabel, key: `date-${msg.timestamp}` });
        lastDate = dateLabel;
      }
      groups.push({ type: 'message', data: msg, key: `msg-${msg.id || msg.timestamp}` });
    });
    return groups;
  }, [searchedMessages]);

  const isTyping = activeContact && typingStatus[activeContact.id];

  // Extract shared images from message history
  const sharedMedia = useMemo(() => {
    return activeMessages.filter(m => m.attachmentUrl && !m.attachmentUrl.includes('voice-note'));
  }, [activeMessages]);

  const handleSend = (text, image) => {
    // Check if sending as a reply
    const replyPayload = replyingToMessage ? {
      id: replyingToMessage.id,
      text: replyingToMessage.text || "Photo",
      sender: replyingToMessage.isFromMe ? "You" : activeContact.name
    } : null;

    onSend(activeContact.id, text, image, replyPayload);
    setReplyingToMessage(null);
  };

  const handleTriggerReply = (message) => {
    setReplyingToMessage(message);
  };

  const handleTriggerForward = (message) => {
    setForwardingMessage(message);
  };

  const handleForwardToContact = (contactId) => {
    if (!forwardingMessage) return;
    
    // Send message to the selected target contact
    onSend(contactId, forwardingMessage.text, forwardingMessage.attachmentUrl, null);
    setForwardingMessage(null);
    alert(`Message forwarded successfully!`);
  };

  // --- Default Empty State ---
  if (!activeContact) {
    return (
      <div className="chat-view empty" id="chat-view">
        <div className="chat-empty-state">
          {/* Animated waves graphic */}
          <div className="empty-brand-wave">
            <span className="logo-ring ring-1" />
            <span className="logo-ring ring-2" />
            <span className="logo-ring ring-3" />
            <div className="empty-logo-center">
              <div className="soundwave-logo large">
                <span className="wave-bar bar-1" />
                <span className="wave-bar bar-2" />
                <span className="wave-bar bar-3" />
                <span className="wave-bar bar-4" />
                <span className="wave-bar bar-5" />
              </div>
            </div>
          </div>
          <h3>Welcome to Aahat</h3>
          <p className="security-note">🔒 End-to-end encrypted messaging. Sound waves of thoughts.</p>
          <span className="start-prompt">Select a conversation to start chatting</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area-container" id="chat-view">
      
      {/* Messages Column */}
      <div className="chat-view">
        
        {/* Header */}
        <div className="chat-header" id="chat-header">
          {onBack && (
            <button className="btn-icon mobile-back" onClick={onBack} id="btn-back">
              <ArrowLeft size={18} />
            </button>
          )}

          <div className="chat-header-info">
            <div className="avatar-wrapper">
              {activeContact.avatarUrl ? (
                <img src={activeContact.avatarUrl} alt={activeContact.name} className="avatar-image header-avatar" loading="lazy" />
              ) : (
                <div className="avatar-image header-avatar" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--accent-gradient)',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '14px',
                  borderRadius: 'var(--radius-full)',
                  border: '2px solid rgba(255, 255, 255, 0.08)'
                }}>
                  {activeContact.name[0].toUpperCase()}
                </div>
              )}
              {!activeContact.isGroup && (
                <div className={`status-badge ${activeContact.isActive ? 'active' : 'offline'}`} />
              )}
            </div>
            <div className="chat-header-details">
              <h3>{activeContact.name}</h3>
              {isTyping ? (
                <p className="typing-indicator">
                  <span className="typing-dots"><span /><span /><span /></span>
                  typing...
                </p>
              ) : (
                <p className="status-text">
                  {activeContact.isGroup ? `${activeContact.memberCount} members` : activeContact.lastActiveText}
                </p>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="chat-header-actions">
            
            {/* Audio Call */}
            {!activeContact.isGroup && activeContact.id !== 'me' && (
              <button 
                className="btn-icon header-action-btn" 
                onClick={() => onStartCall(activeContact, 'voice')}
                title="Voice Call"
                id="btn-call-voice"
              >
                <Phone size={18} />
              </button>
            )}

            {/* Video Call */}
            {!activeContact.isGroup && activeContact.id !== 'me' && (
              <button 
                className="btn-icon header-action-btn" 
                onClick={() => onStartCall(activeContact, 'video')}
                title="Video Call"
                id="btn-call-video"
              >
                <Video size={18} />
              </button>
            )}

            {/* In-chat search button */}
            <button 
              className={`btn-icon header-action-btn ${showInChatSearch ? 'active' : ''}`} 
              onClick={() => setShowInChatSearch(!showInChatSearch)}
              title="Search Messages"
              id="btn-search-chat"
            >
              <Search size={18} />
            </button>

            {/* Group info or Contact details toggle */}
            <button 
              className={`btn-icon header-action-btn ${showGroupDetails ? 'active' : ''}`}
              onClick={() => setShowGroupDetails(!showGroupDetails)}
              title={activeContact.isGroup ? "Group Details" : "Contact Info"}
              id="btn-info-chat"
            >
              <Info size={18} />
            </button>

            {/* More menu dropdown button */}
            <div className="dropdown-trigger-wrapper">
              <button 
                className="btn-icon header-action-btn" 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                title="More Options"
                id="btn-more-chat"
              >
                <MoreVertical size={18} />
              </button>

              {showMoreMenu && (
                <div className="chat-dropdown-menu" ref={moreMenuRef}>
                  <button onClick={() => { alert("Chat archived"); setShowMoreMenu(false); }}>Archive Chat</button>
                  <button onClick={() => { alert("Notifications muted"); setShowMoreMenu(false); }}>Mute Notifications</button>
                  <button className="danger" onClick={() => { onClearChat?.(activeContact.id); setShowMoreMenu(false); }}>Clear Chat</button>
                  <button className="danger" onClick={() => { onDeleteChat?.(activeContact.id); setShowMoreMenu(false); }}>Delete Chat</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* In-chat search bar overlay */}
        {showInChatSearch && (
          <div className="in-chat-search-bar" ref={inChatSearchRef}>
            <Search size={14} className="search-icon" />
            <input 
              type="text" 
              placeholder="Search messages..." 
              value={chatSearchQuery}
              onChange={e => setChatSearchQuery(e.target.value)}
              autoFocus
            />
            <button className="btn-close-search" onClick={() => { setChatSearchQuery(''); setShowInChatSearch(false); }}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Messages List Area */}
        <div
          className="messages-list"
          ref={messagesListRef}
          onScroll={handleScroll}
          id="messages-list"
        >
          {groupedMessages.length === 0 ? (
            <div className="chat-start-hint">
              {chatSearchQuery ? (
                <p>No messages match your search criteria</p>
              ) : (
                <p>Say hello to <strong>{activeContact.name}</strong> 👋</p>
              )}
            </div>
          ) : (
            groupedMessages.map(item => {
              if (item.type === 'date') {
                return (
                  <div key={item.key} className="date-separator">
                    <span>{item.label}</span>
                  </div>
                );
              }
              return (
                <MessageBubble
                  key={item.key}
                  msg={item.data}
                  showReactionPicker={showReactionPicker}
                  onToggleReactionPicker={setShowReactionPicker}
                  onAddReaction={onAddReaction}
                  onDelete={onDeleteMessage}
                  onReply={handleTriggerReply}
                  onForward={handleTriggerForward}
                />
              );
            })
          )}

          {/* Typing dots */}
          {isTyping && (
            <div className="message-bubble-wrapper other typing-bubble">
              <div className="bubble-row">
                <div className="message-sender-avatar">
                  {activeContact.name[0].toUpperCase()}
                </div>
                <div className="message-bubble">
                  <div className="typing-dots large">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Scroll FAB */}
        {showScrollBtn && (
          <button className="scroll-to-bottom" onClick={scrollToBottom} id="btn-scroll-bottom">
            <ChevronDown size={18} />
          </button>
        )}

        {/* Chat Input toolbar */}
        <ChatInput 
          onSend={handleSend} 
          onUploadFile={onUploadFile} 
          replyTo={replyingToMessage}
          onCancelReply={() => setReplyingToMessage(null)}
        />
      </div>

      {/* Side Info Sidebar (Group / Contact details) */}
      {showGroupDetails && (
        <div className="chat-details-sidebar" id="group-details-sidebar" ref={groupDetailsRef}>
          <div className="sidebar-details-header">
            <h3>{activeContact.isGroup ? "Group Details" : "Contact Details"}</h3>
            <button className="btn-icon" onClick={() => setShowGroupDetails(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="sidebar-details-scroll">
            <div className="details-avatar-card">
              {activeContact.avatarUrl ? (
                <img src={activeContact.avatarUrl} alt="" className="details-avatar" />
              ) : (
                <div className="details-avatar" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--accent-gradient)',
                  color: 'white',
                  fontWeight: '700',
                  fontSize: '24px',
                  borderRadius: 'var(--radius-full)',
                  border: '3px solid var(--panel-border)',
                  margin: '0 auto 8px',
                  width: '80px',
                  height: '80px'
                }}>
                  {activeContact.name[0].toUpperCase()}
                </div>
              )}
              <h3>{activeContact.name}</h3>
              <p>{activeContact.isGroup ? "Group Chat" : activeContact.lastActiveText}</p>
            </div>

            {/* Description */}
            <div className="details-block">
              <label>Description / Bio</label>
              <p>{activeContact.description || activeContact.lastActiveText || "No description provided."}</p>
            </div>

            {/* Members Section (Only for groups) */}
            {activeContact.isGroup && (
              <div className="details-block">
                <label className="flex-row-label">
                  <Users size={14} /> Group Members ({activeContact.memberCount || 6})
                </label>
                <div className="details-members-list">
                  <div className="member-item">
                    <div className="member-avatar">E</div>
                    <div>
                      <h4>Elena R.</h4>
                      <span className="admin-badge">Admin</span>
                    </div>
                  </div>
                  <div className="member-item">
                    <div className="member-avatar">S</div>
                    <div>
                      <h4>Sam</h4>
                      <span className="admin-badge">Admin</span>
                    </div>
                  </div>
                  <div className="member-item">
                    <div className="member-avatar">A</div>
                    <div>
                      <h4>Alex</h4>
                      <span className="member-label">Developer</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Shared Media Grid */}
            <div className="details-block">
              <label className="flex-row-label">
                <Image size={14} /> Shared Media ({sharedMedia.length})
              </label>
              {sharedMedia.length === 0 ? (
                <p className="no-media-label">No media shared in this chat yet</p>
              ) : (
                <div className="shared-media-grid">
                  {sharedMedia.map(m => (
                    <div key={m.id} className="shared-media-item">
                      <img src={m.attachmentUrl} alt="Shared Attachment" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Modal Popover */}
      {forwardingMessage && (
        <div className="modal-overlay" onClick={() => setForwardingMessage(null)}>
          <div className="modal-card forwarding-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Forward Message</h3>
              <button className="modal-close" onClick={() => setForwardingMessage(null)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="forwarding-preview">
              <span className="label">Message Preview</span>
              <p>{forwardingMessage.text || "[Image attachment]"}</p>
            </div>

            <div className="forward-list">
              <span className="label">Select Target Conversation</span>
              <div className="forward-contacts-scroll">
                {contacts
                  .filter(c => c.id !== activeContact.id)
                  .map(contact => (
                    <div key={contact.id} className="forward-contact-row">
                      <div className="contact-details">
                        {contact.avatarUrl ? (
                          <img src={contact.avatarUrl} alt="" className="contact-avatar-sm" />
                        ) : (
                          <div className="contact-avatar-sm" style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--accent-gradient)',
                            color: 'white',
                            fontWeight: '700',
                            fontSize: '10px',
                            borderRadius: 'var(--radius-full)',
                            width: '24px',
                            height: '24px',
                            border: '1px solid rgba(255, 255, 255, 0.08)'
                          }}>
                            {contact.name[0].toUpperCase()}
                          </div>
                        )}
                        <span>{contact.name}</span>
                      </div>
                      <button 
                        className="btn-forward-send" 
                        onClick={() => handleForwardToContact(contact.id)}
                      >
                        Send
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
