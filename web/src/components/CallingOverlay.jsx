import { useRef, useEffect } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Volume2, VolumeX, Monitor } from 'lucide-react';
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
  onToggleSpeaker
}) {
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => undefined);
    }
  }, [remoteStream, isSpeakerOn]);

  if (!callState) return null;

  const { contact, type, isRinging, isIncoming } = callState;
  const isVideo = type === 'video';

  // Format duration
  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="calling-overlay" id="calling-overlay">
      <audio ref={remoteAudioRef} autoPlay playsInline muted={!isSpeakerOn} aria-label="Remote call audio" />
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
                {isIncoming
                  ? `Incoming ${isVideo ? 'video' : 'voice'} call...`
                  : `Calling...`
                }
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
                onClick={onToggleSpeaker}
                style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: !isSpeakerOn ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)', color: !isSpeakerOn ? '#fca5a5' : 'white',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title={isSpeakerOn ? 'Speaker off' : 'Speaker on'}
              >
                {isSpeakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>

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

