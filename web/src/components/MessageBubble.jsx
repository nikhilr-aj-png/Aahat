import { memo, useState } from 'react';
import { Smile, Trash2, Check, CheckCheck, Reply, Share2, Play, Pause, FileText, Edit3, Pin, Star, RefreshCw, Download, Film } from 'lucide-react';

const formatBytes = (bytes) => {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const REACTION_EMOJIS = ['ðŸ‘', 'â¤ï¸', 'ðŸ˜‚', 'ðŸ˜®', 'ðŸ˜¢', 'ðŸ™'];

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
  onEditMessage,
  onReply,
  onForward,
  onTogglePin,
  onToggleStar,
  onRetry
}) {
  const isMe = msg.isFromMe;
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioInstance, setAudioInstance] = useState(null);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);

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

  if (isSystem) {
    return (
      <div className="date-separator system-message" id={`msg-${msg.id}`}>
        <span style={{ fontStyle: 'italic', fontSize: '11px' }}>ðŸ”” {msg.content}</span>
      </div>
    );
  }

  return (
    <div
      className={`message-bubble-wrapper ${isMe ? 'me' : 'other'} ${msg.reply_to_id ? 'has-reply' : ''} ${isOptimistic ? 'optimistic' : ''} ${isFailed ? 'failed' : ''}`}
      id={`msg-${msg.id}`}
    >
      <div className="bubble-row">
        {!isMe && (
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

          {/* Hover actions */}
          <div className="message-hover-actions">
            <button className="msg-action-btn" onClick={() => onReply(msg)} title="Reply" id={`btn-reply-${msg.id}`}>
              <Reply size={12} />
            </button>
            <button className="msg-action-btn" onClick={() => onForward(msg)} title="Forward" id={`btn-forward-${msg.id}`}>
              <Share2 size={12} />
            </button>
            <button className="msg-action-btn" onClick={() => onToggleReactionPicker(showReactionPicker === msg.id ? null : msg.id)} title="React" id={`btn-react-${msg.id}`}>
              <Smile size={12} />
            </button>
            {isMe && (
              <button className="msg-action-btn" onClick={() => {
                const newText = prompt('Edit message:', msg.content);
                if (newText && newText !== msg.content) onEditMessage?.(msg.id, newText);
              }} title="Edit" id={`btn-edit-${msg.id}`}>
                <Edit3 size={12} />
              </button>
            )}
            <button className="msg-action-btn" onClick={() => onTogglePin?.(msg.id)} title={msg.is_pinned ? 'Unpin' : 'Pin'}>
              <Pin size={12} />
            </button>
            <button className="msg-action-btn" onClick={() => onToggleStar?.(msg.id)} title="Star">
              <Star size={12} />
            </button>
            <button
              className="msg-action-btn danger"
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              title="Delete"
              id={`btn-delete-${msg.id}`}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Delete submenu */}
          {showDeleteMenu && (
            <div style={{
              position: 'absolute', bottom: '-50px', right: isMe ? '0' : 'auto', left: isMe ? 'auto' : '0',
              background: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(12px)',
              border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '4px',
              display: 'flex', flexDirection: 'column', gap: '2px', zIndex: 30, minWidth: '140px',
              boxShadow: 'var(--shadow-md)'
            }}>
              <button
                style={{ padding: '6px 12px', fontSize: '11px', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', borderRadius: '4px' }}
                onClick={() => { onDeleteForMe?.(msg.id); setShowDeleteMenu(false); }}
                onMouseOver={e => e.target.style.background = 'var(--glass-hover)'}
                onMouseOut={e => e.target.style.background = 'none'}
              >
                Delete for me
              </button>
              {isMe && (
                <button
                  style={{ padding: '6px 12px', fontSize: '11px', background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', textAlign: 'left', borderRadius: '4px' }}
                  onClick={() => { onDeleteForEveryone?.(msg.id); setShowDeleteMenu(false); }}
                  onMouseOver={e => e.target.style.background = 'rgba(239,68,68,0.1)'}
                  onMouseOut={e => e.target.style.background = 'none'}
                >
                  Delete for everyone
                </button>
              )}
            </div>
          )}

          {/* Reaction picker */}
          {showReactionPicker === msg.id && (
            <div className={`reaction-picker ${isMe ? 'right' : 'left'}`}>
              {REACTION_EMOJIS.map(emoji => (
                <span
                  key={emoji}
                  className="reaction-emoji"
                  onClick={() => { onAddReaction(msg.id, emoji); onToggleReactionPicker(null); }}
                >
                  {emoji}
                </span>
              ))}
            </div>
          )}
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
