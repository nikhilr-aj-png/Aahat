import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

/**
 * useChannels — Handles channel registration, subscription management,
 * fetching channel posts, and publishing posts to channels.
 */
export function useChannels(user) {
  const [channels, setChannels] = useState([]);
  const [myChannels, setMyChannels] = useState([]);
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [activeChannelPosts, setActiveChannelPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchChannels = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('channels')
        .select('*')
        .eq('type', 'public')
        .order('subscriber_count', { ascending: false });

      if (error) throw error;
      setChannels(data || []);
    } catch (err) {
      console.error('Error fetching channels:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const fetchMyChannels = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('channel_members')
        .select(`
          channel_id,
          role,
          channel:channels(*)
        `)
        .eq('user_id', user.id);

      if (error) throw error;
      setMyChannels((data || []).map(m => ({
        ...(m.channel || {}),
        myRole: m.role
      })).filter(Boolean));
    } catch (err) {
      console.error('Error fetching my channels:', err);
    }
  }, [user]);

  const createChannel = useCallback(async (name, description = '', avatarUrl = '') => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('channels')
        .insert({
          name,
          description,
          avatar_url: avatarUrl,
          created_by: user.id,
          type: 'public',
          subscriber_count: 1
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as admin member
      await supabase
        .from('channel_members')
        .insert({
          channel_id: data.id,
          user_id: user.id,
          role: 'admin'
        });

      await fetchMyChannels();
      await fetchChannels();
      return data;
    } catch (err) {
      console.error('Error creating channel:', err);
      throw err;
    }
  }, [user, fetchChannels, fetchMyChannels]);

  const subscribeToChannel = useCallback(async (channelId) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('channel_members')
        .insert({
          channel_id: channelId,
          user_id: user.id,
          role: 'subscriber'
        });

      if (error) throw error;


      await fetchMyChannels();
      await fetchChannels();
    } catch (err) {
      console.error('Error subscribing to channel:', err);
    }
  }, [user, fetchChannels, fetchMyChannels]);

  const unsubscribeFromChannel = useCallback(async (channelId) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('channel_id', channelId)
        .eq('user_id', user.id);

      if (error) throw error;


      await fetchMyChannels();
      await fetchChannels();
    } catch (err) {
      console.error('Error unsubscribing from channel:', err);
    }
  }, [user, fetchChannels, fetchMyChannels]);

  const fetchChannelPosts = useCallback(async (channelId) => {
    if (!user || !channelId) return;
    try {
      const { data, error } = await supabase
        .from('channel_posts')
        .select(`
          *,
          author:profiles(id, display_name, avatar_url)
        `)
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setActiveChannelPosts(data || []);
    } catch (err) {
      console.error('Error fetching channel posts:', err);
    }
  }, [user]);

  const createChannelPost = useCallback(async (channelId, content, mediaUrl = null, mediaType = null) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('channel_posts')
        .insert({
          channel_id: channelId,
          author_id: user.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType
        })
        .select()
        .single();

      if (error) throw error;
      await fetchChannelPosts(channelId);
      return data;
    } catch (err) {
      console.error('Error creating channel post:', err);
      throw err;
    }
  }, [user, fetchChannelPosts]);

  // Load initial lists
  useEffect(() => {
    if (user) {
      fetchChannels();
      fetchMyChannels();
    }
  }, [user, fetchChannels, fetchMyChannels]);

  // Real-time listener for active channel posts
  useEffect(() => {
    if (!user || !activeChannelId) return;

    fetchChannelPosts(activeChannelId);

    const channel = supabase
      .channel(`channel-posts-${activeChannelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'channel_posts',
        filter: `channel_id=eq.${activeChannelId}`
      }, () => {
        fetchChannelPosts(activeChannelId);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, activeChannelId, fetchChannelPosts]);

  return {
    channels,
    myChannels,
    activeChannelId,
    activeChannelPosts,
    isLoading,
    setActiveChannelId,
    createChannel,
    subscribeToChannel,
    unsubscribeFromChannel,
    createChannelPost,
    refetchChannels: fetchChannels,
    refetchMyChannels: fetchMyChannels
  };
}
