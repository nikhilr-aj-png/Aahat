import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

/**
 * Realtime Presence is authoritative for connectivity. Privacy permissions are
 * loaded through a recipient-scoped RPC, so hidden activity never reaches UI.
 */
export function usePresence(user, profile, contactIds = []) {
  const [onlineUsers, setOnlineUsers] = useState(new Map());
  const [activityVisibility, setActivityVisibility] = useState(new Map());
  const channelRef = useRef(null);
  const typingRef = useRef({ isTyping: false, typingIn: null });
  const offlineTimersRef = useRef(new Map());
  const generationRef = useRef(0);
  const userId = user?.id;
  const onlineSharingEnabled = profile?.privacy_settings?.online !== false;
  const contactIdsKey = [...new Set((contactIds || []).filter(Boolean).map(String))].sort().join(',');

  useEffect(() => {
    const generation = ++generationRef.current;
    if (!userId || !onlineSharingEnabled) {
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
      if (!navigator.onLine || document.visibilityState !== 'visible' || generationRef.current !== generation) return;
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
      if (navigator.onLine && document.visibilityState === 'visible') {
        void trackCurrentPresence();
      } else {
        void channel.untrack();
        scheduleAllOffline();
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
      if (generationRef.current === generation) generationRef.current += 1;
      offlineTimersRef.current.forEach(timer => window.clearTimeout(timer));
      offlineTimersRef.current.clear();
      void channel.untrack();
      supabase.removeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [onlineSharingEnabled, userId]);

  useEffect(() => {
    if (!userId || !contactIdsKey) {
      setActivityVisibility(new Map());
      return undefined;
    }
    let active = true;
    const ids = contactIdsKey.split(',');
    const refreshVisibility = async () => {
      const { data, error } = await supabase.rpc('get_visible_contact_activity', { p_user_ids: ids });
      if (!active) return;
      if (error) {
        console.warn('Could not load activity privacy:', error.message);
        setActivityVisibility(new Map());
        return;
      }
      setActivityVisibility(new Map((data || []).map(row => [String(row.user_id), row])));
    };
    void refreshVisibility();
    const channel = supabase.channel(`activity-privacy-${userId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => void refreshVisibility())
      .subscribe();
    const poll = window.setInterval(refreshVisibility, 15000);
    const handleFocus = () => void refreshVisibility();
    window.addEventListener('focus', handleFocus);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [contactIdsKey, userId]);

  const canViewOnlineStatus = useCallback(id => {
    if (!id) return false;
    return activityVisibility.get(String(id))?.show_online === true;
  }, [activityVisibility]);

  const isUserOnline = useCallback(id => {
    if (!id) return false;
    const normalizedId = String(id);
    return canViewOnlineStatus(normalizedId) && onlineUsers.has(normalizedId);
  }, [canViewOnlineStatus, onlineUsers]);

  const getLastSeen = useCallback(id => {
    if (!id) return null;
    const visible = activityVisibility.get(String(id));
    return visible?.show_last_seen === true ? visible.last_seen || null : null;
  }, [activityVisibility]);

  const setTyping = useCallback(async (conversationId, isTyping) => {
    if (!userId || !channelRef.current) return;
    typingRef.current = { isTyping, typingIn: isTyping ? conversationId : null };
    await channelRef.current.track({
      user_id: userId,
      last_seen: new Date().toISOString(),
      ...typingRef.current
    });
  }, [userId]);

  const getTypingUsers = useCallback(conversationId => {
    const typingUsers = [];
    onlineUsers.forEach((presence, id) => {
      if (presence.isTyping && presence.typingIn === conversationId && id !== userId && isUserOnline(id)) {
        typingUsers.push(id);
      }
    });
    return typingUsers;
  }, [isUserOnline, onlineUsers, userId]);

  return { onlineUsers, canViewOnlineStatus, isUserOnline, getLastSeen, setTyping, getTypingUsers };
}
