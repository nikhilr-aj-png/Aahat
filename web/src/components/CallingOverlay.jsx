import { useRef, useEffect, useState } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume1, Volume2, VolumeX, Monitor, RefreshCw } from 'lucide-react';
import SafeAvatar from './SafeAvatar';

/**
 * CallingOverlay â€” Full-screen overlay for voice/video calls (V2).
 * Supports real WebRTC streams, call controls, screen sharing, and incoming call UI.
 */
export default function CallingOverlay({
  callState,
  callDuration,
  isMuted,
  isCameraOff,
  isSpeakerOn,
  isScreenSharing,
  localStream,
  remoteStream,
  onHangup,
  onReject,
  onAnswer,
  onToggleMute,
  onToggleCamera,
  onToggleScreenShare,
  onSwitchCamera,
  onToggleSpeaker
}) {
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [audioOutputMessage, setAudioOutputMessage] = useState('');
  const [isNearEarpiece, setIsNearEarpiece] = useState(false);
  const [audioMode, setAudioMode] = useState('normal');
  const isVideo = callState?.type === 'video';
  const isRinging = Boolean(callState?.isRinging);

  useEffect(() => {
    const video = localVideoRef.current;
    if (!video || !localStream || !isVideo || isRinging) return;
    video.srcObject = localStream;
    video.play().catch(() => undefined);
  }, [isRinging, isVideo, localStream]);

  useEffect(() => {
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    if (!remoteStream) return undefined;
    const mediaElements = [];
    const tryPlay = element => {
      if (!element) return;
      element.play().catch(error => {
        if (element === audio && error?.name === 'NotAllowedError') {
          setAudioOutputMessage('Tap the sound button to start call audio.');
        }
      });
    };
    if (video && isVideo && !isRinging) {
      video.srcObject = remoteStream;
      mediaElements.push(video);
      tryPlay(video);
    }
    if (audio) {
      audio.srcObject = remoteStream;
      mediaElements.push(audio);
      tryPlay(audio);
    }
    const handleReady = () => mediaElements.forEach(tryPlay);
    const tracks = remoteStream.getTracks();
    mediaElements.forEach(element => {
      element.addEventListener('loadedmetadata', handleReady);
      element.addEventListener('canplay', handleReady);
    });
    tracks.forEach(track => track.addEventListener('unmute', handleReady));
    return () => {
      mediaElements.forEach(element => {
        element.removeEventListener('loadedmetadata', handleReady);
        element.removeEventListener('canplay', handleReady);
      });
      tracks.forEach(track => track.removeEventListener('unmute', handleReady));
    };
  }, [isRinging, isVideo, remoteStream]);

  useEffect(() => {
    setAudioMode('normal');
    setAudioOutputMessage('Normal volume');
    onToggleSpeaker?.(false);
  }, [callState?.callId, onToggleSpeaker]);

  useEffect(() => {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    audio.muted = audioMode === 'muted';
    audio.volume = audioMode === 'normal' ? 0.45 : 1;
    if (audioMode !== 'muted' && audio.srcObject) audio.play().catch(() => {
      setAudioOutputMessage('Tap the sound button to start call audio.');
    });
  }, [audioMode, remoteStream]);

  useEffect(() => {
    if (isVideo || isRinging || isSpeakerOn) {
      setIsNearEarpiece(false);
      return undefined;
    }

    const handleLegacyProximity = event => setIsNearEarpiece(Boolean(event.near));
    window.addEventListener('userproximity', handleLegacyProximity);
    let sensor = null;
    let handleReading = null;
    if (typeof window.ProximitySensor === 'function') {
      try {
        sensor = new window.ProximitySensor({ frequency: 5 });
        handleReading = () => setIsNearEarpiece(Boolean(sensor.near));
        sensor.addEventListener('reading', handleReading);
        sensor.start();
      } catch (error) {
        console.warn('Proximity sensor is unavailable in this browser:', error.message);
      }
    }

    return () => {
      window.removeEventListener('userproximity', handleLegacyProximity);
      if (sensor && handleReading) sensor.removeEventListener('reading', handleReading);
      sensor?.stop();
      setIsNearEarpiece(false);
    };
  }, [isRinging, isSpeakerOn, isVideo]);

  const cycleAudioMode = () => {
    const audio = remoteAudioRef.current;
    const nextMode = audioMode === 'normal' ? 'loud' : audioMode === 'loud' ? 'muted' : 'normal';
    setAudioMode(nextMode);
    onToggleSpeaker?.(nextMode !== 'normal');
    setAudioOutputMessage(nextMode === 'normal' ? 'Normal volume' : nextMode === 'loud' ? 'Loud volume' : 'Call audio muted');
    if (nextMode !== 'muted' && audio?.srcObject) audio.play().catch(() => {
      setAudioOutputMessage('Tap again to allow call audio.');
    });
  };

  if (!callState) return null;

  const { contact, isIncoming } = callState;
  const statusLabels = {
    calling: 'Calling…', ringing: isIncoming ? 'Incoming call…' : 'Ringing…',
    connecting: 'Connecting securely…', connected: 'Connected',
    disconnected: 'Network changed · reconnecting…', failed: 'Call failed',
    rejected: 'Call declined', missed: 'Missed call', ended: 'Call ended', busy: 'User is busy'
  };
  const statusLabel = statusLabels[callState.status] || (isRinging ? 'Ringing…' : 'Connecting…');


  // Format duration
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="calling-overlay" id="calling-overlay">
      <audio ref={remoteAudioRef} autoPlay playsInline aria-label="Remote call audio" />
      {isNearEarpiece && <div className="call-proximity-shield" aria-hidden="true" />}
      {/* Background */}
      <div className="call-background">
        <div className="call-gradient-1" />
        <div className="call-gradient-2" />
      </div>

      {/* Video streams for video calls */}
      {isVideo && !isRinging && (
        <div className="video-call-streams">
          {/* Remote video (full screen) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            muted
            playsInline
            className="remote-video"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              zIndex: 1
            }}
          />

          {/* Local video (PiP) */}
          <div className="local-video-pip" style={{
            position: 'absolute',
            bottom: '120px',
            right: '20px',
            width: '140px',
            height: '200px',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.2)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            zIndex: 10
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            {isCameraOff && (
              <div style={{
                position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '11px'
              }}>
                Camera Off
              </div>
            )}
          </div>
        </div>
      )}

      {/* Call content */}
      <div className="call-content" style={{ position: 'relative', zIndex: 5 }}>
        {/* Ringing / incoming call state */}
        {isRinging && (
          <div className="call-ringing-content" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: '24px'
          }}>
            {/* Avatar with ring animation */}
            <div className="call-avatar-ring" style={{ position: 'relative' }}>
              <div style={{
                position: 'absolute', inset: '-16px', borderRadius: '50%',
                border: '2px solid rgba(95, 52, 247, 0.3)',
                animation: 'pulse 2s ease-in-out infinite'
              }} />
              <div style={{
                position: 'absolute', inset: '-32px', borderRadius: '50%',
                border: '2px solid rgba(95, 52, 247, 0.15)',
                animation: 'pulse 2s ease-in-out infinite 0.5s'
              }} />
              <SafeAvatar
                src={contact?.avatarUrl}
                name={contact?.name || 'Unknown'}
                size={100}
                style={{ borderRadius: '50%', border: '3px solid rgba(255,255,255,0.2)' }}
              />
            </div>

            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px' }}>
                {contact?.name || 'Unknown'}
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                {isIncoming ? `Incoming ${isVideo ? 'video' : 'voice'} call · ${statusLabel}` : statusLabel}
              </p>
            </div>

            {/* Incoming call: Accept / Reject */}
            {isIncoming ? (
              <div style={{ display: 'flex', gap: '32px', marginTop: '32px' }}>
                <button
                  className="call-action-btn decline"
                  onClick={onReject}
                  style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    border: 'none', color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4)',
                    transition: 'transform 0.2s'
                  }}
                  title="Decline"
                >
                  <PhoneOff size={24} />
                </button>
                <button
                  className="call-action-btn accept"
                  onClick={onAnswer}
                  style={{
                    width: '64px', height: '64px', borderRadius: '50%',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    border: 'none', color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
                    transition: 'transform 0.2s'
                  }}
                  title="Accept"
                >
                  <Phone size={24} />
                </button>
              </div>
            ) : (
              /* Outgoing call: just show hangup */
              <button
                className="call-action-btn decline"
                onClick={onHangup}
                style={{
                  width: '64px', height: '64px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 20px rgba(239, 68, 68, 0.4)',
                  marginTop: '32px'
                }}
                title="Cancel Call"
              >
                <PhoneOff size={24} />
              </button>
            )}
          </div>
        )}

        {/* Active call state */}
        {!isRinging && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'space-between', height: '100%', padding: '40px 20px 32px'
          }}>
            {/* Top: contact info + duration */}
            <div style={{ textAlign: 'center' }}>
              {!isVideo && (
                <SafeAvatar
                  src={contact?.avatarUrl}
                  name={contact?.name || 'Unknown'}
                  size={80}
                  style={{ borderRadius: '50%', margin: '0 auto 16px', border: '3px solid rgba(255,255,255,0.2)' }}
                />
              )}
              <h2 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>{contact?.name || 'Unknown'}</h2>
              <p style={{ fontSize: '16px', color: 'var(--accent-light)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' }}>
                {formatDuration(callDuration)}
              </p>
            </div>

              <small style={{ display: 'block', marginTop: '5px', color: 'var(--text-secondary)' }}>
                {statusLabel}
              </small>
            {/* Bottom: controls */}
            <div style={{
              display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center',
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(20px)',
              borderRadius: '16px', padding: '16px 24px',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <button
                onClick={onToggleMute}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: isMuted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)', color: isMuted ? '#fca5a5' : 'white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s'
                }}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              {isVideo && (
                <button
                  onClick={onToggleCamera}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: isCameraOff ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)', color: isCameraOff ? '#fca5a5' : 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}
                >
                  {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
              )}

              <button
                onClick={cycleAudioMode}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: audioMode === 'muted' ? 'rgba(239,68,68,0.3)' : audioMode === 'loud' ? 'rgba(95,52,247,0.4)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)', color: audioMode === 'muted' ? '#fca5a5' : 'white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title={audioMode === 'normal' ? 'Normal volume · tap for loud' : audioMode === 'loud' ? 'Loud volume · tap to mute' : 'Muted · tap for normal volume'}
                aria-label={`Call audio: ${audioMode}`}
                aria-pressed={audioMode !== 'normal'}
              >
                {audioMode === 'muted' ? <VolumeX size={20} /> : audioMode === 'loud' ? <Volume2 size={20} /> : <Volume1 size={20} />}
              </button>
              {audioOutputMessage && (
                <span className="call-audio-output-message" role="status">{audioOutputMessage}</span>
              )}


              {isVideo && (
                <button
                  onClick={onSwitchCamera}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)', color: 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title="Switch camera"
                >
                  <RefreshCw size={20} />
                </button>
              )}
              {isVideo && (
                <button
                  onClick={onToggleScreenShare}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: isScreenSharing ? 'rgba(95,52,247,0.4)' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)', color: isScreenSharing ? '#a5b4fc' : 'white',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                  title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
                >
                  <Monitor size={20} />
                </button>
              )}

              {/* Hangup */}
              <button
                onClick={onHangup}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  border: 'none', color: 'white', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 16px rgba(239, 68, 68, 0.4)'
                }}
                title="End Call"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

