import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * usePresence — Manages user online/offline presence
 * using Supabase Realtime Presence tracking.
 */
export function usePresence(user) {
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const channelRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: user.id } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const online = new Map();
        Object.entries(state).forEach(([key, presences]) => {
          if (presences.length > 0) {
            online.set(key, {
              lastSeen: presences[0].last_seen,
              isTyping: presences[0].isTyping || false,
              typingIn: presences[0].typingIn || null
            });
          }
        });
        setOnlineUsers(online);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        setOnlineUsers(prev => {
          const updated = new Map(prev);
          if (newPresences.length > 0) {
            updated.set(key, {
              lastSeen: newPresences[0].last_seen,
              isTyping: newPresences[0].isTyping || false,
              typingIn: newPresences[0].typingIn || null
            });
          }
          return updated;
        });
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineUsers(prev => {
          const updated = new Map(prev);
          updated.delete(key);
          return updated;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            last_seen: new Date().toISOString(),
            isTyping: false,
            typingIn: null
          });
        }
      });

    channelRef.current = channel;

    // Heartbeat to keep presence alive
    const heartbeat = setInterval(async () => {
      if (channelRef.current) {
        await channelRef.current.track({
          user_id: user.id,
          last_seen: new Date().toISOString(),
          isTyping: false,
          typingIn: null
        });
      }
    }, 30000); // Every 30 seconds

    return () => {
      clearInterval(heartbeat);
      if (channelRef.current) {
        channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user]);

  const isUserOnline = useCallback((userId) => {
    return onlineUsers.has(userId);
  }, [onlineUsers]);

  const setTyping = useCallback(async (conversationId, isTyping) => {
    if (!user || !channelRef.current) return;
    await channelRef.current.track({
      user_id: user.id,
      last_seen: new Date().toISOString(),
      isTyping,
      typingIn: isTyping ? conversationId : null
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
