import React, { useMemo, useState } from 'react';
import { 
  Search, LogOut, RefreshCw, MessageSquare, Settings, 
  Pin, VolumeX, Star, Archive, Shield, Plus, CircleDot 
} from 'lucide-react';

/**
 * Sidebar — Contains Aahat Sound-wave logo, settings/actions, search bar,
 * quick filters, horizontal active user strip, and chat list.
 * Includes a premium navigation dock on the left side.
 */
export default function Sidebar({
  user, contacts, selectedContactId,
  onSelectContact, onLogout, onResetDb,
  isMobileOpen, onCloseMobile,
  activeTab, setActiveTab,
  toggleArchive, togglePin, toggleMute, toggleFavorite,
  onNewChat
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all'); // all, unread, groups, archived, favorites

  const meContact = useMemo(() => contacts.find(c => c.id === 'me'), [contacts]);

  // Filter contacts based on search query and category filters
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      // Exclude self account ('me') completely from sidebar conversations list
      if (c.id === 'me') {
        return false;
      }
      // Exclude self account duplicates from conversation list
      if (user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === user.email?.split('@')[0])) {
        return false;
      }

      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.recentMessageText && c.recentMessageText.toLowerCase().includes(searchQuery.toLowerCase()));
      
      if (!matchesSearch) return false;

      switch (filterCategory) {
        case 'unread':
          return c.recentMessageIsUnread || (c.unreadCount && c.unreadCount > 0);
        case 'groups':
          return c.isGroup && !c.isArchived;
        case 'archived':
          return c.isArchived;
        case 'favorites':
          return c.isFavorite && !c.isArchived;
        case 'all':
        default:
          return !c.isArchived && c.isRecent;
      }
    });
  }, [contacts, searchQuery, filterCategory, user]);

  const unreadTotal = useMemo(() =>
    contacts.filter(c => {
      // Exclude self ('me') and duplicates from unread totals
      if (c.id === 'me') {
        return false;
      }
      if (user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === user.email?.split('@')[0])) {
        return false;
      }
      return c.recentMessageIsUnread || (c.unreadCount > 0);
    }).length,
    [contacts, user]
  );

  const handleSelect = (id) => {
    onSelectContact(id);
    if (window.innerWidth <= 768) onCloseMobile?.();
  };

  return (
    <div className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`} id="sidebar">
      {/* Main Sidebar Panels */}
      <div className="sidebar-inner">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <h2 className="brand-text">Aahat <span className="brand-hindi">आहट</span></h2>
            <button className="btn-icon add-chat-btn" title="New Chat" onClick={onNewChat} id="btn-new-chat">
              <Plus size={16} />
            </button>
          </div>

          {/* User profile card */}
          <div 
            className="profile-card" 
            onClick={() => handleSelect('me')} 
            title="Message Yourself" 
            style={{ cursor: 'pointer' }}
          >
            <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div className="avatar-wrapper" style={{ position: 'relative', width: '36px', height: '36px' }}>
                {meContact && meContact.avatarUrl ? (
                  <img src={meContact.avatarUrl} alt={user.name} className="avatar-image" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '14px', borderRadius: '50%', background: 'var(--accent-gradient)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {user.name[0].toUpperCase()}
                  </div>
                )}
                <div className="status-badge active" style={{ position: 'absolute', bottom: '0', right: '0', width: '10px', height: '10px', backgroundColor: 'var(--accent-light)', border: '2px solid var(--panel-bg)', borderRadius: '50%' }} />
              </div>
              <div className="user-details" style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>{user.name} <span className="profile-you-badge" style={{ fontSize: '10px', color: 'var(--accent-light)', opacity: 0.8 }}>(You)</span></h4>
                <p className="online-status" style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)' }}>Message yourself</p>
              </div>
            </div>
            <div className="profile-actions" onClick={e => e.stopPropagation()}>
              <button 
                className="btn-icon" 
                title="Reset DB Data" 
                onClick={(e) => {
                  e.stopPropagation();
                  onResetDb();
                }} 
                id="btn-reset"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="search-bar" id="search-bar">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search chats, groups, messages..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="search-input"
            />
          </div>

          {/* Quick Filters */}
          <div className="quick-filters-row">
            {[
              { id: 'all', label: 'All' },
              { id: 'unread', label: 'Unread' },
              { id: 'groups', label: 'Groups' },
              { id: 'favorites', label: 'Favorites' },
              { id: 'archived', label: 'Archived' }
            ].map(cat => (
              <button
                key={cat.id}
                className={`filter-chip ${filterCategory === cat.id ? 'active' : ''}`}
                onClick={() => setFilterCategory(cat.id)}
                id={`filter-chip-${cat.id}`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chat List */}
        <div className="chat-list-section">
          {activeTab === 'chats' && (
            <>
              <div className="section-label">
                Conversations
                {unreadTotal > 0 && <span className="unread-total">{unreadTotal}</span>}
              </div>

              {filteredContacts.length === 0 ? (
                <div className="empty-state-small">
                  <MessageSquare size={20} />
                  <p>No conversations found</p>
                </div>
              ) : (
                filteredContacts
                  .sort((a, b) => {
                    // Pinned chats go to top
                    if (a.isPinned && !b.isPinned) return -1;
                    if (!a.isPinned && b.isPinned) return 1;
                    return 0;
                  })
                  .map(chat => (
                    <div
                      key={chat.id}
                      className={`chat-item ${selectedContactId === chat.id ? 'selected' : ''}`}
                      onClick={() => handleSelect(chat.id)}
                      id={`chat-item-${chat.id}`}
                    >
                      <div className="avatar-wrapper">
                        {chat.avatarUrl ? (
                          <img src={chat.avatarUrl} alt={chat.name} className="avatar-image" loading="lazy" />
                        ) : (
                          <div className="avatar-image" style={{
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
                            {chat.name[0].toUpperCase()}
                          </div>
                        )}
                        {!chat.isGroup && (
                          <div className={`status-badge ${chat.isActive ? 'active' : 'offline'}`} />
                        )}
                      </div>
                      
                      <div className="chat-item-details">
                        <div className="chat-item-header">
                          <span className="chat-item-name">{chat.name}</span>
                          <span className="chat-item-time">{chat.recentMessageTime}</span>
                        </div>
                        <div className="chat-item-sub">
                          <span className={`chat-item-message ${chat.recentMessageIsUnread ? 'unread' : ''}`}>
                            {chat.recentMessageText || "No messages yet"}
                          </span>

                          {/* Chat Status Flags (Pin, Mute, Favorite) */}
                          <div className="chat-badges-panel">
                            {chat.isPinned && <Pin size={10} className="badge-icon pinned" />}
                            {chat.isMuted && <VolumeX size={10} className="badge-icon muted" />}
                            {chat.isFavorite && <Star size={10} className="badge-icon favorite" />}
                            
                            {/* Unread count badge */}
                            {(chat.recentMessageIsUnread || chat.unreadCount > 0) && (
                              <span className="chat-unread-count-badge">
                                {chat.unreadCount || 1}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Quick Hover Control Panel */}
                      <div className="chat-hover-controls" onClick={e => e.stopPropagation()}>
                        <button 
                          className={`hover-control-btn ${chat.isPinned ? 'active' : ''}`}
                          onClick={() => togglePin(chat.id)}
                          title="Pin Chat"
                        >
                          <Pin size={11} />
                        </button>
                        <button 
                          className={`hover-control-btn ${chat.isMuted ? 'active' : ''}`}
                          onClick={() => toggleMute(chat.id)}
                          title="Mute Chat"
                        >
                          <VolumeX size={11} />
                        </button>
                        <button 
                          className={`hover-control-btn ${chat.isFavorite ? 'active' : ''}`}
                          onClick={() => toggleFavorite(chat.id)}
                          title="Favorite Chat"
                        >
                          <Star size={11} />
                        </button>
                        <button 
                          className={`hover-control-btn ${chat.isArchived ? 'active' : ''}`}
                          onClick={() => toggleArchive(chat.id)}
                          title={chat.isArchived ? "Unarchive" : "Archive"}
                        >
                          <Archive size={11} />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
