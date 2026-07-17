import { memo, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smile, Trash2, Check, CheckCheck, Reply, Play, Pause, FileText, Edit3, ChevronDown, ChevronLeft, ListChecks, RefreshCw, Download, Film } from 'lucide-react';

const formatBytes = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const SAFE_REACTION_EMOJIS = [
  '\u{1F44D}', '\u{2764}\u{FE0F}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}'
];
/**
 * MessageBubble â€” Renders a single message (V2).
 * Supports text, images, voice notes, PDFs, reactions, reply preview,
 * edit, delete for me/everyone, pin, and star.
 */
function MessageBubble({ 
  msg, 
  showReactionPicker, 
  onToggleReactionPicker, 
  onAddReaction, 
  onDeleteForMe,
  onDeleteForEveryone,
  onStartEdit,
  onReply,
  onRetry,
  selectionMode,
  isSelected,
  isActionMenuOpen,
  onToggleActionMenu,
  showSenderAvatar,
  onToggleSelect,
  onStartSelect
}) {
  const isMe = msg.isFromMe;
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioInstance, setAudioInstance] = useState(null);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [actionError, setActionError] = useState('');
  const actionMenuRef = useRef(null);
  const actionTriggerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const [isMobileActions, setIsMobileActions] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  const closeActions = () => {
    setShowDeleteMenu(false);
    setActionError('');
    onToggleReactionPicker(null);
    onToggleActionMenu?.(null);
  };

  const openActions = () => {
    setShowDeleteMenu(false);
    setActionError('');
    onToggleReactionPicker(null);
    onToggleActionMenu?.(msg.id);
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
    longPressStartRef.current = null;
  };

  const handlePointerDown = event => {
    if (event.pointerType === 'mouse' || selectionMode || event.target.closest('.message-action-portal-backdrop, .message-action-menu, button, a, input')) return;
    longPressStartRef.current = { x: event.clientX, y: event.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressStartRef.current = null;
      longPressTimerRef.current = null;
      openActions();
      if (navigator.vibrate) navigator.vibrate(18);
    }, 480);
  };

  const handlePointerMove = event => {
    const start = longPressStartRef.current;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelLongPress();
  };

  const handleContextMenu = event => {
    if (selectionMode || event.target.closest('.message-action-portal-backdrop, .message-action-menu, button, a, input')) return;
    event.preventDefault();
    openActions();
  };

  const reactToMessage = async emoji => {
    try {
      await onAddReaction(msg.id, emoji);
      closeActions();
    } catch (error) {
      setActionError(error.message || 'Could not add reaction.');
    }
  };

  const deleteMessage = async forEveryone => {
    try {
      if (forEveryone) await onDeleteForEveryone?.(msg.id);
      else await onDeleteForMe?.(msg.id);
      closeActions();
    } catch (error) {
      setActionError(error.message || 'Could not delete message.');
    }
  };

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = event => setIsMobileActions(event.matches);
    setIsMobileActions(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!isActionMenuOpen) return undefined;
    const closeMenu = event => {
      const insideMenu = actionMenuRef.current?.contains(event.target);
      const insideTrigger = actionTriggerRef.current?.contains(event.target);
      if (!insideMenu && !insideTrigger) onToggleActionMenu?.(null);
    };
    document.addEventListener('pointerdown', closeMenu);
    return () => document.removeEventListener('pointerdown', closeMenu);
  }, [isActionMenuOpen, onToggleActionMenu]);

  useEffect(() => { if (selectionMode) onToggleActionMenu?.(null); }, [selectionMode, onToggleActionMenu]);

  const toggleAudio = () => {
    const isMockUrl = !msg.attachment_url || (!msg.attachment_url.startsWith('http') && !msg.attachment_url.startsWith('blob:'));
    
    if (isMockUrl) {
      setIsPlayingAudio(!isPlayingAudio);
      if (!isPlayingAudio) {
        const interval = setInterval(() => {
          setAudioProgress(p => {
            if (p >= 100) {
              clearInterval(interval);
              setIsPlayingAudio(false);
              return 0;
            }
            return p + 5;
          });
        }, 250);
      }
      return;
    }

    if (isPlayingAudio) {
      if (audioInstance) audioInstance.pause();
      setIsPlayingAudio(false);
    } else {
      const audio = audioInstance || new Audio(msg.attachment_url);
      if (!audioInstance) setAudioInstance(audio);
      
      audio.play().catch(e => {
        console.error("Audio playback failed:", e);
        setIsPlayingAudio(false);
      });
      setIsPlayingAudio(true);
      
      audio.ontimeupdate = () => {
        const progressVal = (audio.currentTime / audio.duration) * 100;
        setAudioProgress(isNaN(progressVal) ? 0 : progressVal);
      };
      audio.onended = () => {
        setIsPlayingAudio(false);
        setAudioProgress(0);
      };
    }
  };

  const attachmentName = msg.attachment_name || 'Attachment';
  const mimeType = msg.attachment_mime_type || '';
  const attachmentUrl = typeof msg.attachment_url === 'string' ? msg.attachment_url : '';
  const isVoiceNote = msg.message_type === 'voice_note' || msg.message_type === 'audio' ||
    attachmentUrl.includes('voice-note');
  const isPdf = mimeType === 'application/pdf' ||
    attachmentName.toLowerCase().endsWith('.pdf') ||
    attachmentUrl.toLowerCase().includes('.pdf');
  const isImage = msg.message_type === 'image' ||
    mimeType.startsWith('image/') ||
    /\.(jpe?g|png|gif|webp)(?:[?#]|$)/i.test(attachmentUrl);
  const isFile = msg.message_type === 'file' && !isPdf;
  const isSystem = msg.message_type === 'system';
  const isOptimistic = msg._optimistic;
  const isFailed = msg._status === 'failed';

  // Format time
  const timeText = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  // Reactions grouped
  const reactionGroups = {};
  (msg.reactionList || []).forEach(r => {
    if (!reactionGroups[r.emoji]) reactionGroups[r.emoji] = [];
    reactionGroups[r.emoji].push(r.user_id);
  });


  const renderActionMenu = () => (
    <div ref={actionMenuRef} className={'message-action-menu ' + (isMe ? 'right' : 'left')} role="menu" aria-label="Message actions">
      {actionError && <div className="message-action-error">{actionError}</div>}
      {showReactionPicker === msg.id ? <>
        <button className="message-action-back" onClick={() => { setActionError(''); onToggleReactionPicker(null); }}><ChevronLeft size={14}/>Reactions</button>
        <div className="message-action-emoji-grid">
          {SAFE_REACTION_EMOJIS.map(emoji => <button key={emoji} onClick={() => reactToMessage(emoji)}>{emoji}</button>)}
        </div>
      </> : showDeleteMenu ? <>
        <button className="message-action-back" onClick={() => { setActionError(''); setShowDeleteMenu(false); }}><ChevronLeft size={14}/>Delete message</button>
        <button onClick={() => deleteMessage(false)}><Trash2 size={14}/>Delete for me</button>
        {isMe && <button className="danger" onClick={() => deleteMessage(true)}><Trash2 size={14}/>Delete for everyone</button>}
      </> : <>
        <button onClick={() => { onReply(msg); closeActions(); }}><Reply size={14}/>Reply</button>
        <button onClick={() => { setShowDeleteMenu(false); setActionError(''); onToggleReactionPicker(msg.id); }}><Smile size={14}/>Emoji</button>
        {isMe && <button onClick={() => { onStartEdit?.(msg); closeActions(); }}><Edit3 size={14}/>Edit</button>}
        <button className="danger" onClick={() => { setActionError(''); onToggleReactionPicker(null); setShowDeleteMenu(true); }}><Trash2 size={14}/>Delete</button>
        <button onClick={() => { onStartSelect?.(msg.id); closeActions(); }}><ListChecks size={14}/>Select</button>
      </>}
    </div>
  );
  if (isSystem) {
    return (
      <div className="date-separator system-message" id={`msg-${msg.id}`}>
        <span style={{ fontStyle: 'italic', fontSize: '11px' }}>{'\u{1F514}'} {msg.content}</span>
      </div>
    );
  }

  return (
    <div
      className={`message-bubble-wrapper ${isMe ? 'me' : 'other'} ${msg.reply_to_id ? 'has-reply' : ''} ${isOptimistic ? 'optimistic' : ''} ${isFailed ? 'failed' : ''} ${isActionMenuOpen ? 'action-menu-open' : ''}`}
      onMouseLeave={() => { if (!isMobileActions) closeActions(); }}
      onContextMenu={handleContextMenu}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={cancelLongPress}
      onPointerCancel={cancelLongPress}
      id={`msg-${msg.id}`}
    >
      <div className="bubble-row">
        {selectionMode && (
          <button
            type="button"
            className={`message-select-toggle ${isSelected ? 'selected' : ''}`}
            onClick={() => onToggleSelect?.(msg.id)}
            aria-label={isSelected ? 'Deselect message' : 'Select message'}
            aria-pressed={isSelected}
          ><Check size={12} /></button>
        )}
        {showSenderAvatar && !isMe && (
          <div className="message-sender-avatar" title={msg.senderName || 'Contact'}>
            {msg.senderName ? msg.senderName[0].toUpperCase() : 'C'}
          </div>
        )}

        <div className={`message-bubble ${msg.attachment_url && !msg.content ? 'attachment-only' : ''} ${msg.is_pinned ? 'pinned-msg' : ''}`}>
          
          {/* Reply preview */}
          {msg.replyToContent && (
            <div className="replied-banner-nested">
              <div className="replied-sender-name">
                {msg.replyToSenderName || 'User'}
              </div>
              <p className="replied-text-preview">{msg.replyToContent}</p>
            </div>
          )}

          {/* Image attachment */}
          {isImage && msg.attachment_url && !isVoiceNote && !isPdf && (
            <div className="message-attachment">
              <img src={msg.attachment_url} alt="Attachment" loading="lazy" />
            </div>
          )}

          {/* PDF attachment */}
          {isPdf && msg.attachment_url && (
            <div className="message-attachment pdf-attachment" style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                <FileText size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{msg.attachment_name || 'Document.pdf'}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PDF Document</span>
              </div>
              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', fontSize: '11.5px', color: 'white', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--panel-border)', borderRadius: '6px', textDecoration: 'none' }}>Open</a>
            </div>
          )}

          {/* Generic file attachment */}
          {isFile && msg.attachment_url && !isPdf && (
            <div className="message-file-card">
              <div className="file-card-icon"><Film size={18} /></div>
              <div className="file-card-copy">
                <strong>{attachmentName}</strong>
                <span>{mimeType || 'File'} {formatBytes(msg.attachment_size)}</span>
              </div>
              <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" className="file-download-btn" title="Download attachment"><Download size={15} /></a>
            </div>
          )}

          {/* Voice note */}
          {isVoiceNote && (
            <div className="voice-note-player">
              <button className="play-pause-btn" onClick={toggleAudio}>
                {isPlayingAudio ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div className="audio-wave">
                <div className="audio-progress-bar" style={{ width: `${audioProgress}%` }} />
                <span className="wave-bar-static h-4" />
                <span className="wave-bar-static h-6" />
                <span className="wave-bar-static h-3" />
                <span className="wave-bar-static h-5" />
                <span className="wave-bar-static h-7" />
                <span className="wave-bar-static h-4" />
                <span className="wave-bar-static h-2" />
              </div>
              <span className="voice-duration">0:14</span>
            </div>
          )}

          {/* Text */}
          {msg.content && msg.message_type !== 'system' && (
            <p className="message-text">
              {msg.content}
              {msg.is_edited && <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px', fontStyle: 'italic' }}>edited</span>}
            </p>
          )}

          {isFailed && (
            <button type="button" className="message-retry-btn" onClick={() => onRetry?.(msg.id)}>
              <RefreshCw size={12} /> Retry sending
            </button>
          )}

          {/* Compact message actions */}
          {!selectionMode && <>
            <div className="message-hover-actions" ref={actionTriggerRef}>
              <button
                type="button"
                className="msg-action-btn message-menu-trigger"
                onClick={() => { if (isActionMenuOpen) closeActions(); else openActions(); }}
                title="Message actions"
                aria-label="Open message actions"
                aria-expanded={isActionMenuOpen}
              >
                <ChevronDown size={14} />
              </button>
              {isActionMenuOpen && !isMobileActions && renderActionMenu()}
            </div>
            {isActionMenuOpen && isMobileActions && createPortal(
              <div
                className="message-action-portal-backdrop"
                role="presentation"
                onPointerDown={event => {
                  event.stopPropagation();
                  cancelLongPress();
                  if (event.target === event.currentTarget) closeActions();
                }}
                onContextMenu={event => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {renderActionMenu()}
              </div>,
              document.body
            )}
          </>}
        </div>
      </div>

      {/* Reactions */}
      {Object.keys(reactionGroups).length > 0 && (
        <div className="reaction-tag-container">
          {Object.entries(reactionGroups).map(([emoji, userIds]) => (
            <div
              key={emoji}
              className="reaction-tag"
              onClick={() => onAddReaction(msg.id, emoji)}
              title={`${userIds.length} reaction(s)`}
            >
              {emoji} {userIds.length > 1 && <span style={{ fontSize: '10px', marginLeft: '2px' }}>{userIds.length}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Timestamp & receipts */}
      <div className="message-info-row">
        <span className="msg-time-stamp">{timeText}</span>
        {isMe && (
          isFailed
            ? <span style={{ fontSize: '10px', color: '#ef4444' }}>Failed</span>
            : isOptimistic
              ? <Check size={11} className="read-receipt sending" style={{ opacity: 0.4 }} />
              : <CheckCheck size={11} className="read-receipt read" />
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
