import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * usePresence — Stable Supabase Realtime presence with a short disconnect grace.
 * The grace prevents momentary channel reconnects from flashing users offline.
 */
export function usePresence(user) {
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const [profileOnlineUsers, setProfileOnlineUsers] = useState(new Set());
  const channelRef = useRef(null);
  const typingRef = useRef({ isTyping: false, typingIn: null });
  const offlineTimersRef = useRef(new Map());
  const generationRef = useRef(0);
  const userId = user?.id;

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!userId) {
      offlineTimersRef.current.forEach(timer => window.clearTimeout(timer));
      offlineTimersRef.current.clear();
      setOnlineUsers(new Map());
      return undefined;
    }

    const channel = supabase.channel('global-presence', {
      config: { presence: { key: userId } }
    });

    const cancelOffline = id => {
      const timer = offlineTimersRef.current.get(id);
      if (timer) window.clearTimeout(timer);
      offlineTimersRef.current.delete(id);
    };

    const scheduleOffline = id => {
      if (offlineTimersRef.current.has(id)) return;
      const timer = window.setTimeout(() => {
        offlineTimersRef.current.delete(id);
        if (generationRef.current !== generation) return;
        setOnlineUsers(current => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.delete(id);
          return next;
        });
      }, 2500);
      offlineTimersRef.current.set(id, timer);
    };

    const readPresenceState = () => {
      if (generationRef.current !== generation) return;
      const state = channel.presenceState();
      const observed = new Map();
      Object.entries(state).forEach(([key, presences]) => {
        if (!presences.length) return;
        const latest = presences[presences.length - 1];
        // Supabase may key presenceState by a presence reference. The UUID we
        // explicitly track in the payload is the stable identity used by chats.
        const presenceUserId = String(latest.user_id || key);
        observed.set(presenceUserId, {
          lastSeen: latest.last_seen,
          isTyping: Boolean(latest.isTyping),
          typingIn: latest.typingIn || null
        });
        cancelOffline(presenceUserId);
      });

      setOnlineUsers(current => {
        const next = new Map(current);
        observed.forEach((presence, id) => next.set(id, presence));
        current.forEach((_presence, id) => {
          if (!observed.has(id)) scheduleOffline(id);
        });
        return next;
      });
    };

    const trackCurrentPresence = async () => {
      if (!navigator.onLine || generationRef.current !== generation) return;
      await channel.track({
        user_id: userId,
        last_seen: new Date().toISOString(),
        ...typingRef.current
      });
    };

    const scheduleAllOffline = () => {
      if (generationRef.current !== generation) return;
      setOnlineUsers(current => {
        current.forEach((_presence, id) => scheduleOffline(id));
        return current;
      });
    };

    channel
      .on('presence', { event: 'sync' }, readPresenceState)
      .on('presence', { event: 'join' }, readPresenceState)
      .on('presence', { event: 'leave' }, readPresenceState)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void trackCurrentPresence();
        if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) scheduleAllOffline();
      });

    channelRef.current = channel;
    const handleConnectivity = () => {
      if (navigator.onLine) void trackCurrentPresence();
      else {
        void channel.untrack();
        scheduleAllOffline();
      }
    };
    const heartbeat = window.setInterval(handleConnectivity, 15000);
    window.addEventListener('online', handleConnectivity);
    window.addEventListener('offline', handleConnectivity);

    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener('online', handleConnectivity);
      window.removeEventListener('offline', handleConnectivity);
      if (generationRef.current === generation) generationRef.current += 1;
      offlineTimersRef.current.forEach(timer => window.clearTimeout(timer));
      offlineTimersRef.current.clear();
      void channel.untrack();
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [userId]);

  // Profile presence is a durable fallback for browsers where the Presence
  // channel is reconnecting or its initial sync is delayed. Live Presence wins:
  // a profile going offline cannot hide a still-connected Presence session.
  useEffect(() => {
    if (!userId) {
      setProfileOnlineUsers(new Set());
      return undefined;
    }

    let active = true;
    const loadProfilePresence = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, is_online')
        .eq('is_online', true);
      if (!active) return;
      if (error) {
        console.warn('Could not load profile presence fallback:', error.message);
        return;
      }
      setProfileOnlineUsers(new Set((data || []).map(profile => String(profile.id))));
    };

    void loadProfilePresence();
    const profileChannel = supabase
      .channel(`presence-profile-fallback-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles'
      }, ({ new: profile }) => {
        if (!profile?.id || !active) return;
        const id = String(profile.id);
        setProfileOnlineUsers(current => {
          const next = new Set(current);
          if (profile.is_online) next.add(id);
          else next.delete(id);
          return next;
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(profileChannel);
    };
  }, [userId]);

  const isUserOnline = useCallback(id => {
    if (!id) return false;
    const normalizedId = String(id);
    return onlineUsers.has(normalizedId) || profileOnlineUsers.has(normalizedId);
  }, [onlineUsers, profileOnlineUsers]);

  const setTyping = useCallback(async (conversationId, isTyping) => {
    if (!userId || !channelRef.current) return;
    typingRef.current = {
      isTyping,
      typingIn: isTyping ? conversationId : null
    };
    await channelRef.current.track({
      user_id: userId,
      last_seen: new Date().toISOString(),
      ...typingRef.current
    });
  }, [userId]);

  const getTypingUsers = useCallback(conversationId => {
    const typingUsers = [];
    onlineUsers.forEach((presence, id) => {
      if (presence.isTyping && presence.typingIn === conversationId && id !== userId) {
        typingUsers.push(id);
      }
    });
    return typingUsers;
  }, [onlineUsers, userId]);

  return { onlineUsers, isUserOnline, setTyping, getTypingUsers };
}