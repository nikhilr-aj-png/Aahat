import { useState, useRef, useEffect } from 'react';
import { Paperclip, Send, X, Camera, Mic, MicOff, Smile, RefreshCw, FileText } from 'lucide-react';

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
  const [selectedImage, setSelectedImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
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
    setSelectedImage(null);
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
    if (!inputText.trim() && !selectedImage && !isRecording) return;
    
    const attachmentPayload = selectedImage
      ? (typeof selectedImage === 'string' ? selectedImage : selectedImage)
      : null;
    onSend(inputText, attachmentPayload);
    setInputText('');
    if (onCancelEdit) onCancelEdit();
    setSelectedImage(null);
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

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size limit: 50MB
    const MAX_SIZE_MB = 50;
    const maxSizeBytes = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      alert(`File size exceeds the ${MAX_SIZE_MB}MB limit! Please select a smaller file (current: ${(file.size / (1024 * 1024)).toFixed(2)}MB).`);
      e.target.value = '';
      return;
    }

    setIsUploading(true);
    try {
      const url = await onUploadFile(file);
      setSelectedImage({
        url,
        name: file.name,
        size: file.size,
        mimeType: file.type
      });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCameraOpen = () => {
    setFacingMode('user'); // Reset to front camera by default
    setShowCameraFeed(true);
  };

  const toggleFacingMode = () => {
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
      try {
        const url = await onUploadFile(file);
        setSelectedImage({
          url,
          name: file.name,
          size: file.size,
          mimeType: file.type
        });
      } catch (err) {
        console.error("Upload captured photo failed:", err);
      } finally {
        setIsUploading(false);
      }
    }, 'image/jpeg', 0.85);
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCameraFeed(false);
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' });
        
        setIsUploading(true);
        try {
          const url = await onUploadFile(audioFile);
          onSend("", {
            url,
            name: audioFile.name,
            size: audioFile.size,
            mimeType: audioFile.type
          });
        } catch (err) {
          console.error("Voice note upload failed:", err);
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

  const clearAttachment = () => {
    setSelectedImage(null);
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
          accept="image/*,video/*,application/pdf"
          onChange={handleFileChange}
        />

        {/* Attachment Preview */}
        {selectedImage && (
          <div className="attachment-preview">
            {(typeof selectedImage === 'object' ? selectedImage.mimeType === 'application/pdf' : selectedImage.toLowerCase().includes('.pdf')) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '8px', marginRight: '10px' }}>
                <FileText size={16} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: '11px', color: 'white' }}>{typeof selectedImage === 'object' ? selectedImage.name : 'Document.pdf'}</span>
              </div>
            ) : (
              <img src={typeof selectedImage === 'object' ? selectedImage.url : selectedImage} alt="Attachment preview" />
            )}
            <button type="button" className="attachment-remove" onClick={clearAttachment}>
              <X size={14} />
            </button>
          </div>
        )}

        <div className="input-row">
          
          {/* Attach Button */}
          <button
            type="button"
            className={`btn-icon attach-btn ${selectedImage ? 'has-file' : ''}`}
            title="Attach File"
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
                placeholder={isUploading ? "Uploading file..." : editingMessage ? "Edit message..." : "Type a message..."}
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
            disabled={isUploading || (inputText.trim().length > 0 || selectedImage)}
            title={isRecording ? "Stop & Send" : "Record Voice Note"}
            id="btn-voice-record"
          >
            {isRecording ? <MicOff size={18} className="text-red-500" /> : <Mic size={18} />}
          </button>

          {/* Send Button */}
          <button
            type="submit"
            className="btn-send"
            disabled={isUploading || (!inputText.trim() && !selectedImage && !isRecording)}
            id="btn-send"
          >
            <Send size={18} />
          </button>
        </div>
      </form>

      {/* Real Camera Video Stream Modal Overlay */}
      {showCameraFeed && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-card camera-capture-card" style={{ maxWidth: '450px', background: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(16px)', border: '1px solid var(--panel-border)', padding: '20px' }}>
            <div className="modal-header" style={{ marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Camera size={18} style={{ color: 'var(--accent-light)' }} /> Capture Photo</h3>
              <button type="button" className="modal-close" onClick={closeCamera} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000', aspectRatio: '4/3', marginBottom: '20px', border: '1px solid var(--panel-border)' }}>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted 
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
              <button type="button" className="admin-btn admin-btn-ghost" onClick={toggleFacingMode} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                <RefreshCw size={14} /> Flip Camera
              </button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={capturePhoto} style={{ width: '56px', height: '56px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }} title="Capture Photo">
                <div style={{ width: '42px', height: '42px', borderRadius: '50%', border: '4px solid white', background: 'rgba(255,255,255,0.2)' }} />
              </button>
              <button type="button" className="admin-btn admin-btn-ghost" onClick={closeCamera}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
