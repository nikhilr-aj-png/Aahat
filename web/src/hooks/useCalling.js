import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * useCalling — WebRTC voice/video calling with Supabase Realtime signaling.
 * Handles call initiation, answering, hanging up, and media controls.
 */

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

export function useCalling(user) {
  const [callState, setCallState] = useState(null);
  // callState shape: { callId, conversationId, contact, type: 'voice'|'video', isRinging, isIncoming, duration }

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const timerRef = useRef(null);
  const signalingChannelRef = useRef(null);

  // Clean up media streams
  const cleanupMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Create peer connection
  const createPeerConnection = useCallback(async (callId, remoteUserId, callType) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnectionRef.current = pc;

    // Get local media
    try {
      const constraints = {
        audio: true,
        video: callType === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    } catch (err) {
      console.error('Failed to get local media:', err);
    }

    // Handle remote tracks
    remoteStreamRef.current = new MediaStream();
    pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach(track => {
        remoteStreamRef.current.addTrack(track);
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await supabase.from('call_signaling').insert({
          call_id: callId,
          sender_id: user.id,
          receiver_id: remoteUserId,
          signal_type: 'ice_candidate',
          signal_data: { candidate: event.candidate.toJSON() }
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCallState(prev => prev ? { ...prev, isRinging: false } : null);
        // Start duration timer
        timerRef.current = setInterval(() => {
          setCallDuration(prev => prev + 1);
        }, 1000);
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        hangup();
      }
    };

    return pc;
  }, [user]);

  // Initiate a call
  const startCall = useCallback(async (conversation, callType = 'voice') => {
    if (!user || !conversation) return;
    if (callState) return; // Already in a call

    const remoteUserId = conversation.otherMemberId;
    if (!remoteUserId) return;

    try {
      // Create call record
      const { data: call, error } = await supabase
        .from('calls')
        .insert({
          conversation_id: conversation.id,
          initiator_id: user.id,
          call_type: callType,
          status: 'ringing'
        })
        .select()
        .single();

      if (error) throw error;

      // Add self as participant
      await supabase.from('call_participants').insert({
        call_id: call.id,
        user_id: user.id
      });

      setCallState({
        callId: call.id,
        conversationId: conversation.id,
        contact: {
          id: remoteUserId,
          name: conversation.name,
          avatarUrl: conversation.avatarUrl
        },
        type: callType,
        isRinging: true,
        isIncoming: false
      });
      setCallDuration(0);
      setIsMuted(false);
      setIsCameraOff(false);

      // Create peer connection and offer
      const pc = await createPeerConnection(call.id, remoteUserId, callType);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer via signaling
      await supabase.from('call_signaling').insert({
        call_id: call.id,
        sender_id: user.id,
        receiver_id: remoteUserId,
        signal_type: 'offer',
        signal_data: { sdp: offer.sdp, type: offer.type }
      });

    } catch (err) {
      console.error('Failed to start call:', err);
      cleanupMedia();
      setCallState(null);
    }
  }, [user, callState, createPeerConnection, cleanupMedia]);

  // Answer an incoming call
  const answerCall = useCallback(async (callId, remoteUserId, callType) => {
    if (!user || !callId) return;

    try {
      // Get the offer
      const { data: signals } = await supabase
        .from('call_signaling')
        .select('*')
        .eq('call_id', callId)
        .eq('signal_type', 'offer')
        .eq('receiver_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const offerSignal = signals?.[0];
      if (!offerSignal) return;

      const pc = await createPeerConnection(callId, remoteUserId, callType);

      // Set remote description (offer)
      await pc.setRemoteDescription(new RTCSessionDescription(offerSignal.signal_data));

      // Create answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer
      await supabase.from('call_signaling').insert({
        call_id: callId,
        sender_id: user.id,
        receiver_id: remoteUserId,
        signal_type: 'answer',
        signal_data: { sdp: answer.sdp, type: answer.type }
      });

      // Update call status
      await supabase.from('calls').update({ status: 'active' }).eq('id', callId);

      // Add self as participant
      await supabase.from('call_participants').insert({
        call_id: callId,
        user_id: user.id
      });

      // Apply any ICE candidates that arrived before answer
      const { data: iceCandidates } = await supabase
        .from('call_signaling')
        .select('*')
        .eq('call_id', callId)
        .eq('signal_type', 'ice_candidate')
        .eq('receiver_id', user.id);

      for (const ic of (iceCandidates || [])) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(ic.signal_data.candidate));
        } catch (err) {
          console.warn('Failed to add ICE candidate:', err);
        }
      }

    } catch (err) {
      console.error('Failed to answer call:', err);
      cleanupMedia();
    }
  }, [user, createPeerConnection, cleanupMedia]);

  // Hang up
  const hangup = useCallback(async () => {
    if (!callState) return;

    try {
      // Update call record
      await supabase
        .from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_seconds: callDuration
        })
        .eq('id', callState.callId);

      // Update participant
      await supabase
        .from('call_participants')
        .update({ left_at: new Date().toISOString() })
        .eq('call_id', callState.callId)
        .eq('user_id', user.id);

      // Send hangup signal
      if (callState.contact?.id) {
        await supabase.from('call_signaling').insert({
          call_id: callState.callId,
          sender_id: user.id,
          receiver_id: callState.contact.id,
          signal_type: 'hangup',
          signal_data: {}
        });
      }
    } catch (err) {
      console.warn('Error during hangup:', err);
    } finally {
      cleanupMedia();
      setCallState(null);
      setCallDuration(0);
      setIsMuted(false);
      setIsCameraOff(false);
      setIsScreenSharing(false);
    }
  }, [callState, callDuration, user, cleanupMedia]);

  const rejectCall = useCallback(async () => {
    if (!callState) return;

    await supabase.from('calls')
      .update({ status: 'rejected' })
      .eq('id', callState.callId);

    if (callState.contact?.id) {
      await supabase.from('call_signaling').insert({
        call_id: callState.callId,
        sender_id: user.id,
        receiver_id: callState.contact.id,
        signal_type: 'reject',
        signal_data: {}
      });
    }

    cleanupMedia();
    setCallState(null);
  }, [callState, user, cleanupMedia]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => {
        t.enabled = isMuted; // Toggle: if was muted, enable; if was active, disable
      });
    }
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Toggle camera
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.enabled = isCameraOff;
      });
    }
    setIsCameraOff(!isCameraOff);
  }, [isCameraOff]);

  // Toggle screen share
  const toggleScreenShare = useCallback(async () => {
    if (!peerConnectionRef.current || !localStreamRef.current) return;

    const pc = peerConnectionRef.current;

    if (isScreenSharing) {
      // Stop screen share, restore camera
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      // Restore camera track
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(videoTrack);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);

        screenTrack.onended = () => {
          toggleScreenShare(); // Auto-revert when user stops sharing
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.warn('Screen share failed:', err);
      }
    }
  }, [isScreenSharing]);

  // Listen for incoming calls via signaling
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('incoming-calls')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'call_signaling',
        filter: `receiver_id=eq.${user.id}`
      }, async (payload) => {
        const signal = payload.new;
        if (!signal) return;

        if (signal.signal_type === 'offer' && !callState) {
          // Incoming call!
          const { data: call } = await supabase
            .from('calls')
            .select('*, initiator:profiles!calls_initiator_id_fkey(id, display_name, avatar_url)')
            .eq('id', signal.call_id)
            .single();

          if (call && call.status === 'ringing') {
            setCallState({
              callId: call.id,
              conversationId: call.conversation_id,
              contact: {
                id: call.initiator?.id,
                name: call.initiator?.display_name || 'Unknown',
                avatarUrl: call.initiator?.avatar_url || ''
              },
              type: call.call_type,
              isRinging: true,
              isIncoming: true
            });
            setCallDuration(0);
          }
        } else if (signal.signal_type === 'answer') {
          // Our call was answered
          if (peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.setRemoteDescription(
                new RTCSessionDescription(signal.signal_data)
              );
            } catch (err) {
              console.error('Failed to set remote description:', err);
            }
          }
        } else if (signal.signal_type === 'ice_candidate') {
          if (peerConnectionRef.current) {
            try {
              await peerConnectionRef.current.addIceCandidate(
                new RTCIceCandidate(signal.signal_data.candidate)
              );
            } catch (err) {
              console.warn('Failed to add ICE candidate:', err);
            }
          }
        } else if (signal.signal_type === 'hangup' || signal.signal_type === 'reject') {
          cleanupMedia();
          setCallState(null);
          setCallDuration(0);
        }
      })
      .subscribe();

    signalingChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, callState, cleanupMedia]);

  return {
    callState,
    callDuration,
    isMuted,
    isCameraOff,
    isSpeakerOn,
    isScreenSharing,
    localStream: localStreamRef.current,
    remoteStream: remoteStreamRef.current,

    startCall,
    answerCall,
    hangup,
    rejectCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    setIsSpeakerOn
  };
}
