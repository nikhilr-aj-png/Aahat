import { useEffect, useMemo, useState } from 'react';
import { 
  Search, RefreshCw, MessageSquare,
  Pin, VolumeX, Star, Archive, Users, Download
} from 'lucide-react';
import SafeAvatar from './SafeAvatar';

/**
 * Sidebar â€” Chat conversations list with search, filters, and quick actions.
 * Updated for V2 normalized conversation model.
 */
export default function Sidebar({
  conversations,
  selectedConversationId,
  onSelectConversation,
  isMobileOpen,
  toggleArchive, togglePin, toggleMute, toggleFavorite,
  onNewChat,
  isUserOnline, canViewOnlineStatus, isLoading
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  // Filter conversations based on search and category
  const filteredConversations = useMemo(() => {
    return conversations.filter(c => {
      // Self-chat: always show at top but don't filter out
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (c.previewText && c.previewText.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;

      switch (filterCategory) {
        case 'unread':
          return c.unreadCount > 0;
        case 'groups':
          return c.type === 'group' && !c.isArchived;
        case 'archived':
          return c.isArchived;
        case 'favorites':
          return c.isFavorite;
        default:
          return !c.isArchived;
      }
    });
  }, [conversations, searchQuery, filterCategory]);

  // Separate pinned and unpinned for display
  const pinnedConversations = useMemo(
    () => filteredConversations.filter(c => c.isPinned),
    [filteredConversations]
  );
  const unpinnedConversations = useMemo(
    () => filteredConversations.filter(c => !c.isPinned),
    [filteredConversations]
  );

  const unreadTotal = conversations.filter(c => c.type !== 'self' && c.unreadCount > 0).length;

  // Quick context actions
  const [contextMenuId, setContextMenuId] = useState(null);

  const handleContextMenu = (e, convId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuId(contextMenuId === convId ? null : convId);
  };


  const renderConversationItem = (conv) => {
    const isSelected = conv.id === selectedConversationId;
    const isOnline = conv.type === 'direct' && conv.otherMemberId && isUserOnline?.(conv.otherMemberId);
    const onlineStatusVisible = conv.type === 'direct' && conv.otherMemberId && canViewOnlineStatus?.(conv.otherMemberId);
    const isSelf = conv.type === 'self';

    return (
      <div
        key={conv.id}
        className={`chat-item ${isSelected ? 'selected' : ''} ${conv.isPinned ? 'pinned' : ''}`}
        onClick={() => onSelectConversation(conv.id)}
        onContextMenu={(e) => handleContextMenu(e, conv.id)}
        id={`chat-item-${conv.id}`}
      >
        <div className="avatar-wrapper">
          <SafeAvatar
            src={conv.avatarUrl}
            name={conv.name}
            size={44}
            className="avatar-image"
          />
          {!isSelf && conv.type !== 'group' && onlineStatusVisible && (
            <div className={`status-badge ${isOnline ? 'active' : 'offline'}`} />
          )}
          {conv.type === 'group' && (
            <div className="status-badge group-badge" style={{ background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '14px', height: '14px', fontSize: '8px' }}>
              <Users size={8} color="white" />
            </div>
          )}
        </div>

        <div className="chat-item-details">
          <div className="chat-item-header">
            <span className="chat-item-name">
              {conv.name}
              {conv.isPinned && <Pin size={10} style={{ marginLeft: '4px', opacity: 0.4 }} />}
              {conv.isMuted && <VolumeX size={10} style={{ marginLeft: '4px', opacity: 0.4 }} />}
            </span>
            <span className="chat-item-time">{conv.previewTime}</span>
          </div>
          <div className="chat-item-sub">
            <span className={`chat-item-message ${conv.unreadCount > 0 ? 'unread' : ''}`}>
              {conv.previewText || (isSelf ? 'Message yourself' : 'No messages yet')}
            </span>
            {conv.unreadCount > 0 && (
              <span className="unread-badge" />
            )}
          </div>
        </div>

        {/* Context Menu */}
        {contextMenuId === conv.id && (
          <div 
            className="chat-context-menu" 
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)',
              border: '1px solid var(--panel-border)', borderRadius: '8px',
              padding: '4px', display: 'flex', gap: '2px', zIndex: 20,
              boxShadow: 'var(--shadow-md)'
            }}
          >
            <button 
              className="btn-icon" title={conv.isPinned ? 'Unpin' : 'Pin'}
              onClick={() => { togglePin(conv.id); setContextMenuId(null); }}
            >
              <Pin size={14} />
            </button>
            <button 
              className="btn-icon" title={conv.isMuted ? 'Unmute' : 'Mute'}
              onClick={() => { toggleMute(conv.id); setContextMenuId(null); }}
            >
              <VolumeX size={14} />
            </button>
            <button 
              className="btn-icon" title={conv.isFavorite ? 'Unfavorite' : 'Favorite'}
              onClick={() => { toggleFavorite(conv.id); setContextMenuId(null); }}
            >
              <Star size={14} />
            </button>
            <button 
              className="btn-icon" title={conv.isArchived ? 'Unarchive' : 'Archive'}
              onClick={() => { toggleArchive(conv.id); setContextMenuId(null); }}
            >
              <Archive size={14} />
            </button>
          </div>
        )}
      </div>
    );
  };

  // Close context menu when clicking outside
  useEffect(() => {
    if (contextMenuId) {
      const handleClick = () => setContextMenuId(null);
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenuId]);

  return (
    <div className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`} id="sidebar">
      <div className="sidebar-inner">
        {/* Header */}
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-left">
              <img src="/logo.png" alt="Aahat" className="sidebar-logo" />
              <span className="brand-text">Aahat <span className="brand-hindi">{'\u0906\u0939\u091F'}</span></span>
            </div>
            <a href="/aahat.apk" download className="app-download-button" aria-label="Download Aahat APK">
              <Download size={12} />
              <span>App</span>
            </a>
          </div>


          {/* Search */}
          <div className="search-bar">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="search-input"
            />
          </div>
        </div>

        {/* Filter Chips */}
        <div className="filter-chips" style={{ display: 'flex', gap: '6px', padding: '8px 20px', overflowX: 'auto', scrollbarWidth: 'none' }}>
          {[
            { key: 'all', label: 'All' },
            { key: 'unread', label: `Unread${unreadTotal > 0 ? ` (${unreadTotal})` : ''}` },
            { key: 'groups', label: 'Groups' },
            { key: 'favorites', label: 'Favorites' },
            { key: 'archived', label: 'Archived' }
          ].map(f => (
            <button
              key={f.key}
              className={`filter-chip ${filterCategory === f.key ? 'active' : ''}`}
              onClick={() => setFilterCategory(f.key)}
              style={{
                padding: '4px 12px', borderRadius: '16px', fontSize: '11px', fontWeight: '600',
                border: '1px solid var(--panel-border)', cursor: 'pointer', whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                background: filterCategory === f.key ? 'var(--accent-gradient)' : 'var(--glass-subtle)',
                color: filterCategory === f.key ? 'white' : 'var(--text-secondary)'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="chat-list-section" id="chat-list">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <RefreshCw size={20} className="spin" style={{ animation: 'spin 1s linear infinite', marginBottom: '8px' }} />
              <p style={{ fontSize: '12px' }}>Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
              <MessageSquare size={24} style={{ opacity: 0.4, marginBottom: '8px' }} />
              <p style={{ fontSize: '12px' }}>
                {searchQuery ? 'No conversations match your search' : 'No conversations yet'}
              </p>
              {!searchQuery && (
                <button
                  onClick={onNewChat}
                  style={{ marginTop: '12px', padding: '6px 16px', fontSize: '12px', borderRadius: '8px', background: 'var(--accent-gradient)', border: 'none', color: 'white', cursor: 'pointer' }}
                >
                  Start a Chat
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Pinned */}
              {pinnedConversations.length > 0 && (
                <>
                  <div className="section-label">
                    <Pin size={10} /> Pinned
                  </div>
                  {pinnedConversations.map(renderConversationItem)}
                </>
              )}

              {/* Recent */}
              {unpinnedConversations.length > 0 && (
                <>
                  {pinnedConversations.length > 0 && (
                    <div className="section-label">Recent</div>
                  )}
                  {unpinnedConversations.map(renderConversationItem)}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
