import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Paperclip, Send, X, Camera, Mic, MicOff, Smile, RefreshCw, FileText, Image as ImageIcon, Film, Music } from 'lucide-react';
import { prepareChatMedia } from '../utils/mediaCompression';
import { formatBytes, resolveAttachmentKind, describeAttachmentType } from '../utils/attachments';

const ATTACHMENT_ACCEPT = [
  'image/*', 'video/*', 'audio/*',
  'application/pdf', 'application/zip', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'
].join(',');

const KIND_ICONS = { image: ImageIcon, video: Film, audio: Music, voice_note: Music, file: FileText };

const POPULAR_EMOJIS = ['😊', '😂', '🔥', '👍', '❤️', '👏', '🙌', '🎉', '✨', '💡'];
const SAFE_POPULAR_EMOJIS = POPULAR_EMOJIS.map((emoji, index) => [
  '\u{1F60A}', '\u{1F602}', '\u{1F525}', '\u{1F44D}', '\u{2764}\u{FE0F}',
  '\u{1F44F}', '\u{1F64C}', '\u{1F389}', '\u{2728}', '\u{1F4A1}'
][index] || emoji);


/**
 * ChatInput — Message input bar with file attachments, camera upload simulation,
 * voice note recording, attachments, camera capture, and emoji shortcuts.
 */
export default function ChatInput({ onSend, onUploadFile, replyTo, onCancelReply, editingMessage, onCancelEdit, onSetTyping, conversationId, onInputFocus }) {
  const [inputText, setInputText] = useState('');
  // Multiple photos, videos, audio files and documents can be queued together.
  const [attachments, setAttachments] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [facingMode, setFacingMode] = useState('user');
  const recordingTimerRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const messageInputRef = useRef(null);

  useEffect(() => {
    if (!editingMessage) return;
    setInputText(editingMessage.content || '');
    setAttachments([]);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      messageInputRef.current?.focus();
      messageInputRef.current?.setSelectionRange(messageInputRef.current.value.length, messageInputRef.current.value.length);
    });
  }, [editingMessage]);

  // Typing indicator: debounce to stop typing after 2 seconds of inactivity
  const handleTypingChange = (text) => {
    setInputText(text);
    if (onSetTyping && conversationId) {
      onSetTyping(conversationId, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onSetTyping(conversationId, false);
      }, 2000);
    }
  };

  // Clear typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (onSetTyping && conversationId) onSetTyping(conversationId, false);
    };
  }, [conversationId, onSetTyping]);

  // Timer for voice note recording simulation
  useEffect(() => {
    if (isRecording) {
      setRecordDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecording]);

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!inputText.trim() && !attachments.length && !isRecording) return;

    onSend(inputText, attachments.length ? attachments : null);
    setInputText('');
    if (onCancelEdit) onCancelEdit();
    setAttachments([]);
    if (onCancelReply) onCancelReply();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Real camera capture references and states
  const [showCameraFeed, setShowCameraFeed] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Real microphone recording references
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);

  // Auto-start camera when modal opens
  useEffect(() => {
    let activeStream = null;
    const startCamera = async () => {
      if (showCameraFeed) {
        try {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
          }
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } 
          });
          activeStream = stream;
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.error("Camera access failed:", err);
          alert("Could not access camera. Please check permissions.");
          setShowCameraFeed(false);
        }
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [showCameraFeed, facingMode]);

  // Prepares and uploads every picked file, keeping the ones that succeed and
  // reporting the rest together so one bad file cannot cancel the whole batch.
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsUploading(true);
    const failures = [];
    try {
      for (const [index, file] of files.entries()) {
        const position = files.length > 1 ? ` (${index + 1}/${files.length})` : '';
        try {
          setUploadStatus(`${file.type.startsWith('video/') ? 'Preparing video' : 'Preparing file'}...${position}`);
          const preparedFile = await prepareChatMedia(file, percent => setUploadStatus(`Compressing video ${percent}%${position}`));
          setUploadStatus(`Uploading...${position}`);
          const url = await onUploadFile(preparedFile);
          setAttachments(current => [...current, {
            id: `${Date.now()}-${index}-${preparedFile.name}`,
            url,
            name: preparedFile.name,
            size: preparedFile.size,
            mimeType: preparedFile.type,
            originalSize: file.size
          }]);
        } catch (err) {
          console.error('Upload failed:', file.name, err);
          failures.push(`${file.name}: ${err.message || 'could not be prepared'}`);
        }
      }
    } finally {
      setIsUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    if (failures.length) alert(`Some attachments were skipped:\n\n${failures.join('\n')}`);
  };
  const handleCameraOpen = () => {
    setFacingMode('user');
    setIsCameraReady(false);
    setShowCameraFeed(true);
  };

  const toggleFacingMode = () => {
    setIsCameraReady(false);
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      
      const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      closeCamera();

      setIsUploading(true);
      setUploadStatus('Compressing photo...');
      try {
        const preparedFile = await prepareChatMedia(file);
        setUploadStatus('Uploading...');
        const url = await onUploadFile(preparedFile);
        setAttachments(current => [...current, {
          id: `${Date.now()}-camera-${preparedFile.name}`,
          url,
          name: preparedFile.name,
          size: preparedFile.size,
          mimeType: preparedFile.type,
          originalSize: file.size
        }]);
      } catch (err) {
        console.error('Upload captured photo failed:', err);
        alert(err.message || 'Could not prepare this photo.');
      } finally {
        setIsUploading(false);
        setUploadStatus('');
      }
    }, 'image/jpeg', 0.85);
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
    setShowCameraFeed(false);
  };

  useEffect(() => {
    if (!showCameraFeed) return undefined;
    const closeOnEscape = event => { if (event.key === 'Escape') closeCamera(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showCameraFeed]);

  const cameraPortalTarget = typeof document !== 'undefined'
    ? (document.querySelector('#chat-view > .chat-view') || document.body)
    : null;

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const preferredVoiceType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find(type => window.MediaRecorder?.isTypeSupported?.(type));
      const mediaRecorder = new MediaRecorder(stream, {
        ...(preferredVoiceType ? { mimeType: preferredVoiceType } : {}),
        audioBitsPerSecond: 32_000
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioType = mediaRecorder.mimeType?.split(';')[0] || 'audio/webm';
        const extension = audioType === 'audio/mp4' ? 'm4a' : 'webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: audioType });
        const audioFile = new File([audioBlob], `voice-note-${Date.now()}.${extension}`, { type: audioType });
        
        setIsUploading(true);
        try {
          const url = await onUploadFile(audioFile);
          onSend("", [{
            id: audioFile.name,
            url,
            name: audioFile.name,
            size: audioFile.size,
            mimeType: audioFile.type
          }]);
        } catch (err) {
          console.error("Voice note upload failed:", err);
          alert(err.message || "Could not upload this voice note.");
        } finally {
          setIsUploading(false);
        }
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Microphone access failed:", err);
      alert("Could not access microphone. Please check permissions.");
    }
  };

  const stopVoiceRecording = (shouldSend = true) => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = shouldSend ? mediaRecorderRef.current.onstop : () => {
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(track => track.stop());
          audioStreamRef.current = null;
        }
      };
      mediaRecorderRef.current.stop();
      
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
      }
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopVoiceRecording(true);
    } else {
      startVoiceRecording();
    }
  };

  const insertEmoji = (emoji) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
  };

  const removeAttachment = (attachmentId) => {
    setAttachments(current => current.filter(item => item.id !== attachmentId));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatRecordTime = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="chat-input-area-wrapper">
      {editingMessage && (
        <div className="reply-preview-banner editing-message-banner">
          <div className="reply-preview-details">
            <span className="reply-title">Editing message</span>
            <p className="reply-text">{editingMessage.content}</p>
          </div>
          <button className="reply-cancel-btn" onClick={() => { setInputText(''); onCancelEdit?.(); }} title="Cancel editing">
            <X size={14} />
          </button>
        </div>
      )}
      
      {/* Replying to Preview Banner */}
      {replyTo && !editingMessage && (
        <div className="reply-preview-banner">
          <div className="reply-preview-details">
            <span className="reply-title">Replying to {
              typeof replyTo.senderName === 'string' ? replyTo.senderName
                : typeof replyTo.sender === 'string' ? replyTo.sender
                  : 'message'
            }</span>
            <p className="reply-text">{
              typeof replyTo.text === 'string' ? replyTo.text
                : typeof replyTo.content === 'string' ? replyTo.content
                  : 'Attachment'
            }</p>
          </div>
          <button className="reply-cancel-btn" onClick={onCancelReply} title="Cancel Reply">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Emoji Picker Popup */}
      {showEmojiPicker && (
        <div className="emoji-picker-container">
          <div className="emoji-picker-header">
            <span>Recent Emojis</span>
            <button className="btn-close-emoji" onClick={() => setShowEmojiPicker(false)}><X size={12} /></button>
          </div>
          <div className="emoji-picker-grid">
            {SAFE_POPULAR_EMOJIS.map(emoji => (
              <span 
                key={emoji} 
                className="emoji-picker-item" 
                onClick={() => insertEmoji(emoji)}
              >
                {emoji}
              </span>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-bar" id="chat-input-bar">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          accept={ATTACHMENT_ACCEPT}
          multiple
          onChange={handleFileChange}
        />

        {/* Queued attachments render as compact file chips, never as large previews. */}
        {attachments.length > 0 && (
          <div className="attachment-queue" aria-label={`${attachments.length} attachment(s) ready to send`}>
            {attachments.map(attachment => {
              const kind = resolveAttachmentKind({ mimeType: attachment.mimeType, name: attachment.name, url: attachment.url });
              const KindIcon = KIND_ICONS[kind] || FileText;
              return (
                <div key={attachment.id} className={`attachment-chip kind-${kind}`}>
                  <span className="attachment-chip-icon"><KindIcon size={15} /></span>
                  <span className="attachment-chip-copy">
                    <strong title={attachment.name}>{attachment.name}</strong>
                    <span>{describeAttachmentType(attachment.mimeType, attachment.name, kind)}{attachment.size ? ` · ${formatBytes(attachment.size)}` : ''}</span>
                  </span>
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="input-row">
          
          {/* Attach Button */}
          <button
            type="button"
            className={`btn-icon attach-btn ${attachments.length ? 'has-file' : ''}`}
            title="Attach files"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading || isRecording}
            id="btn-attach"
          >
            {isUploading ? <div className="upload-spinner" /> : <Paperclip size={18} />}
          </button>

          {/* Camera Button */}
          <button
            type="button"
            className="btn-icon camera-btn"
            title="Take Photo"
            onClick={handleCameraOpen}
            disabled={isUploading || isRecording}
            id="btn-camera"
          >
            <Camera size={18} />
          </button>

          {/* Emoji Toggle Button */}
          <button
            type="button"
            className={`btn-icon emoji-toggle-btn ${showEmojiPicker ? 'active' : ''}`}
            title="Emojis"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            disabled={isRecording}
            id="btn-emojis"
          >
            <Smile size={18} />
          </button>

          {/* Text Input area / Recording overlay */}
          <div className="chat-input-wrapper">
            {isRecording ? (
              <div className="recording-status-overlay">
                <span className="recording-indicator-pulse" />
                <span className="recording-label">Recording Voice Note... {formatRecordTime(recordDuration)}</span>
              </div>
            ) : (
              <input
                ref={messageInputRef}
                type="text"
                placeholder={isUploading ? (uploadStatus || "Preparing attachment...") : editingMessage ? "Edit message..." : "Type a message..."}
                value={inputText}
                onChange={e => handleTypingChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={onInputFocus}
                disabled={isUploading}
                id="message-input"
                autoComplete="off"
              />
            )}

          </div>

          {/* Voice Record Toggle Button */}
          <button
            type="button"
            className={`btn-icon voice-record-btn ${isRecording ? 'recording-active' : ''}`}
            onClick={toggleRecording}
            disabled={isUploading || inputText.trim().length > 0 || attachments.length > 0}
            title={isRecording ? "Stop & Send" : "Record Voice Note"}
            id="btn-voice-record"
          >
            {isRecording ? <MicOff size={18} className="text-red-500" /> : <Mic size={18} />}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            className="btn-send"
            disabled={isUploading || (!inputText.trim() && !attachments.length && !isRecording)}
            id="btn-send"
          >
            <Send size={18} />
          </button>
        </div>
      </form>

      {/* Camera workspace fills the chat panel on desktop and the viewport on mobile. */}
      {showCameraFeed && cameraPortalTarget && createPortal(
        <div className="camera-workspace-overlay" role="dialog" aria-modal="true" aria-label="Take a photo">
          <div className="camera-workspace">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-live-preview"
              onCanPlay={() => setIsCameraReady(true)}
            />
            <div className="camera-vignette" aria-hidden="true" />
            <div className="camera-focus-frame" aria-hidden="true"><span/><span/><span/><span/></div>

            <header className="camera-topbar">
              <div className="camera-title"><span className="camera-live-dot"/>Camera</div>
              <button type="button" className="camera-round-control camera-close-control" onClick={closeCamera} aria-label="Close camera">
                <X size={20}/>
              </button>
            </header>

            {!isCameraReady && (
              <div className="camera-loading-state"><div className="upload-spinner"/><span>Starting camera...</span></div>
            )}

            <footer className="camera-control-deck">
              <button type="button" className="camera-round-control" onClick={toggleFacingMode} disabled={!isCameraReady || isUploading} aria-label="Flip camera">
                <RefreshCw size={20}/><span>Flip</span>
              </button>
              <button type="button" className="camera-shutter" onClick={capturePhoto} disabled={!isCameraReady || isUploading} aria-label="Capture photo">
                <span/>
              </button>
              <button type="button" className="camera-round-control" onClick={closeCamera} disabled={isUploading} aria-label="Cancel camera">
                <X size={20}/><span>Cancel</span>
              </button>
            </footer>
          </div>
        </div>,
        cameraPortalTarget
      )}
    </div>
  );
}
