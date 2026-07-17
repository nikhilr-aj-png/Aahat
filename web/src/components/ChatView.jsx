import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { 
  ArrowLeft, ChevronDown, Phone, Video, Search,
  MoreVertical, Info, Users, Image, X, Forward, Trash2
} from 'lucide-react';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import SafeAvatar from './SafeAvatar';

import { supabase } from '../supabase';

/**
 * ChatView â€” Main chat area (V2).
 * Uses conversation + messages from normalized hooks.
 */
export default function ChatView({
  conversation, messages, typingUsers,
  onSend, onAddReaction,
  onDeleteForMe, onDeleteForEveryone, onEditMessage,
  onRetryMessage,
  onLoadMoreMessages, hasMoreMessages, isLoadingMoreMessages,
  onUploadFile,
  onBack,
  onStartCall,
  conversations,
  onClearChat, onDeleteChat, onToggleArchive, onToggleMute,
  onSetTyping,
  currentUserId,
  isUserOnline,
  onForwardMessage,
  onFetchGroupMembers,
  onAddGroupMember,
  onRemoveGroupMember,
  onUpdateGroupMemberRole,
  onLeaveGroup
}) {
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const stickToBottomRef = useRef(true);
  const moreMenuRef = useRef(null);
  const groupDetailsRef = useRef(null);
  const inChatSearchRef = useRef(null);

  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(null);
  const [showInChatSearch, setShowInChatSearch] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
  const [forwardingMessages, setForwardingMessages] = useState([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());
  const [visibleMessageLimit, setVisibleMessageLimit] = useState(140);
  const showLegacyGreeting = false;

  const [groupMembers, setGroupMembers] = useState([]);
  const [isFetchingMembers, setIsFetchingMembers] = useState(false);
  const [newMemberAahatId, setNewMemberAahatId] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);

  useEffect(() => {
    stickToBottomRef.current = true;
    setVisibleMessageLimit(140);
    setSelectedMessageIds(new Set());
    setEditingMessage(null);
    setOpenMessageMenuId(null);
    setShowReactionPicker(null);
  }, [conversation?.id]);

  // Fetch group members dynamically
  const loadGroupMembers = useCallback(async () => {
    if (conversation?.type === 'group' && onFetchGroupMembers) {
      setIsFetchingMembers(true);
      const members = await onFetchGroupMembers(conversation.id);
      setGroupMembers(members);
      setIsFetchingMembers(false);
    }
  }, [conversation?.id, conversation?.type, onFetchGroupMembers]);

  useEffect(() => {
    if (showGroupDetails) {
      loadGroupMembers();
    }
  }, [showGroupDetails, loadGroupMembers]);

  // Click-outside handler for dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(event.target) && !event.target.closest('#btn-more-chat')) {
        setShowMoreMenu(false);
      }
      if (showGroupDetails && groupDetailsRef.current && !groupDetailsRef.current.contains(event.target) && !event.target.closest('#btn-info-chat')) {
        setShowGroupDetails(false);
      }
      if (showInChatSearch && inChatSearchRef.current && !inChatSearchRef.current.contains(event.target) && !event.target.closest('#btn-search-chat')) {
        setShowInChatSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreMenu, showGroupDetails, showInChatSearch]);

  // Keep scrolling confined to the message list. Element scrolling can move the
  // whole mobile viewport and hide the chat header.
  useEffect(() => {
    const list = messagesListRef.current;
    if (!list || !stickToBottomRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      list.scrollTo({ top: list.scrollHeight, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, typingUsers]);

  const handleScroll = () => {
    if (!messagesListRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesListRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
    setShowScrollBtn(distanceFromBottom > 150);
  };

  const scrollToBottom = () => {
    const list = messagesListRef.current;
    if (!list) return;
    stickToBottomRef.current = true;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  };

  // Filter messages by search
  const searchedMessages = useMemo(() => {
    if (!chatSearchQuery.trim()) return messages;
    return messages.filter(m => m.content && m.content.toLowerCase().includes(chatSearchQuery.toLowerCase()));
  }, [messages, chatSearchQuery]);

  // Group by date
  const groupedMessages = useMemo(() => {
    const groups = [];
    let lastDate = '';

    searchedMessages.forEach(msg => {
      const msgDate = new Date(msg.created_at);
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
        groups.push({ type: 'date', label: dateLabel, key: `date-${msg.created_at}` });
        lastDate = dateLabel;
      }
      groups.push({ type: 'message', data: msg, key: `msg-${msg.id}` });
    });
    return groups;
  }, [searchedMessages]);

  const hiddenMessageCount = Math.max(0, groupedMessages.length - visibleMessageLimit);
  const visibleGroupedMessages = groupedMessages.slice(-visibleMessageLimit);

  const isTyping = typingUsers && typingUsers.length > 0;

  // Shared media for details panel
  const sharedMedia = useMemo(() => {
    return messages.filter(m => m.attachment_url && m.message_type !== 'voice_note' && m.message_type !== 'audio');
  }, [messages]);

  // Handlers
  const handleSend = async (text, image) => {
    stickToBottomRef.current = true;
    if (editingMessage) {
      await onEditMessage(editingMessage.id, text);
      setEditingMessage(null);
      return;
    }
    const replyPayload = replyingToMessage ? {
      id: replyingToMessage.id,
      text: replyingToMessage.content || "Photo",
      sender: replyingToMessage.isFromMe ? "You" : conversation?.name
    } : null;

    onSend(text, image, replyPayload);
    setReplyingToMessage(null);
  };

  const selectedMessages = messages.filter(message => selectedMessageIds.has(message.id));
  const toggleMessageSelection = messageId => setSelectedMessageIds(current => {
    const next = new Set(current);
    if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
    return next;
  });
  const startMessageSelection = messageId => setSelectedMessageIds(new Set([messageId]));
  const deleteSelectedMessages = async () => {
    if (!selectedMessages.length || !confirm(`Delete ${selectedMessages.length} selected message(s) for you?`)) return;
    await Promise.all(selectedMessages.map(message => onDeleteForMe?.(message.id)));
    setSelectedMessageIds(new Set());
  };
  const handleForwardToContact = async targetConvId => {
    if (!forwardingMessages.length) return;
    await Promise.all(forwardingMessages.map(message => onForwardMessage?.(message.content, message.attachment_url, targetConvId)));
    setForwardingMessages([]);
    setSelectedMessageIds(new Set());
    alert(`${forwardingMessages.length} message(s) forwarded successfully!`);
  };

  // Get online status text
  const getStatusText = () => {
    if (!conversation) return '';
    if (conversation.type === 'group') return `${conversation.memberCount} members`;
    if (conversation.type === 'self') return 'Message yourself';
    if (conversation.otherMemberId && isUserOnline?.(conversation.otherMemberId)) return 'Online';
    return conversation.description || 'Offline';
  };

  // Empty state
  if (!conversation) {
    return (
      <div className="chat-view empty" id="chat-view">
        <div className="chat-empty-state">
          <img src="/logo.png" alt="Aahat" className="empty-brand-logo" />
          <h3>Welcome to Aahat</h3>
          <p className="security-note">Private conversations protected by authenticated transport.</p>
          <span className="start-prompt">Select a conversation to start chatting</span>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-area-container" id="chat-view">
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
              <SafeAvatar
                src={conversation.avatarUrl}
                name={conversation.name}
                size={36}
                className="avatar-image header-avatar"
              />
              {conversation.type === 'direct' && (
                <div className={`status-badge ${conversation.otherMemberId && isUserOnline?.(conversation.otherMemberId) ? 'active' : 'offline'}`} />
              )}
            </div>
            <div className="chat-header-details">
              <h3>{conversation.name}</h3>
              {isTyping ? (
                <p className="typing-indicator">
                  <span className="typing-dots"><span /><span /><span /></span>
                  typing...
                </p>
              ) : (
                <p className="status-text">{getStatusText()}</p>
              )}
            </div>
          </div>

          <div className="chat-header-actions">
            {conversation.type === 'direct' && conversation.type !== 'self' && (
              <>
                <button className="btn-icon header-action-btn" onClick={() => onStartCall('voice')} title="Voice Call" id="btn-call-voice">
                  <Phone size={18} />
                </button>
                <button className="btn-icon header-action-btn" onClick={() => onStartCall('video')} title="Video Call" id="btn-call-video">
                  <Video size={18} />
                </button>
              </>
            )}

            <button
              className={`btn-icon header-action-btn ${showInChatSearch ? 'active' : ''}`}
              onClick={() => setShowInChatSearch(!showInChatSearch)}
              title="Search Messages"
              id="btn-search-chat"
            >
              <Search size={18} />
            </button>

            <button
              className={`btn-icon header-action-btn ${showGroupDetails ? 'active' : ''}`}
              onClick={() => setShowGroupDetails(!showGroupDetails)}
              title={conversation.type === 'group' ? 'Group Details' : 'Contact Info'}
              id="btn-info-chat"
            >
              <Info size={18} />
            </button>

            <div className="dropdown-trigger-wrapper">
              <button className="btn-icon header-action-btn" onClick={() => setShowMoreMenu(!showMoreMenu)} title="More Options" id="btn-more-chat">
                <MoreVertical size={18} />
              </button>
              {showMoreMenu && (
                <div className="chat-dropdown-menu" ref={moreMenuRef}>
                  <button onClick={() => { onToggleArchive?.(conversation.id); setShowMoreMenu(false); }}>{conversation.isArchived ? 'Unarchive Chat' : 'Archive Chat'}</button>
                  <button onClick={() => { onToggleMute?.(conversation.id); setShowMoreMenu(false); }}>{conversation.isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</button>
                  <button className="danger" onClick={() => { onClearChat?.(); setShowMoreMenu(false); }}>Clear Chat</button>
                  <button className="danger" onClick={() => { onDeleteChat?.(); setShowMoreMenu(false); }}>Delete Chat</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* In-chat search bar */}
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

        {selectedMessageIds.size > 0 && (
          <div className="message-selection-toolbar">
            <button type="button" onClick={() => setSelectedMessageIds(new Set())} title="Cancel selection"><X size={17}/></button>
            <strong>{selectedMessageIds.size} selected</strong>
            <div>
              <button type="button" onClick={() => setForwardingMessages(selectedMessages)} title="Forward selected"><Forward size={16}/><span>Forward</span></button>
              <button type="button" className="danger" onClick={deleteSelectedMessages} title="Delete selected"><Trash2 size={16}/><span>Delete</span></button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="messages-list" ref={messagesListRef} onScroll={handleScroll} id="messages-list">
          {visibleGroupedMessages.length === 0 ? (
            <div className="chat-start-hint">
              {chatSearchQuery ? (
                <p>No messages match your search criteria</p>
              ) : showLegacyGreeting ? (
                <p>Say hello to <strong>{conversation.name}</strong> {'\u{1F44B}'}</p>
              ) : (
                <p>Start your conversation with <strong>{conversation.name}</strong>.</p>
              )}
            </div>
          ) : (
            <>
              {(hasMoreMessages || hiddenMessageCount > 0) && (
                <button
                  type="button"
                  className="load-more-messages"
                  disabled={isLoadingMoreMessages}
                  onClick={() => {
                    if (hiddenMessageCount > 0) {
                      setVisibleMessageLimit(limit => Math.min(groupedMessages.length, limit + 160));
                    } else {
                      onLoadMoreMessages?.();
                    }
                  }}
                >
                  {isLoadingMoreMessages ? 'Loading…' : 'Load earlier messages'}
                </button>
              )}
              {visibleGroupedMessages.map(item => {
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
                  onDeleteForMe={onDeleteForMe}
                  onDeleteForEveryone={onDeleteForEveryone}
                  onStartEdit={message => { setReplyingToMessage(null); setShowReactionPicker(null); setEditingMessage(message); }}
                  onReply={() => { setEditingMessage(null); setShowReactionPicker(null); setReplyingToMessage(item.data); }}
                  isActionMenuOpen={openMessageMenuId === item.data.id}
                  onToggleActionMenu={setOpenMessageMenuId}
                  showSenderAvatar={conversation.type === 'group'}
                  onRetry={onRetryMessage}
                  selectionMode={selectedMessageIds.size > 0}
                  isSelected={selectedMessageIds.has(item.data.id)}
                  onToggleSelect={toggleMessageSelection}
                  onStartSelect={startMessageSelection}
                />
              );
            })}
            </>
          )}

          {/* Typing indicator */}
          {isTyping && (
            <div className="message-bubble-wrapper other typing-bubble">
              <div className="bubble-row">
                {conversation.type === 'group' && (
                  <div className="message-sender-avatar">
                    {conversation.name?.[0]?.toUpperCase() || 'C'}
                  </div>
                )}
                <div className="message-bubble">
                  <div className="typing-dots large"><span /><span /><span /></div>
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

        {/* Chat Input */}
        <ChatInput
          onSend={handleSend}
          onUploadFile={onUploadFile}
          replyTo={replyingToMessage}
          onCancelReply={() => setReplyingToMessage(null)}
          editingMessage={editingMessage}
          onCancelEdit={() => setEditingMessage(null)}
          onSetTyping={onSetTyping}
          conversationId={conversation.id}
        />
      </div>

      {/* Details Sidebar */}
      {showGroupDetails && (
        <div className="chat-details-sidebar" id="group-details-sidebar" ref={groupDetailsRef}>
          <div className="sidebar-details-header">
            <h3>{conversation.type === 'group' ? 'Group Details' : 'Contact Details'}</h3>
            <button className="btn-icon" onClick={() => setShowGroupDetails(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="sidebar-details-scroll">
            <div className="details-avatar-card">
              <SafeAvatar
                src={conversation.avatarUrl}
                name={conversation.name}
                size={80}
                className="details-avatar"
                style={{ margin: '0 auto 8px', fontSize: '24px' }}
              />
              <h3>{conversation.name}</h3>
              <p>{getStatusText()}</p>
            </div>

            <div className="details-block">
              <label>Description / Bio</label>
              <p>{conversation.description || 'No description provided.'}</p>
            </div>

            {conversation.type === 'group' && (
              <div className="details-block">
                <label className="flex-row-label">
                  <Users size={14} /> Group Members ({groupMembers.length || conversation.memberCount || 0})
                </label>

                {/* Add member input (admin only) */}
                {conversation.role === 'admin' && (
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newMemberAahatId.trim() || isAddingMember) return;
                      setIsAddingMember(true);
                      try {
                        const normalizedAahatId = newMemberAahatId.trim();
                        if (!/^\d{10}$/.test(normalizedAahatId)) {
                          alert('Enter a valid 10-digit Aahat ID.');
                          return;
                        }

                        const { data: matches, error } = await supabase
                          .rpc('search_profile_by_aahat_id', { p_aahat_id: normalizedAahatId });
                        const profileToQuery = Array.isArray(matches) ? matches[0] : null;
                        
                        if (error || !profileToQuery) {
                          alert(`No user found with Aahat ID: ${normalizedAahatId}`);
                        } else {
                          const isAlreadyMember = groupMembers.some(m => m.id === profileToQuery.id);
                          if (isAlreadyMember) {
                            alert('User is already a member of this group.');
                          } else {
                            await onAddGroupMember(conversation.id, profileToQuery.id, profileToQuery.display_name);
                            setNewMemberAahatId('');
                            await loadGroupMembers();
                          }
                        }
                      } catch (err) {
                        alert(err.message || 'Failed to add member.');
                      } finally {
                        setIsAddingMember(false);
                      }
                    }} 
                    style={{ display: 'flex', gap: '6px', margin: '8px 0 16px' }}
                  >
                    <input
                      type="text"
                      placeholder="Add member by Aahat ID..."
                      value={newMemberAahatId}
                      onChange={e => setNewMemberAahatId(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.03)', color: 'white' }}
                      required
                    />
                    <button 
                      type="submit" 
                      className="admin-btn admin-btn-primary" 
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', whiteSpace: 'nowrap' }}
                      disabled={isAddingMember}
                    >
                      {isAddingMember ? 'Adding...' : 'Add'}
                    </button>
                  </form>
                )}

                {/* Members list */}
                {isFetchingMembers ? (
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Loading members...</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {groupMembers.map(member => {
                      const isMemberOnline = isUserOnline?.(member.id);
                      return (
                        <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <SafeAvatar src={member.avatar_url} name={member.display_name} size={28} />
                              <div className={`status-badge ${isMemberOnline ? 'active' : 'offline'}`} style={{ width: '8px', height: '8px', border: '1.5px solid #0f172a', bottom: '-1px', right: '-1px' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '12px', fontWeight: '600', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {member.display_name} {member.id === currentUserId && '(You)'}
                              </span>
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                                {member.role === 'admin' ? '\u{1F451} Admin' : 'Member'}
                              </span>
                            </div>
                          </div>

                          {/* Member actions (admin only, and cannot remove self) */}
                          {conversation.role === 'admin' && member.id !== currentUserId && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button 
                                onClick={async () => {
                                  const newRole = member.role === 'admin' ? 'member' : 'admin';
                                  await onUpdateGroupMemberRole(conversation.id, member.id, newRole);
                                  await loadGroupMembers();
                                }}
                                style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: '10px', cursor: 'pointer', padding: '4px' }}
                                title={member.role === 'admin' ? 'Dismiss as Admin' : 'Make Admin'}
                              >
                                {member.role === 'admin' ? 'Demote' : 'Promote'}
                              </button>
                              <button 
                                onClick={async () => {
                                  if (confirm(`Remove ${member.display_name} from group?`)) {
                                    await onRemoveGroupMember(conversation.id, member.id, member.display_name);
                                    await loadGroupMembers();
                                  }
                                }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '10px', cursor: 'pointer', padding: '4px' }}
                                title="Remove"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Leave Group Button */}
                <button
                  onClick={async () => {
                    if (confirm('Are you sure you want to leave this group?')) {
                      await onLeaveGroup(conversation.id);
                      setShowGroupDetails(false);
                    }
                  }}
                  className="admin-btn danger"
                  style={{ width: '100%', marginTop: '20px', padding: '8px', fontSize: '12px', borderRadius: '8px' }}
                >
                  Leave Group
                </button>
              </div>
            )}

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
                      <img src={m.attachment_url} alt="Shared Attachment" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {forwardingMessages.length > 0 && (
        <div className="modal-overlay" onClick={() => setForwardingMessages([])}>
          <div className="modal-card forwarding-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Forward {forwardingMessages.length} Message(s)</h3>
              <button className="modal-close" onClick={() => setForwardingMessages([])}>
                <X size={18} />
              </button>
            </div>
            <div className="forwarding-preview">
              <span className="label">Selected Messages</span>
              <p>{forwardingMessages.map(message => message.content || '[Attachment]').join(' · ')}</p>
            </div>
            <div className="forward-list">
              <span className="label">Select Target Conversation</span>
              <div className="forward-contacts-scroll">
                {(conversations || [])
                  .filter(c => c.id !== conversation.id)
                  .map(conv => (
                    <div key={conv.id} className="forward-contact-row">
                      <div className="contact-details">
                        <SafeAvatar src={conv.avatarUrl} name={conv.name} size={24} className="contact-avatar-sm" />
                        <span>{conv.name}</span>
                      </div>
                      <button className="btn-forward-send" onClick={() => handleForwardToContact(conv.id)}>Send</button>
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
