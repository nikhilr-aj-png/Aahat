import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const CLOUDFLARE_STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const LIVE_STATES = new Set(['calling', 'ringing', 'connecting', 'connected', 'disconnected']);
const TERMINAL_STATES = new Set(['rejected', 'missed', 'failed', 'ended', 'busy']);
const RING_TIMEOUT_MS = 45_000;
const DISCONNECT_GRACE_MS = 8_000;

const normalizeCall = (call, contact, incoming) => ({
  callId: call.id,
  conversationId: call.conversation_id,
  contact,
  type: call.type,
  status: call.status || 'ringing',
  isIncoming: incoming,
  isRinging: ['calling', 'ringing'].includes(call.status || 'ringing'),
});

export function useCallingSecure(user) {
  const [callState, setCallState] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [callError, setCallError] = useState('');
  const [remoteMediaState, setRemoteMediaState] = useState({ muted: false, cameraOff: false });

  const callStateRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const callChannelRef = useRef(null);
  const userChannelRef = useRef(null);
  const pendingOfferRef = useRef(null);
  const pendingIceRef = useRef([]);
  const answerPendingRef = useRef(false);
  const offerSentRef = useRef(false);
  const timerRef = useRef(null);
  const ringTimeoutRef = useRef(null);
  const handshakeTimerRef = useRef(null);
  const disconnectTimeoutRef = useRef(null);
  const restartAttemptsRef = useRef(0);
  const facingModeRef = useRef('user');
  const signalHandlerRef = useRef(null);

  const updateLocalCall = useCallback(updater => {
    const next = typeof updater === 'function' ? updater(callStateRef.current) : updater;
    callStateRef.current = next;
    setCallState(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (ringTimeoutRef.current) window.clearTimeout(ringTimeoutRef.current);
    if (disconnectTimeoutRef.current) window.clearTimeout(disconnectTimeoutRef.current);
    timerRef.current = null;
    if (handshakeTimerRef.current) window.clearInterval(handshakeTimerRef.current);
    ringTimeoutRef.current = null;
    disconnectTimeoutRef.current = null;
    handshakeTimerRef.current = null;
  }, []);

  const cleanupTransport = useCallback(() => {
    clearTimers();
    if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
    }
    if (callChannelRef.current) supabase.removeChannel(callChannelRef.current);
    screenStreamRef.current = null;
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    peerConnectionRef.current = null;
    callChannelRef.current = null;
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    answerPendingRef.current = false;
    offerSentRef.current = false;
    restartAttemptsRef.current = 0;
    setLocalStream(null);
    setRemoteStream(null);
    setIsScreenSharing(false);
  }, [clearTimers]);

  const resetCallUi = useCallback((error = '') => {
    cleanupTransport();
    updateLocalCall(null);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOn(false);
    setRemoteMediaState({ muted: false, cameraOff: false });
    if (error) setCallError(error);
  }, [cleanupTransport, updateLocalCall]);

  const setDurableStatus = useCallback(async (callId, status) => {
    const { error } = await supabase.rpc('set_call_status', { p_call_id: callId, p_status: status });
    if (error) console.warn(`Could not persist call state ${status}:`, error.message);
  }, []);

  const getIceServers = useCallback(async () => {
    if (import.meta.env.VITE_ENABLE_CLOUDFLARE_TURN !== 'true') return CLOUDFLARE_STUN;
    const { data, error } = await supabase.functions.invoke('rtc-credentials', { body: {} });
    if (error || !Array.isArray(data?.iceServers) || !data.iceServers.length) {
      console.warn('TURN credentials unavailable; continuing with Cloudflare STUN only.', error?.message || data?.error || 'No ICE servers');
      return CLOUDFLARE_STUN;
    }
    const hasCloudflareStun = data.iceServers.some(server => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      return urls.includes('stun:stun.cloudflare.com:3478');
    });
    return hasCloudflareStun ? data.iceServers : [...CLOUDFLARE_STUN, ...data.iceServers];
  }, []);

  const sendCallEvent = useCallback(async (kind, payload = {}) => {
    const channel = callChannelRef.current;
    const current = callStateRef.current;
    if (!channel || !current?.callId) return false;
    const result = await channel.send({
      type: 'broadcast',
      event: 'call-event',
      payload: { kind, callId: current.callId, senderId: user?.id, ...payload },
    });
    return result === 'ok';
  }, [user?.id]);

  const subscribeToCall = useCallback(async callId => {
    if (callChannelRef.current?.topic === `realtime:call:${callId}`) return callChannelRef.current;
    if (callChannelRef.current) await supabase.removeChannel(callChannelRef.current);
    await supabase.realtime.setAuth();
    const channel = supabase
      .channel(`call:${callId}`, { config: { private: true, broadcast: { ack: true, self: false } } })
      .on('broadcast', { event: 'call-event' }, message => signalHandlerRef.current?.(message.payload))
      .on('broadcast', { event: 'state' }, message => signalHandlerRef.current?.({ kind: 'state', ...message.payload }));
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('Call signaling connection timed out.')), 10_000);
      channel.subscribe(status => {
        if (status === 'SUBSCRIBED') { window.clearTimeout(timeout); resolve(); }
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          window.clearTimeout(timeout);
          reject(new Error('Private call signaling is unavailable.'));
        }
      });
    });
    callChannelRef.current = channel;
    return channel;
  }, []);

  const createPeerConnection = useCallback(async (remoteUserId, callType) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      throw new Error('This browser does not support secure WebRTC calling.');
    }
    const iceServers = await getIceServers();
    const pc = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 6 });
    peerConnectionRef.current = pc;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: callType === 'video'
          ? { facingMode: facingModeRef.current, width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    } catch (error) {
      pc.close();
      peerConnectionRef.current = null;
      throw new Error(`Camera or microphone permission failed: ${error.message}`, { cause: error });
    }

    const incomingStream = new MediaStream();
    remoteStreamRef.current = incomingStream;
    setRemoteStream(incomingStream);
    pc.ontrack = event => {
      const tracks = event.streams[0]?.getTracks() || [event.track];
      tracks.forEach(track => {
        if (!incomingStream.getTracks().some(existing => existing.id === track.id)) incomingStream.addTrack(track);
      });
      setRemoteStream(new MediaStream(incomingStream.getTracks()));
    };
    pc.onicecandidate = event => {
      if (event.candidate) sendCallEvent('ice', { candidate: event.candidate.toJSON(), receiverId: remoteUserId })
        .catch(error => console.warn('ICE candidate broadcast failed:', error));
    };
    pc.onconnectionstatechange = () => {
      const current = callStateRef.current;
      if (!current) return;
      if (pc.connectionState === 'connected') {
        clearTimers();
        restartAttemptsRef.current = 0;
        updateLocalCall(state => state ? { ...state, status: 'connected', isRinging: false } : null);
        if (!timerRef.current) timerRef.current = window.setInterval(() => setCallDuration(value => value + 1), 1000);
        setDurableStatus(current.callId, 'connected');
      } else if (pc.connectionState === 'disconnected') {
        updateLocalCall(state => state ? { ...state, status: 'disconnected', isRinging: false } : null);
        setDurableStatus(current.callId, 'disconnected');
        if (disconnectTimeoutRef.current) window.clearTimeout(disconnectTimeoutRef.current);
        disconnectTimeoutRef.current = window.setTimeout(() => {
          if (peerConnectionRef.current?.connectionState === 'disconnected') signalHandlerRef.current?.({ kind: 'restart-request', callId: current.callId });
        }, DISCONNECT_GRACE_MS);
      } else if (pc.connectionState === 'failed') {
        signalHandlerRef.current?.({ kind: 'restart-request', callId: current.callId });
      }
    };
    return pc;
  }, [clearTimers, getIceServers, sendCallEvent, setDurableStatus, updateLocalCall]);

  const flushPendingIce = useCallback(async pc => {
    if (!pc.remoteDescription) return;
    const queued = pendingIceRef.current.splice(0);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); }
      catch (error) { console.warn('Queued ICE candidate failed:', error); }
    }
  }, []);

  const makeOffer = useCallback(async (iceRestart = false) => {
    const current = callStateRef.current;
    if (!current || current.isIncoming) return;
    if (offerSentRef.current && !iceRestart) return;
    const pc = await createPeerConnection(current.contact.id, current.type);
    if (iceRestart) {
      const iceServers = await getIceServers();
      pc.setConfiguration({ ...pc.getConfiguration(), iceServers });
      pc.restartIce();
    }
    const offer = await pc.createOffer({ iceRestart });
    await pc.setLocalDescription(offer);
    offerSentRef.current = true;
    updateLocalCall(state => state ? { ...state, status: 'connecting', isRinging: false } : null);
    await sendCallEvent('offer', { description: pc.localDescription.toJSON(), iceRestart });
    await setDurableStatus(current.callId, 'connecting');
  }, [createPeerConnection, getIceServers, sendCallEvent, setDurableStatus, updateLocalCall]);

  const completeAnswer = useCallback(async () => {
    const current = callStateRef.current;
    const offer = pendingOfferRef.current;
    if (!current || !current.isIncoming || !offer || !answerPendingRef.current) return;
    const pc = await createPeerConnection(current.contact.id, current.type);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    pendingOfferRef.current = null;
    await flushPendingIce(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendCallEvent('answer', { description: pc.localDescription.toJSON() });
    await setDurableStatus(current.callId, 'connecting');
  }, [createPeerConnection, flushPendingIce, sendCallEvent, setDurableStatus]);

  const restartIce = useCallback(async () => {
    const current = callStateRef.current;
    if (!current || !LIVE_STATES.has(current.status)) return;
    if (restartAttemptsRef.current >= 2) {
      await setDurableStatus(current.callId, 'failed');
      await sendCallEvent('hangup', { reason: 'ice_failed' });
      resetCallUi('The call failed after the network connection changed.');
      return;
    }
    restartAttemptsRef.current += 1;
    updateLocalCall(state => state ? { ...state, status: 'connecting', isRinging: false } : null);
    if (current.isIncoming) await sendCallEvent('restart-request');
    else await makeOffer(true);
  }, [makeOffer, resetCallUi, sendCallEvent, setDurableStatus, updateLocalCall]);

  signalHandlerRef.current = async signal => {
    const current = callStateRef.current;
    if (!signal || !current || signal.callId !== current.callId || signal.senderId === user?.id) return;
    try {
      if (signal.kind === 'ready' && !current.isIncoming) {
        if (handshakeTimerRef.current) window.clearInterval(handshakeTimerRef.current);
        handshakeTimerRef.current = null;
        await makeOffer(false);
      } else if (signal.kind === 'probe' && current.isIncoming) {
        await sendCallEvent('ready');
      } else if (signal.kind === 'offer' && current.isIncoming) {
        pendingOfferRef.current = signal.description;
        if (answerPendingRef.current) await completeAnswer();
      } else if (signal.kind === 'answer' && !current.isIncoming && peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal.description));
        await flushPendingIce(peerConnectionRef.current);
      } else if (signal.kind === 'accept' && !current.isIncoming) {
        updateLocalCall(state => state ? { ...state, status: 'connecting', isRinging: false } : null);
      } else if (signal.kind === 'ice' && signal.candidate) {
        const pc = peerConnectionRef.current;
        if (!pc?.remoteDescription) pendingIceRef.current.push(signal.candidate);
        else await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else if (signal.kind === 'media-state') {
        setRemoteMediaState({ muted: Boolean(signal.muted), cameraOff: Boolean(signal.cameraOff) });
      } else if (signal.kind === 'restart-request') {
        if (!current.isIncoming) await restartIce();
      } else if (signal.kind === 'hangup' || signal.kind === 'reject') {
        const message = signal.kind === 'reject' ? 'Call declined.' : signal.reason === 'no_answer' ? 'No answer.' : '';
        resetCallUi(message);
      } else if (signal.kind === 'ringing' && !current.isIncoming) {
        updateLocalCall(state => state ? { ...state, status: 'ringing', isRinging: true } : null);
      } else if (signal.kind === 'state' && TERMINAL_STATES.has(signal.status)) {
        const messages = { rejected: 'Call declined.', missed: 'No answer.', busy: 'User is busy.', failed: 'Call failed.' };
        resetCallUi(messages[signal.status] || '');
      }
    } catch (error) {
      console.error('Call signaling event failed:', error);
      setCallError(error.message || 'Call signaling failed.');
    }
  };

  const loadContact = useCallback(async userId => {
    const { data } = await supabase.from('profiles').select('id,display_name,avatar_url').eq('id', userId).maybeSingle();
    return { id: userId, name: data?.display_name || 'Unknown', avatarUrl: data?.avatar_url || '' };
  }, []);

  const receiveInvitation = useCallback(async invite => {
    if (!invite?.callId || invite.receiverId !== user?.id) return;
    if (callStateRef.current) {
      await supabase.rpc('set_call_status', { p_call_id: invite.callId, p_status: 'busy' });
      return;
    }
    const contact = await loadContact(invite.callerId);
    const call = { id: invite.callId, conversation_id: invite.conversationId, type: invite.type, status: invite.status || 'ringing' };
    updateLocalCall(normalizeCall(call, contact, true));
    setCallDuration(0);
    setCallError('');
    setIsSpeakerOn(invite.type === 'video');
    await subscribeToCall(invite.callId);
    await sendCallEvent('ready');
    await sendCallEvent('ringing');
  }, [loadContact, sendCallEvent, subscribeToCall, updateLocalCall, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let disposed = false;
    let channel = null;
    const logBackgroundReconnect = status => {
      console.warn(`Incoming call channel ${String(status).toLowerCase()}; Supabase will retry in the background.`);
    };

    const connect = async () => {
      await supabase.realtime.setAuth();
      if (disposed) return;
      channel = supabase
        .channel(`call:user:${user.id}`, { config: { private: true, broadcast: { ack: true, self: false } } })
        .on('broadcast', { event: 'invite' }, message => receiveInvitation(message.payload).catch(error => setCallError(error.message)));
      userChannelRef.current = channel;
      channel.subscribe(status => {
        if (disposed || userChannelRef.current !== channel) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') logBackgroundReconnect(status);
      });
    };
    connect().catch(error => {
      if (!disposed) logBackgroundReconnect(error.message || 'connection failed');
    });
    return () => {
      disposed = true;
      if (channel) supabase.removeChannel(channel);
      if (userChannelRef.current === channel) userChannelRef.current = null;
    };
  }, [receiveInvitation, user?.id]);

  useEffect(() => {
    if (!user || callStateRef.current) return undefined;
    let cancelled = false;
    const restore = async () => {
      const cutoff = new Date(Date.now() - 60_000).toISOString();
      const { data: call } = await supabase.from('calls').select('*')
        .eq('receiver_id', user.id).in('status', ['calling', 'ringing'])
        .gte('started_at', cutoff).order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (cancelled || !call) return;
      await receiveInvitation({
        callId: call.id, conversationId: call.conversation_id, callerId: call.caller_id,
        receiverId: call.receiver_id, type: call.type, status: call.status,
      });
    };
    restore().catch(error => console.warn('Could not restore incoming call:', error));
    return () => { cancelled = true; };
  }, [receiveInvitation, user]);

  const startCall = useCallback(async (conversation, callType = 'voice') => {
    if (!user || !conversation?.otherMemberId || callStateRef.current) {
      if (callStateRef.current) setCallError('Finish the current call before starting another.');
      return;
    }
    setCallError('');
    const { data, error } = await supabase.rpc('start_direct_call', {
      p_conversation_id: conversation.id,
      p_receiver_id: conversation.otherMemberId,
      p_type: callType,
    });
    if (error) { setCallError(error.message || 'Could not start the call.'); return; }
    const call = Array.isArray(data) ? data[0] : data;
    const next = normalizeCall(call, {
      id: conversation.otherMemberId,
      name: conversation.name,
      avatarUrl: conversation.avatarUrl,
    }, false);
    updateLocalCall(next);
    setCallDuration(0);
    setIsMuted(false);
    setIsCameraOff(false);
    setIsSpeakerOn(callType === 'video');
    try {
      await subscribeToCall(call.id);
      await createPeerConnection(conversation.otherMemberId, callType);
      await sendCallEvent('probe');
    } catch (error) {
      await setDurableStatus(call.id, 'failed');
      resetCallUi(error.message || 'Could not access the microphone or camera.');
      return;
    }
    handshakeTimerRef.current = window.setInterval(() => {
      if (offerSentRef.current) { window.clearInterval(handshakeTimerRef.current); handshakeTimerRef.current = null; return; }
      sendCallEvent('probe').catch(() => undefined);
    }, 1_000);
    ringTimeoutRef.current = window.setTimeout(async () => {
      const active = callStateRef.current;
      if (!active || active.callId !== call.id || !active.isRinging) return;
      await sendCallEvent('hangup', { reason: 'no_answer' });
      await setDurableStatus(call.id, 'missed');
      resetCallUi('No answer. The call ended.');
    }, RING_TIMEOUT_MS);
  }, [createPeerConnection, resetCallUi, sendCallEvent, setDurableStatus, subscribeToCall, updateLocalCall, user]);

  const answerCall = useCallback(async () => {
    const current = callStateRef.current;
    if (!current?.isIncoming) return;
    try {
      await createPeerConnection(current.contact.id, current.type);
      answerPendingRef.current = true;
      updateLocalCall(state => state ? { ...state, status: 'connecting', isRinging: false } : null);
      await sendCallEvent('accept');
      await setDurableStatus(current.callId, 'connecting');
      if (pendingOfferRef.current) await completeAnswer();
      else await sendCallEvent('ready');
    } catch (error) {
      await setDurableStatus(current.callId, 'failed');
      resetCallUi(error.message || 'Could not access the microphone or camera.');
    }
  }, [completeAnswer, createPeerConnection, resetCallUi, sendCallEvent, setDurableStatus, updateLocalCall]);

  const hangup = useCallback(async () => {
    const current = callStateRef.current;
    if (!current) return;
    await sendCallEvent('hangup', { reason: 'ended' });
    await setDurableStatus(current.callId, 'ended');
    resetCallUi();
  }, [resetCallUi, sendCallEvent, setDurableStatus]);

  const rejectCall = useCallback(async () => {
    const current = callStateRef.current;
    if (!current) return;
    await sendCallEvent('reject');
    await setDurableStatus(current.callId, 'rejected');
    resetCallUi();
  }, [resetCallUi, sendCallEvent, setDurableStatus]);

  const toggleMute = useCallback(() => {
    const next = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setIsMuted(next);
    sendCallEvent('media-state', { muted: next, cameraOff: isCameraOff }).catch(() => undefined);
  }, [isCameraOff, isMuted, sendCallEvent]);

  const toggleCamera = useCallback(() => {
    const next = !isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach(track => { track.enabled = !next; });
    setIsCameraOff(next);
    sendCallEvent('media-state', { muted: isMuted, cameraOff: next }).catch(() => undefined);
  }, [isCameraOff, isMuted, sendCallEvent]);

  const switchCamera = useCallback(async () => {
    const current = callStateRef.current;
    const pc = peerConnectionRef.current;
    if (!current || current.type !== 'video' || !pc) return;
    const nextFacing = facingModeRef.current === 'user' ? 'environment' : 'user';
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: nextFacing } }, audio: false });
    const nextTrack = stream.getVideoTracks()[0];
    const sender = pc.getSenders().find(item => item.track?.kind === 'video');
    if (!sender || !nextTrack) { stream.getTracks().forEach(track => track.stop()); return; }
    await sender.replaceTrack(nextTrack);
    localStreamRef.current?.getVideoTracks().forEach(track => track.stop());
    const audioTracks = localStreamRef.current?.getAudioTracks() || [];
    const nextStream = new MediaStream([...audioTracks, nextTrack]);
    localStreamRef.current = nextStream;
    facingModeRef.current = nextFacing;
    setLocalStream(nextStream);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc || !localStreamRef.current) return;
    const sender = pc.getSenders().find(item => item.track?.kind === 'video');
    if (!sender) { setCallError('Screen sharing requires a video call.'); return; }
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      if (cameraTrack) await sender.replaceTrack(cameraTrack);
      setIsScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      screenStreamRef.current = stream;
      await sender.replaceTrack(track);
      track.onended = () => {
        const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
        if (cameraTrack) sender.replaceTrack(cameraTrack);
        screenStreamRef.current = null;
        setIsScreenSharing(false);
      };
      setIsScreenSharing(true);
    } catch (error) {
      if (error.name !== 'NotAllowedError') setCallError(error.message || 'Screen sharing failed.');
    }
  }, [isScreenSharing]);

  useEffect(() => {
    const handleOnline = () => {
      if (callStateRef.current && peerConnectionRef.current?.connectionState !== 'connected') restartIce().catch(() => undefined);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [restartIce]);

  useEffect(() => () => cleanupTransport(), [cleanupTransport]);

  return {
    callState, callDuration, isMuted, isCameraOff, isSpeakerOn, isScreenSharing,
    localStream, remoteStream, remoteMediaState, callError,
    clearCallError: () => setCallError(''),
    startCall, answerCall, hangup, rejectCall, toggleMute, toggleCamera,
    switchCamera, toggleScreenShare, setIsSpeakerOn,
  };
}
