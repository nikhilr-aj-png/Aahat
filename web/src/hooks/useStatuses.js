import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';

/**
 * useStatuses — Manages stories/status with dedicated database table,
 * 24-hour expiration, view tracking, and privacy controls.
 */
export function useStatuses(user) {
  const [statuses, setStatuses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatuses = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch active (non-expired) statuses with user info
      const { data, error } = await supabase
        .from('statuses')
        .select(`
          *,
          user:profiles!statuses_user_id_fkey(id, display_name, avatar_url),
          views:status_views(id, viewer_id, viewed_at)
        `)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStatuses(data || []);
    } catch (err) {
      console.error('Error fetching statuses:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchStatuses();
  }, [user, fetchStatuses]);

  // Real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('statuses-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () => {
        fetchStatuses();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, fetchStatuses]);

  // My statuses
  const myStatuses = useMemo(() => {
    return statuses.filter(s => s.user_id === user?.id);
  }, [statuses, user]);

  // Other users' statuses grouped by user
  const otherStatuses = useMemo(() => {
    const grouped = {};
    statuses
      .filter(s => s.user_id !== user?.id)
      .forEach(s => {
        if (!grouped[s.user_id]) {
          grouped[s.user_id] = {
            userId: s.user_id,
            userName: s.user?.display_name || 'Unknown',
            userAvatar: s.user?.avatar_url || '',
            statuses: []
          };
        }
        grouped[s.user_id].statuses.push(s);
      });
    return Object.values(grouped);
  }, [statuses, user]);

  // Post a new status
  const postStatus = useCallback(async (type, content, bgGradient = null, mediaUrl = null, privacy = 'contacts') => {
    if (!user) return;

    const { data, error } = await supabase
      .from('statuses')
      .insert({
        user_id: user.id,
        type,
        content: type === 'text' ? content : null,
        media_url: type !== 'text' ? (mediaUrl || content) : null,
        bg_gradient: bgGradient,
        privacy,
      })
      .select()
      .single();

    if (error) throw error;
    await fetchStatuses();
    return data;
  }, [user, fetchStatuses]);

  // Mark a status as viewed
  const viewStatus = useCallback(async (statusId) => {
    if (!user) return;

    // Check if already viewed
    const status = statuses.find(s => s.id === statusId);
    if (!status) return;
    if (status.user_id === user.id) return; // Don't track own views

    const alreadyViewed = (status.views || []).some(v => v.viewer_id === user.id);
    if (alreadyViewed) return;

    await supabase.from('status_views').insert({
      status_id: statusId,
      viewer_id: user.id
    });

  }, [user, statuses]);

  // Delete a status
  const deleteStatus = useCallback(async (statusId) => {
    if (!user) return;
    await supabase
      .from('statuses')
      .delete()
      .eq('id', statusId)
      .eq('user_id', user.id);

    setStatuses(prev => prev.filter(s => s.id !== statusId));
  }, [user]);

  return {
    statuses,
    myStatuses,
    otherStatuses,
    isLoading,
    postStatus,
    viewStatus,
    deleteStatus,
    refetch: fetchStatuses
  };
}
