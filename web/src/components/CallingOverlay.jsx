import React, { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, MicOff, Video, VideoOff, ScreenShare, Volume2, VolumeX, ShieldAlert, Sparkles } from 'lucide-react';

/**
 * CallingOverlay - Renders fullscreen voice and video calling overlays with active
 * grids, HD controls, duration trackers, screen-share mocks, and sound alerts.
 */
export default function CallingOverlay({ callState, onHangup }) {
  const { contact, type, isRinging } = callState;
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [duration, setDuration] = useState(0);
  const timerRef = useRef(null);

  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  // Sound generator using Web Audio API for ringing and disconnects
  useEffect(() => {
    let audioCtx = null;
    let oscillator = null;
    let gainNode = null;

    if (isRinging) {
      // Ring sound simulation
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        const ring = () => {
          if (!audioCtx) return;
          oscillator = audioCtx.createOscillator();
          gainNode = audioCtx.createGain();
          
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note
          
          // Ringing pattern (frequency modulation)
          oscillator.frequency.linearRampToValueAtTime(480, audioCtx.currentTime + 0.1);
          oscillator.frequency.linearRampToValueAtTime(440, audioCtx.currentTime + 0.2);
          
          gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          oscillator.start();
          oscillator.stop(audioCtx.currentTime + 1.3);
        };

        // Ring every 2.5 seconds
        ring();
        const interval = setInterval(ring, 2500);
        return () => {
          clearInterval(interval);
          if (audioCtx) audioCtx.close();
        };
      } catch (e) {
        console.warn("Web Audio not supported", e);
      }
    }
  }, [isRinging]);

  // Duration Timer
  useEffect(() => {
    if (!isRinging) {
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRinging]);

  // Local Video Capture in Call
  useEffect(() => {
    let activeStream = null;
    const startLocalVideo = async () => {
      if (type === 'video' && !isCameraOff && !isRinging) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: 320, height: 240 },
            audio: false
          });
          activeStream = stream;
          localStreamRef.current = stream;
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        } catch (err) {
          console.warn("Failed to get local camera for call:", err);
        }
      }
    };

    startLocalVideo();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [type, isCameraOff, isRinging]);

  const formatDuration = (sec) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!contact) return null;

  return (
    <div className={`calling-overlay ${type}`} id="calling-overlay">
      <div className="calling-blur-bg" style={{ backgroundImage: `url(${contact.avatarUrl})` }} />
      
      {/* Encryption Badge */}
      <div className="call-security-badge">
        <Sparkles size={12} />
        <span>End-to-End Encrypted HD Call</span>
      </div>

      {/* Main Panel Content */}
      <div className="call-container-inner">
        {type === 'voice' ? (
          /* Voice Call Layout */
          <div className="voice-call-layout">
            <div className="caller-profile">
              <div className={`caller-avatar-wrapper ${isRinging ? 'ringing' : 'connected'}`}>
                <img src={contact.avatarUrl} alt={contact.name} className="caller-avatar-img" />
                <span className="pulse-ring ring-1" />
                <span className="pulse-ring ring-2" />
                <span className="pulse-ring ring-3" />
              </div>
              <h2>{contact.name}</h2>
              <p className="call-status">
                {isRinging ? 'Ringing...' : `In Call • ${formatDuration(duration)}`}
              </p>
            </div>
          </div>
        ) : (
          /* Video Call Layout */
          <div className="video-call-layout">
            <div className="video-grid">
              
              {/* Remote Feed */}
              <div className="video-feed remote">
                {!isCameraOff ? (
                  <div className="simulated-feed remote-feed-graphic">
                    <img src={contact.avatarUrl} alt="" className="feed-avatar-shadow" />
                    <div className="remote-hd-badge">HD 1080p</div>
                  </div>
                ) : (
                  <div className="video-feed-placeholder">
                    <img src={contact.avatarUrl} alt="" className="caller-placeholder-avatar" />
                    <p>{contact.name}'s camera is off</p>
                  </div>
                )}
                <div className="feed-label">{contact.name}</div>
              </div>

              {/* Local Feed / Screen Share */}
              <div className="video-feed local">
                {isScreenSharing ? (
                  <div className="simulated-feed screen-share-graphic">
                    <div className="screen-share-glow" />
                    <p>Sharing your screen</p>
                  </div>
                ) : !isCameraOff ? (
                  <div className="simulated-feed local-feed-graphic" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                    <video 
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div className="video-feed-placeholder">
                    <p>Camera Off</p>
                  </div>
                )}
                <div className="feed-label">You</div>
              </div>
            </div>
            
            {/* Top overlay details */}
            <div className="video-overlay-details">
              <h3>{contact.name}</h3>
              <p>{isRinging ? 'Connecting video...' : formatDuration(duration)}</p>
            </div>
          </div>
        )}

        {/* Call Action Controls bar */}
        <div className="call-controls-bar">
          
          {/* Mute Button */}
          <button 
            className={`btn-call-action ${isMuted ? 'active' : ''}`}
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? "Unmute Mic" : "Mute Mic"}
            id="btn-call-mute"
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>

          {/* Toggle Camera (Only for video calls) */}
          {type === 'video' && (
            <button 
              className={`btn-call-action ${isCameraOff ? 'active' : ''}`}
              onClick={() => setIsCameraOff(!isCameraOff)}
              title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
              id="btn-call-camera"
            >
              {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
          )}

          {/* Screenshare (Only for video calls) */}
          {type === 'video' && (
            <button 
              className={`btn-call-action ${isScreenSharing ? 'active' : ''}`}
              onClick={() => setIsScreenSharing(!isScreenSharing)}
              title="Share Screen"
              id="btn-call-screenshare"
            >
              <ScreenShare size={20} />
            </button>
          )}

          {/* Speaker Button */}
          <button 
            className={`btn-call-action ${!isSpeakerOn ? 'active' : ''}`}
            onClick={() => setIsSpeakerOn(!isSpeakerOn)}
            title={isSpeakerOn ? "Speaker Off" : "Speaker On"}
            id="btn-call-speaker"
          >
            {isSpeakerOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>

          {/* Hang Up Button */}
          <button 
            className="btn-call-action hangup" 
            onClick={onHangup}
            title="Hang Up"
            id="btn-call-hangup"
          >
            <PhoneOff size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
