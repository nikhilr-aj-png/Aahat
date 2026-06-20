import React, { memo, useState } from 'react';
import { Smile, Trash2, Check, CheckCheck, Reply, Share2, Play, Pause, Volume2, FileText } from 'lucide-react';

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/**
 * MessageBubble — Renders a single message with text, optional attachment,
 * hover actions (reply, forward, react, delete), nested reply preview,
 * read receipts, and voice note players.
 */
function MessageBubble({ 
  msg, 
  showReactionPicker, 
  onToggleReactionPicker, 
  onAddReaction, 
  onDelete,
  onReply,
  onForward
}) {
  const isMe = msg.isFromMe;
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioInstance, setAudioInstance] = useState(null);

  const toggleAudio = () => {
    // If it's a mock voice note, fallback to simulated progress
    const isMockUrl = !msg.attachmentUrl || (!msg.attachmentUrl.startsWith('http') && !msg.attachmentUrl.startsWith('blob:'));
    
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
      if (audioInstance) {
        audioInstance.pause();
      }
      setIsPlayingAudio(false);
    } else {
      const audio = audioInstance || new Audio(msg.attachmentUrl);
      if (!audioInstance) {
        setAudioInstance(audio);
      }
      
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

  // Determine if it's a voice note
  const isVoiceNote = msg.attachmentUrl && msg.attachmentUrl.includes('voice-note');
  
  // Determine if it's a PDF document
  const isPdf = msg.attachmentUrl && msg.attachmentUrl.toLowerCase().includes('.pdf');

  return (
    <div
      className={`message-bubble-wrapper ${isMe ? 'me' : 'other'} ${msg.replyToId ? 'has-reply' : ''}`}
      id={`msg-${msg.id}`}
    >
      <div className="bubble-row">
        {/* Incoming Profile Avatar */}
        {!isMe && (
          <div className="message-sender-avatar" title={msg.replyToSender || "Contact"}>
            {msg.contactId ? msg.contactId[0].toUpperCase() : 'C'}
          </div>
        )}

        <div className={`message-bubble ${msg.attachmentUrl && !msg.text ? 'attachment-only' : ''}`}>
          
          {/* Nested Replied-to Message Banner */}
          {msg.replyToText && (
            <div className="replied-banner-nested">
              <div className="replied-sender-name">
                {msg.replyToSender === 'me' || msg.replyToSender === 'You' ? 'You' : msg.replyToSender}
              </div>
              <p className="replied-text-preview">{msg.replyToText}</p>
            </div>
          )}

          {/* Attachment (Images/Videos) */}
          {msg.attachmentUrl && !isVoiceNote && !isPdf && (
            <div className="message-attachment">
              <img src={msg.attachmentUrl} alt="Attachment" loading="lazy" />
            </div>
          )}

          {/* Attachment (PDF) */}
          {msg.attachmentUrl && !isVoiceNote && isPdf && (
            <div className="message-attachment pdf-attachment" style={{ background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '12px', border: '1px solid var(--panel-border)', display: 'flex', alignItems: 'center', gap: '12px', minWidth: '200px' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', flexShrink: 0 }}>
                <FileText size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <span style={{ fontSize: '13px', fontWeight: '600', color: 'white', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>Document.pdf</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>PDF Document</span>
              </div>
              <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 12px', fontSize: '11.5px', color: 'white', background: 'rgba(255,255,255,0.08)', border: '1px solid var(--panel-border)', borderRadius: '6px', textDecoration: 'none' }}>Open</a>
            </div>
          )}

          {/* Voice Note player mock */}
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

          {/* Text content */}
          {msg.text && (
            <p className="message-text">{msg.text}</p>
          )}

          {/* Hover Actions Menu */}
          <div className="message-hover-actions">
            <button
              className="msg-action-btn"
              onClick={() => onReply(msg)}
              title="Reply"
              id={`btn-reply-${msg.id}`}
            >
              <Reply size={12} />
            </button>
            <button
              className="msg-action-btn"
              onClick={() => onForward(msg)}
              title="Forward"
              id={`btn-forward-${msg.id}`}
            >
              <Share2 size={12} />
            </button>
            <button
              className="msg-action-btn"
              onClick={() => onToggleReactionPicker(showReactionPicker === msg.id ? null : msg.id)}
              title="React"
              id={`btn-react-${msg.id}`}
            >
              <Smile size={12} />
            </button>
            <button
              className="msg-action-btn danger"
              onClick={() => onDelete(msg.id)}
              title="Delete"
              id={`btn-delete-${msg.id}`}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Reaction Picker Popover */}
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

      {/* Render Reaction tag below bubble */}
      {msg.reaction && (
        <div className="reaction-tag-container">
          <div className="reaction-tag" onClick={() => onAddReaction(msg.id, null)} title="Click to remove reaction">
            {msg.reaction}
          </div>
        </div>
      )}

      {/* Message Timestamp & Receipts */}
      <div className="message-info-row">
        <span className="msg-time-stamp">{msg.timeText}</span>
        {isMe && (
          msg.isRead
            ? <CheckCheck size={11} className="read-receipt read" />
            : <Check size={11} className="read-receipt" />
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
