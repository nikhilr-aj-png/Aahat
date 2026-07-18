import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * usePresence — Manages user online/offline presence
 * using Supabase Realtime Presence tracking.
 */
export function usePresence(user) {
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const channelRef = useRef(null);
  const typingRef = useRef({ isTyping: false, typingIn: null });

  useEffect(() => {
    if (!user) return undefined;

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: user.id } }
    });

    const readPresenceState = () => {
      const state = channel.presenceState();
      const online = new Map();
      Object.entries(state).forEach(([key, presences]) => {
        if (presences.length > 0) {
          const latest = presences[presences.length - 1];
          online.set(key, {
            lastSeen: latest.last_seen,
            isTyping: Boolean(latest.isTyping),
            typingIn: latest.typingIn || null
          });
        }
      });
      setOnlineUsers(online);
    };

    const trackCurrentPresence = async () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      await channel.track({
        user_id: user.id,
        last_seen: new Date().toISOString(),
        ...typingRef.current
      });
    };

    channel
      .on('presence', { event: 'sync' }, readPresenceState)
      .on('presence', { event: 'join' }, readPresenceState)
      .on('presence', { event: 'leave' }, readPresenceState)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void trackCurrentPresence();
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setOnlineUsers(new Map());
      });

    channelRef.current = channel;
    const handleConnectivity = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void trackCurrentPresence();
      } else {
        void channel.untrack();
      }
    };
    const heartbeat = window.setInterval(handleConnectivity, 15000);
    document.addEventListener('visibilitychange', handleConnectivity);
    window.addEventListener('online', handleConnectivity);
    window.addEventListener('offline', handleConnectivity);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', handleConnectivity);
      window.removeEventListener('online', handleConnectivity);
      window.removeEventListener('offline', handleConnectivity);
      void channel.untrack();
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
      setOnlineUsers(new Map());
    };
  }, [user]);
  const isUserOnline = useCallback((userId) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  const setTyping = useCallback(async (conversationId, isTyping) => {
    if (!user || !channelRef.current) return;
    typingRef.current = {
      isTyping,
      typingIn: isTyping ? conversationId : null
    };
    await channelRef.current.track({
      user_id: user.id,
      last_seen: new Date().toISOString(),
      ...typingRef.current
    });
  }, [user]);

  const getTypingUsers = useCallback((conversationId) => {
    const typingUsers = [];
    onlineUsers.forEach((presence, userId) => {
      if (presence.isTyping && presence.typingIn === conversationId && userId !== user?.id) {
        typingUsers.push(userId);
      }
    });
    return typingUsers;
  }, [onlineUsers, user]);

  return {
    onlineUsers,
    isUserOnline,
    setTyping,
    getTypingUsers
  };
}
