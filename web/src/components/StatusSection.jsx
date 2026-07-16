import React, { useState, useRef, useMemo } from 'react';
import { Plus, Eye, X, ChevronLeft, ChevronRight, Image, Trash2, Clock, Users } from 'lucide-react';
import SafeAvatar from './SafeAvatar';

const GRADIENT_OPTIONS = [
  'linear-gradient(135deg, #5F34F7 0%, #8659F1 100%)',
  'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)',
  'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
  'linear-gradient(135deg, #10B981 0%, #3B82F6 100%)',
  'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
  'linear-gradient(135deg, #8659F1 0%, #10B981 100%)',
];

/**
 * StatusSection â€” Manages stories (V2).
 * Uses separate statuses/status_views tables with 24-hour expiry.
 */
export default function StatusSection({
  myStatuses, otherStatuses,
  user, profile,
  onPostStatus, onViewStatus, onDeleteStatus,
  onUploadFile,
  channels = [], myChannels = [], activeChannelId, activeChannelPosts = [],
  setActiveChannelId, onCreateChannel, onSubscribeToChannel, onUnsubscribeFromChannel, onCreateChannelPost
}) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [selectedGradient, setSelectedGradient] = useState(GRADIENT_OPTIONS[0]);
  const [isCreating, setIsCreating] = useState(false);

  // Channel States
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [showChannelPostsModal, setShowChannelPostsModal] = useState(false);
  const [newChannelPostText, setNewChannelPostText] = useState('');
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [isCreatingPost, setIsCreatingPost] = useState(false);

  const discoverChannels = useMemo(() => {
    return channels.filter(c => !myChannels.some(my => my.id === c.id));
  }, [channels, myChannels]);

  const activeChannel = useMemo(() => {
    return channels.find(c => c.id === activeChannelId) || myChannels.find(c => c.id === activeChannelId);
  }, [channels, myChannels, activeChannelId]);

  const openChannelViewer = (channelId) => {
    setActiveChannelId(channelId);
    setShowChannelPostsModal(true);
  };

  // Status viewer state
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingIndex, setViewingIndex] = useState(0);
  const [viewTimerProgress, setViewTimerProgress] = useState(0);
  const timerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Post text status
  const handlePostText = async () => {
    if (!textContent.trim()) return;
    setIsCreating(true);
    try {
      await onPostStatus('text', textContent.trim(), selectedGradient);
      setTextContent('');
      setShowCreateModal(false);
    } catch (err) {
      alert('Failed to post status: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Post image/video status
  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCreating(true);
    try {
      const url = await onUploadFile(file);
      const type = file.type.startsWith('video/') ? 'video' : 'image';
      await onPostStatus(type, url);
      setShowCreateModal(false);
    } catch (err) {
      alert('Failed to upload: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // View status
  const openStatusViewer = (userGroup) => {
    setViewingUser(userGroup);
    setViewingIndex(0);
    setViewTimerProgress(0);
  };

  // Auto-advance in viewer
  const startViewTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setViewTimerProgress(0);

    timerRef.current = setInterval(() => {
      setViewTimerProgress(prev => {
        if (prev >= 100) {
          // Move to next status or close
          setViewingIndex(idx => {
            const maxIdx = viewingUser?.statuses?.length - 1;
            if (idx >= maxIdx) {
              closeViewer();
              return idx;
            }
            setViewTimerProgress(0);
            return idx + 1;
          });
          return 0;
        }
        return prev + 2;
      });
    }, 100);
  };

  React.useEffect(() => {
    if (viewingUser) {
      startViewTimer();
      // Mark as viewed
      const status = viewingUser.statuses?.[viewingIndex];
      if (status) onViewStatus(status.id);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [viewingUser, viewingIndex]);

  const closeViewer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setViewingUser(null);
    setViewingIndex(0);
    setViewTimerProgress(0);
  };

  const goNextStatus = () => {
    if (!viewingUser) return;
    const maxIdx = viewingUser.statuses.length - 1;
    if (viewingIndex >= maxIdx) {
      closeViewer();
    } else {
      setViewingIndex(prev => prev + 1);
      setViewTimerProgress(0);
    }
  };

  const goPrevStatus = () => {
    if (viewingIndex > 0) {
      setViewingIndex(prev => prev - 1);
      setViewTimerProgress(0);
    }
  };

  // Time ago helper
  const timeAgo = (dateStr) => {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="status-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-gradient)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--panel-border)' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Clock size={20} style={{ color: 'var(--accent-light)' }} />
          Stories
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>Status updates disappear after 24 hours</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {/* My Status */}
        <div style={{ marginBottom: '24px' }}>
          <div className="section-label" style={{ padding: '0 0 8px' }}>My Status</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', background: 'rgba(30,41,59,0.3)', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
            <div style={{ position: 'relative' }}>
              <SafeAvatar
                src={profile?.avatar_url}
                name={profile?.display_name || 'Me'}
                size={52}
                style={{ borderRadius: '50%', border: myStatuses.length > 0 ? '3px solid var(--accent)' : '3px solid var(--panel-border)' }}
              />
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  position: 'absolute', bottom: '-4px', right: '-4px', width: '22px', height: '22px',
                  borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--panel-bg-solid)',
                  color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <Plus size={12} />
              </button>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>My Status</h4>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                {myStatuses.length > 0 ? `${myStatuses.length} update(s) Â· ${timeAgo(myStatuses[0].created_at)}` : 'Tap to add a status update'}
              </p>
            </div>
            {myStatuses.length > 0 && (
              <button
                onClick={() => openStatusViewer({ userId: user.id, userName: 'My Status', userAvatar: profile?.avatar_url, statuses: myStatuses })}
                style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <Eye size={12} /> View
              </button>
            )}
          </div>
        </div>

        {/* Others' Statuses */}
        {otherStatuses.length > 0 && (
          <div>
            <div className="section-label" style={{ padding: '0 0 8px' }}>Recent Updates</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {otherStatuses.map(userGroup => (
                <div
                  key={userGroup.userId}
                  onClick={() => openStatusViewer(userGroup)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '14px', padding: '12px',
                    background: 'rgba(30,41,59,0.2)', borderRadius: '10px', cursor: 'pointer',
                    transition: 'background 0.15s', border: '1px solid transparent'
                  }}
                  className="contact-card-hover"
                >
                  <SafeAvatar
                    src={userGroup.userAvatar}
                    name={userGroup.userName}
                    size={48}
                    style={{ borderRadius: '50%', border: '3px solid var(--accent-light)' }}
                  />
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0 }}>{userGroup.userName}</h4>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                      {userGroup.statuses.length} update(s) Â· {timeAgo(userGroup.statuses[0].created_at)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {otherStatuses.length === 0 && myStatuses.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <Clock size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ fontSize: '13px' }}>No status updates yet.</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>Share what's on your mind!</p>
          </div>
        )}

        {/* CHANNELS SECTION */}
        <div style={{ marginTop: '32px', borderTop: '1px solid var(--panel-border)', paddingTop: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} style={{ color: 'var(--accent-light)' }} />
              Channels
            </h3>
            <button
              onClick={() => setShowCreateChannelModal(true)}
              className="admin-btn admin-btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontSize: '12px' }}
            >
              <Plus size={14} /> Create Channel
            </button>
          </div>

          {/* My Channels */}
          <div style={{ marginBottom: '24px' }}>
            <div className="section-label" style={{ padding: '0 0 8px' }}>Channels you follow</div>
            {myChannels.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>You don't follow any channels yet. Discover some below!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {myChannels.map(channel => (
                  <div
                    key={channel.id}
                    onClick={() => openChannelViewer(channel.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', padding: '12px',
                      background: 'rgba(30,41,59,0.2)', borderRadius: '10px', cursor: 'pointer',
                      transition: 'background 0.15s', border: '1px solid transparent'
                    }}
                    className="contact-card-hover"
                  >
                    <SafeAvatar
                      src={channel.avatar_url}
                      name={channel.name}
                      size={44}
                      style={{ borderRadius: '50%' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {channel.description || 'No description.'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{channel.subscriber_count} followers</span>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Unfollow ${channel.name}?`)) {
                            await onUnsubscribeFromChannel(channel.id);
                          }
                        }}
                        style={{ padding: '4px 8px', fontSize: '10px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '6px', cursor: 'pointer' }}
                      >
                        Unfollow
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discover Channels */}
          <div>
            <div className="section-label" style={{ padding: '0 0 8px' }}>Discover Channels</div>
            {discoverChannels.length === 0 ? (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0 }}>No other channels available right now.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {discoverChannels.map(channel => (
                  <div
                    key={channel.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', padding: '12px',
                      background: 'rgba(30,41,59,0.15)', borderRadius: '10px', border: '1px solid var(--panel-border)'
                    }}
                  >
                    <SafeAvatar
                      src={channel.avatar_url}
                      name={channel.name}
                      size={44}
                      style={{ borderRadius: '50%' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '2px 0 0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {channel.description || 'No description.'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{channel.subscriber_count} followers</span>
                      <button
                        onClick={() => onSubscribeToChannel(channel.id)}
                        className="admin-btn admin-btn-primary"
                        style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px' }}
                      >
                        Follow
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Channel Modal */}
      {showCreateChannelModal && (
        <div className="modal-overlay" onClick={() => setShowCreateChannelModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3>Create Channel</h3>
              <button className="modal-close" onClick={() => setShowCreateChannelModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newChannelName.trim() || isCreatingChannel) return;
              setIsCreatingChannel(true);
              try {
                await onCreateChannel(newChannelName.trim(), newChannelDesc.trim());
                setNewChannelName('');
                setNewChannelDesc('');
                setShowCreateChannelModal(false);
              } catch (err) {
                alert('Failed to create channel: ' + err.message);
              } finally {
                setIsCreatingChannel(false);
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Channel Name</label>
                <input
                  type="text"
                  placeholder="Enter channel name..."
                  value={newChannelName}
                  onChange={e => setNewChannelName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Description</label>
                <input
                  type="text"
                  placeholder="Describe your channel..."
                  value={newChannelDesc}
                  onChange={e => setNewChannelDesc(e.target.value)}
                />
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowCreateChannelModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={isCreatingChannel}>
                  {isCreatingChannel ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Channel Posts Viewer Modal */}
      {showChannelPostsModal && activeChannel && (
        <div className="modal-overlay" style={{ zIndex: 1999 }} onClick={() => { setShowChannelPostsModal(false); setActiveChannelId(null); }}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', height: '80vh', display: 'flex', flexDirection: 'column', padding: 0 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', borderBottom: '1px solid var(--panel-border)' }}>
              <SafeAvatar src={activeChannel.avatar_url} name={activeChannel.name} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeChannel.name}</h3>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{activeChannel.subscriber_count} followers Â· {activeChannel.description || 'No description.'}</span>
              </div>
              <button className="modal-close" onClick={() => { setShowChannelPostsModal(false); setActiveChannelId(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {/* Posts Scroll list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.1)' }}>
              {activeChannelPosts.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '40px' }}>
                  <Users size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p>No updates published yet in this channel.</p>
                </div>
              ) : (
                activeChannelPosts.map(post => (
                  <div 
                    key={post.id} 
                    style={{ 
                      alignSelf: 'flex-start', 
                      background: 'rgba(30, 41, 59, 0.7)', 
                      backdropFilter: 'blur(8px)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '12px', 
                      padding: '12px', 
                      maxWidth: '85%',
                      boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent-light)' }}>ðŸ“¢ {activeChannel.name}</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: 'white', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{post.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Post input (Admins only) */}
            {activeChannel.created_by === user.id && (
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newChannelPostText.trim() || isCreatingPost) return;
                  setIsCreatingPost(true);
                  try {
                    await onCreateChannelPost(activeChannel.id, newChannelPostText.trim());
                    setNewChannelPostText('');
                  } catch (err) {
                    alert('Failed to publish post: ' + err.message);
                  } finally {
                    setIsCreatingPost(false);
                  }
                }} 
                style={{ padding: '16px', borderTop: '1px solid var(--panel-border)', display: 'flex', gap: '8px' }}
              >
                <input
                  type="text"
                  placeholder="Broadcast an update to followers..."
                  value={newChannelPostText}
                  onChange={e => setNewChannelPostText(e.target.value)}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--panel-border)', background: 'rgba(255,255,255,0.03)', color: 'white' }}
                  required
                />
                <button 
                  type="submit" 
                  className="admin-btn admin-btn-primary" 
                  style={{ padding: '8px 16px', borderRadius: '8px' }}
                  disabled={isCreatingPost}
                >
                  {isCreatingPost ? 'Publishing...' : 'Send'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Status Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3>Create Status</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}><X size={18} /></button>
            </div>

            {/* Type tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {['text', 'media'].map(t => (
                <button
                  key={t}
                  onClick={() => setCreateType(t)}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '8px', fontSize: '12px', fontWeight: '600',
                    border: '1px solid var(--panel-border)', cursor: 'pointer',
                    background: createType === t ? 'var(--accent-gradient)' : 'var(--glass-subtle)',
                    color: createType === t ? 'white' : 'var(--text-secondary)'
                  }}
                >
                  {t === 'text' ? 'âœï¸ Text' : 'ðŸ“· Photo/Video'}
                </button>
              ))}
            </div>

            {createType === 'text' ? (
              <div>
                {/* Preview */}
                <div style={{
                  background: selectedGradient, borderRadius: '12px', padding: '40px 20px',
                  minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <textarea
                    placeholder="Type your status..."
                    value={textContent}
                    onChange={e => setTextContent(e.target.value)}
                    style={{
                      background: 'transparent', border: 'none', outline: 'none', color: 'white',
                      fontSize: '18px', fontWeight: '600', textAlign: 'center', width: '100%',
                      resize: 'none', minHeight: '60px', fontFamily: 'inherit'
                    }}
                  />
                </div>
                {/* Gradient picker */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', justifyContent: 'center' }}>
                  {GRADIENT_OPTIONS.map((g, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedGradient(g)}
                      style={{
                        width: '32px', height: '32px', borderRadius: '50%', background: g,
                        border: selectedGradient === g ? '3px solid white' : '2px solid transparent',
                        cursor: 'pointer', transition: 'transform 0.15s'
                      }}
                    />
                  ))}
                </div>
                <button
                  onClick={handlePostText}
                  disabled={!textContent.trim() || isCreating}
                  className="btn-primary"
                >
                  {isCreating ? 'Posting...' : 'Post Status'}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <input
                  type="file"
                  accept="image/*,video/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleMediaUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCreating}
                  style={{
                    padding: '40px', borderRadius: '12px', border: '2px dashed var(--panel-border)',
                    background: 'var(--glass-subtle)', color: 'var(--text-secondary)', cursor: 'pointer',
                    width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px'
                  }}
                >
                  <Image size={32} style={{ opacity: 0.5 }} />
                  <span style={{ fontSize: '13px' }}>{isCreating ? 'Uploading...' : 'Select Photo or Video'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Status Viewer */}
      {viewingUser && viewingUser.statuses?.[viewingIndex] && (
        <div className="modal-overlay" style={{ zIndex: 2000, background: 'rgba(0,0,0,0.95)' }} onClick={closeViewer}>
          <div
            style={{ width: '100%', maxWidth: '420px', height: '90vh', position: 'relative', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Progress bars */}
            <div style={{ display: 'flex', gap: '4px', padding: '12px 16px 8px' }}>
              {viewingUser.statuses.map((_, i) => (
                <div key={i} style={{ flex: 1, height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <div style={{
                    width: i < viewingIndex ? '100%' : i === viewingIndex ? `${viewTimerProgress}%` : '0%',
                    height: '100%', background: 'white', borderRadius: '2px',
                    transition: i === viewingIndex ? 'width 0.1s linear' : 'none'
                  }} />
                </div>
              ))}
            </div>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px' }}>
              <SafeAvatar src={viewingUser.userAvatar} name={viewingUser.userName} size={36} style={{ borderRadius: '50%' }} />
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600', color: 'white', margin: 0 }}>{viewingUser.userName}</h4>
                <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                  {timeAgo(viewingUser.statuses[viewingIndex].created_at)}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {viewingUser.userId === user?.id && (
                  <button
                    onClick={() => { onDeleteStatus(viewingUser.statuses[viewingIndex].id); closeViewer(); }}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button onClick={closeViewer} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {(() => {
                const status = viewingUser.statuses[viewingIndex];
                if (status.type === 'text') {
                  return (
                    <div style={{
                      background: status.bg_gradient || GRADIENT_OPTIONS[0],
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '32px', borderRadius: '12px'
                    }}>
                      <p style={{ fontSize: '22px', fontWeight: '700', color: 'white', textAlign: 'center', lineHeight: 1.4 }}>
                        {status.content}
                      </p>
                    </div>
                  );
                }
                if (status.type === 'image') {
                  return <img src={status.media_url} alt="Status" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '12px' }} />;
                }
                if (status.type === 'video') {
                  return <video src={status.media_url} controls autoPlay muted style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '12px' }} />;
                }
                return null;
              })()}

              {/* Nav arrows */}
              {viewingIndex > 0 && (
                <button onClick={goPrevStatus} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronLeft size={18} />
                </button>
              )}
              {viewingIndex < viewingUser.statuses.length - 1 && (
                <button onClick={goNextStatus} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ChevronRight size={18} />
                </button>
              )}
            </div>

            {/* View count (for own statuses) */}
            {viewingUser.userId === user?.id && (
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '12px' }}>
                <Eye size={14} />
                {viewingUser.statuses[viewingIndex].view_count || 0} views
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


