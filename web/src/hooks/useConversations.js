import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';

/**
 * useConversations — Manages conversations (direct, group, self),
 * members, and conversation-level state (unread, mute, pin, archive).
 */
export function useConversations(user) {
  const [conversations, setConversations] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch all conversations with member info and latest message
  const fetchConversations = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get all conversations the user is a member of
      const { data: memberRows, error: memErr } = await supabase
        .from('conversation_members')
        .select(`
          *,
          conversation:conversations(
            id, type, name, description, avatar_url, created_by, invite_code, created_at
          )
        `)
        .eq('user_id', user.id);

      if (memErr) throw memErr;

      // Get all profiles for resolving names/avatars
      const { data: allProfiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, bio, is_online, last_seen, virtual_number');

      const profileMap = {};
      (allProfiles || []).forEach(p => { profileMap[p.id] = p; });

      // For each conversation, resolve the display info
      const enrichedConversations = await Promise.all(
        (memberRows || []).map(async (memberRow) => {
          const conv = memberRow.conversation;
          if (!conv) return null;

          let displayName = conv.name || '';
          let displayAvatar = conv.avatar_url || '';
          let displayBio = conv.description || '';
          let otherMember = null;
          let isOtherOnline = false;
          let otherLastSeen = '';
          let memberCount = 0;

          if (conv.type === 'direct') {
            // Get the other member's profile
            const { data: members } = await supabase
              .from('conversation_members')
              .select('user_id')
              .eq('conversation_id', conv.id);

            const otherId = (members || []).find(m => m.user_id !== user.id)?.user_id;
            otherMember = otherId ? profileMap[otherId] : null;

            if (otherMember) {
              displayName = otherMember.display_name;
              displayAvatar = otherMember.avatar_url || '';
              displayBio = otherMember.bio || '';
              isOtherOnline = otherMember.is_online;
              otherLastSeen = otherMember.last_seen;
            }
            memberCount = 2;
          } else if (conv.type === 'self') {
            const myProfile = profileMap[user.id];
            displayName = `${myProfile?.display_name || 'You'} (You)`;
            displayAvatar = myProfile?.avatar_url || '';
            displayBio = myProfile?.bio || 'Your personal notes and reminders.';
            isOtherOnline = true;
            memberCount = 1;
          } else if (conv.type === 'group') {
            const { count } = await supabase
              .from('conversation_members')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conv.id);
            memberCount = count || 0;
          }

          // Get latest message for preview
          const { data: latestMsgs } = await supabase
            .from('messages')
            .select('id, content, message_type, attachment_url, sender_id, created_at, is_deleted_for_everyone')
            .eq('conversation_id', conv.id)
            .eq('is_deleted_for_everyone', false)
            .order('created_at', { ascending: false })
            .limit(1);

          const latestMsg = latestMsgs?.[0];
          let previewText = '';
          let previewTime = '';

          if (latestMsg) {
            const senderProfile = profileMap[latestMsg.sender_id];
            const senderName = latestMsg.sender_id === user.id
              ? 'You'
              : (senderProfile?.display_name?.split(' ')[0] || 'Unknown');

            if (latestMsg.message_type === 'system') {
              previewText = latestMsg.content;
            } else if (latestMsg.message_type === 'image') {
              previewText = conv.type === 'group' ? `${senderName}: 📷 Photo` : '📷 Photo';
            } else if (latestMsg.message_type === 'video') {
              previewText = conv.type === 'group' ? `${senderName}: 🎥 Video` : '🎥 Video';
            } else if (latestMsg.message_type === 'voice_note' || latestMsg.message_type === 'audio') {
              previewText = conv.type === 'group' ? `${senderName}: 🎵 Voice note` : '🎵 Voice note';
            } else if (latestMsg.message_type === 'file') {
              previewText = conv.type === 'group' ? `${senderName}: 📄 Document` : '📄 Document';
            } else {
              previewText = conv.type === 'group'
                ? `${senderName}: ${latestMsg.content}`
                : latestMsg.content;
            }

            const msgDate = new Date(latestMsg.created_at);
            const today = new Date();
            if (msgDate.toDateString() === today.toDateString()) {
              previewTime = msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else {
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
              previewTime = msgDate.toDateString() === yesterday.toDateString()
                ? 'Yesterday'
                : msgDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
          }

          return {
            id: conv.id,
            type: conv.type,
            name: displayName,
            avatarUrl: displayAvatar,
            description: displayBio,
            inviteCode: conv.invite_code,
            createdBy: conv.created_by,
            isOnline: isOtherOnline,
            lastSeen: otherLastSeen,
            memberCount,
            otherMemberId: otherMember?.id || null,
            otherMemberVirtualNumber: otherMember?.virtual_number || null,

            // Member-specific state
            role: memberRow.role,
            isMuted: memberRow.is_muted,
            isPinned: memberRow.is_pinned,
            isArchived: memberRow.is_archived,
            isFavorite: memberRow.is_favorite,
            unreadCount: memberRow.unread_count,
            memberId: memberRow.id,  // conversation_members row id

            // Preview
            previewText,
            previewTime,
            lastMessageAt: latestMsg?.created_at || conv.created_at,

            // Raw
            createdAt: conv.created_at,
          };
        })
      );

      setConversations(enrichedConversations.filter(Boolean));
    } catch (err) {
      console.error('Error fetching conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load conversations on user change
  useEffect(() => {
    if (user) fetchConversations();
  }, [user, fetchConversations]);

  // Real-time subscriptions for conversation updates
  useEffect(() => {
    if (!user) return;

    // Listen for new messages to update previews
    const msgChannel = supabase
      .channel('conv-msg-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new;
        if (!msg) return;

        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === msg.conversation_id);
          if (idx === -1) {
            // New conversation — refetch
            fetchConversations();
            return prev;
          }

          const updated = [...prev];
          const conv = { ...updated[idx] };

          // Update preview
          if (msg.message_type === 'text') {
            conv.previewText = msg.sender_id === user.id
              ? `You: ${msg.content}`
              : msg.content;
          } else if (msg.message_type === 'image') {
            conv.previewText = '📷 Photo';
          } else if (msg.message_type === 'voice_note') {
            conv.previewText = '🎵 Voice note';
          } else if (msg.message_type === 'system') {
            conv.previewText = msg.content;
          } else {
            conv.previewText = msg.content || '📎 Attachment';
          }

          const now = new Date();
          conv.previewTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          conv.lastMessageAt = msg.created_at;

          // Increment unread if not from current user and not viewing this conversation
          if (msg.sender_id !== user.id) {
            conv.unreadCount = (conv.unreadCount || 0) + 1;
          }

          updated[idx] = conv;
          return updated;
        });
      })
      .subscribe();

    // Listen for conversation_members changes (mute, pin, archive, unread)
    const memberChannel = supabase
      .channel('conv-member-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, (payload) => {
        if (payload.eventType === 'UPDATE' && payload.new?.user_id === user.id) {
          const m = payload.new;
          setConversations(prev => prev.map(c => {
            if (c.id === m.conversation_id) {
              return {
                ...c,
                isMuted: m.is_muted,
                isPinned: m.is_pinned,
                isArchived: m.is_archived,
                isFavorite: m.is_favorite,
                unreadCount: m.unread_count,
              };
            }
            return c;
          }));
        } else if (payload.eventType === 'INSERT' && payload.new?.user_id === user.id) {
          // New conversation member row — refetch to get full enriched data
          fetchConversations();
        } else if (payload.eventType === 'DELETE' && payload.old?.user_id === user.id) {
          setConversations(prev => prev.filter(c => c.id !== payload.old.conversation_id));
        }
      })
      .subscribe();

    // Listen for profile changes to update names/avatars
    const profileChannel = supabase
      .channel('conv-profile-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const p = payload.new;
        if (!p) return;
        setConversations(prev => prev.map(c => {
          if (c.type === 'direct' && c.otherMemberId === p.id) {
            return {
              ...c,
              name: p.display_name,
              avatarUrl: p.avatar_url || '',
              description: p.bio || '',
              isOnline: p.is_online,
              lastSeen: p.last_seen,
            };
          }
          if (c.type === 'self' && p.id === user.id) {
            return {
              ...c,
              name: `${p.display_name} (You)`,
              avatarUrl: p.avatar_url || '',
              description: p.bio || '',
            };
          }
          return c;
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(memberChannel);
      supabase.removeChannel(profileChannel);
    };
  }, [user, fetchConversations]);

  // --- Actions ---

  const selectConversation = useCallback(async (conversationId) => {
    setSelectedConversationId(conversationId);

    if (!user || !conversationId) return;

    // Reset unread count
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    ));

    await supabase
      .from('conversation_members')
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [user]);

  const startDirectChat = useCallback(async (otherUserId) => {
    if (!user) throw new Error('Not authenticated');

    const { data: convId, error } = await supabase
      .rpc('get_or_create_direct_conversation', {
        user1_id: user.id,
        user2_id: otherUserId
      });

    if (error) throw error;

    await fetchConversations();
    setSelectedConversationId(convId);
    return convId;
  }, [user, fetchConversations]);

  const startDirectChatByVirtualNumber = useCallback(async (virtualNumber) => {
    if (!user) throw new Error('Not authenticated');

    // Find user by virtual number
    const { data: targetUser, error: findErr } = await supabase
      .from('profiles')
      .select('id, virtual_number')
      .eq('virtual_number', virtualNumber)
      .single();

    if (findErr || !targetUser) {
      throw new Error(`No user found with Aahat ID: ${virtualNumber}`);
    }

    if (targetUser.id === user.id) {
      throw new Error("You cannot start a chat with yourself using your own Aahat ID.");
    }

    return startDirectChat(targetUser.id);
  }, [user, startDirectChat]);

  const createGroup = useCallback(async (name, description = '', avatarUrl = '', memberIds = []) => {
    if (!user) throw new Error('Not authenticated');

    const { data: convId, error } = await supabase
      .rpc('create_group_conversation', {
        p_creator_id: user.id,
        p_name: name,
        p_description: description,
        p_avatar_url: avatarUrl,
        p_member_ids: memberIds
      });

    if (error) throw error;

    await fetchConversations();
    setSelectedConversationId(convId);
    return convId;
  }, [user, fetchConversations]);

  const fetchGroupMembers = useCallback(async (conversationId) => {
    if (!user || !conversationId) return [];
    try {
      const { data, error } = await supabase
        .from('conversation_members')
        .select(`
          id,
          role,
          joined_at,
          profile:profiles(id, display_name, avatar_url, bio, is_online, virtual_number)
        `)
        .eq('conversation_id', conversationId);

      if (error) throw error;
      return (data || []).map(m => ({
        memberId: m.id,
        role: m.role,
        joinedAt: m.joined_at,
        ...(m.profile || {})
      }));
    } catch (err) {
      console.error('Error fetching group members:', err);
      return [];
    }
  }, [user]);

  const addGroupMember = useCallback(async (conversationId, targetUserId, userName) => {
    if (!user || !conversationId) return;
    try {
      const { error } = await supabase
        .from('conversation_members')
        .insert({
          conversation_id: conversationId,
          user_id: targetUserId,
          role: 'member'
        });

      if (error) throw error;

      // System message
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: `added ${userName || 'a member'}`,
          message_type: 'system'
        });

      await fetchConversations();
    } catch (err) {
      console.error('Error adding group member:', err);
      throw err;
    }
  }, [user, fetchConversations]);

  const removeGroupMember = useCallback(async (conversationId, targetUserId, userName) => {
    if (!user || !conversationId) return;
    try {
      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', targetUserId);

      if (error) throw error;

      // System message
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: `removed ${userName || 'a member'}`,
          message_type: 'system'
        });

      await fetchConversations();
    } catch (err) {
      console.error('Error removing group member:', err);
      throw err;
    }
  }, [user, fetchConversations]);

  const updateGroupMemberRole = useCallback(async (conversationId, targetUserId, role) => {
    if (!user || !conversationId) return;
    try {
      const { error } = await supabase
        .from('conversation_members')
        .update({ role })
        .eq('conversation_id', conversationId)
        .eq('user_id', targetUserId);

      if (error) throw error;
      await fetchConversations();
    } catch (err) {
      console.error('Error updating group member role:', err);
      throw err;
    }
  }, [user, fetchConversations]);

  const leaveGroup = useCallback(async (conversationId) => {
    if (!user || !conversationId) return;
    try {
      // Insert system message first before leaving
      await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: 'left the group',
          message_type: 'system'
        });

      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;

      setSelectedConversationId(null);
      await fetchConversations();
    } catch (err) {
      console.error('Error leaving group:', err);
      throw err;
    }
  }, [user, fetchConversations]);

  const toggleMute = useCallback(async (conversationId) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;

    const newVal = !conv.isMuted;
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, isMuted: newVal } : c
    ));

    await supabase
      .from('conversation_members')
      .update({ is_muted: newVal })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [conversations, user]);

  const togglePin = useCallback(async (conversationId) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;

    const newVal = !conv.isPinned;
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, isPinned: newVal } : c
    ));

    await supabase
      .from('conversation_members')
      .update({ is_pinned: newVal })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [conversations, user]);

  const toggleArchive = useCallback(async (conversationId) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;

    const newVal = !conv.isArchived;
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, isArchived: newVal } : c
    ));

    await supabase
      .from('conversation_members')
      .update({ is_archived: newVal })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [conversations, user]);

  const toggleFavorite = useCallback(async (conversationId) => {
    const conv = conversations.find(c => c.id === conversationId);
    if (!conv || !user) return;

    const newVal = !conv.isFavorite;
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, isFavorite: newVal } : c
    ));

    await supabase
      .from('conversation_members')
      .update({ is_favorite: newVal })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [conversations, user]);

  const clearChat = useCallback(async (conversationId) => {
    if (!user) return;
    // Delete all messages in the conversation (soft delete for user)
    // For simplicity we add user to deleted_for_users array on each message
    // In practice you might use a separate table
    const { data: msgs } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId);

    if (msgs?.length) {
      for (const msg of msgs) {
        await supabase.rpc('array_append_if_not_exists', {
          p_table: 'messages',
          p_id: msg.id,
          p_column: 'deleted_for_users',
          p_value: user.id
        }).catch(() => {
          // Fallback: just mark read
        });
      }
    }

    // Reset unread
    await supabase
      .from('conversation_members')
      .update({ unread_count: 0 })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, unreadCount: 0, previewText: '', previewTime: '' } : c
    ));
  }, [user]);

  const deleteChat = useCallback(async (conversationId) => {
    if (!user) return;

    // Leave the conversation
    await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    setConversations(prev => prev.filter(c => c.id !== conversationId));
    if (selectedConversationId === conversationId) {
      setSelectedConversationId(null);
    }
  }, [user, selectedConversationId]);

  // Derived
  const activeConversation = useMemo(
    () => conversations.find(c => c.id === selectedConversationId),
    [conversations, selectedConversationId]
  );

  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      // Pinned first
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      // Then by latest message time
      return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
    });
  }, [conversations]);

  return {
    conversations: sortedConversations,
    rawConversations: conversations,
    selectedConversationId,
    activeConversation,
    isLoading,

    selectConversation,
    setSelectedConversationId,
    startDirectChat,
    startDirectChatByVirtualNumber,
    createGroup,
    fetchGroupMembers,
    addGroupMember,
    removeGroupMember,
    updateGroupMemberRole,
    leaveGroup,
    toggleMute,
    togglePin,
    toggleArchive,
    toggleFavorite,
    clearChat,
    deleteChat,
    refetch: fetchConversations
  };
}
