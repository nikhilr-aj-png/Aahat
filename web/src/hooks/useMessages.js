import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg',
  'application/pdf', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const getMessageStatus = (msg, userId) => {
  if (msg.sender_id !== userId) return undefined;
  const statuses = msg.statuses || msg.message_status || [];
  if (statuses.some(row => row.status === 'read')) return 'read';
  if (statuses.some(row => row.status === 'delivered')) return 'delivered';
  if (statuses.some(row => row.status === 'sent')) return 'sent';
  return 'sent';
};

/**
 * useMessages — Manages messages for a specific conversation,
 * including real-time delivery, status tracking, reactions,
 * reply, forward, edit, delete, and media attachments.
 */
export function useMessages(user, conversationId) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const PAGE_SIZE = 50;

  // Fetch messages for the active conversation
  const fetchMessages = useCallback(async (append = false) => {
    if (!user || !conversationId) {
      setMessages([]);
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!messages_sender_id_fkey(id, display_name, avatar_url),
          reply_to:messages!messages_reply_to_id_fkey(id, content, sender_id, message_type),
          reactions:message_reactions(id, emoji, user_id),
          statuses:message_status(id, user_id, status, status_at)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted_for_everyone', false)
        .order('created_at', { ascending: false });

      if (!append) {
        // Initial load — get last PAGE_SIZE messages
        query = query.range(0, PAGE_SIZE - 1);
      }

      const { data, error } = await query;
      if (error) throw error;

      const rows = append ? (data || []) : [...(data || [])].reverse();
      const mapped = rows.map(msg => ({
        ...msg,
        isFromMe: msg.sender_id === user.id,
        senderName: msg.sender?.display_name || 'Unknown',
        senderAvatar: msg.sender?.avatar_url || '',
        replyToContent: msg.reply_to?.content || null,
        replyToSenderName: msg.reply_to?.sender_id === user.id ? 'You' : null,
        replyToType: msg.reply_to?.message_type || null,
        reactionList: msg.reactions || [],
        _status: getMessageStatus(msg, user.id),
        // Check if deleted for current user
        isDeletedForMe: (msg.deleted_for_users || []).includes(user.id),
      })).filter(msg => !msg.isDeletedForMe);

      setMessages(mapped);
      setHasMore(data?.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching messages:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, conversationId]);

  // Load messages when conversation changes
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Real-time subscription for new messages in this conversation
  useEffect(() => {
    if (!user || !conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, async (payload) => {
        const newMsg = payload.new;
        if (!newMsg) return;

        // Fetch sender profile
        const { data: senderProfile } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .eq('id', newMsg.sender_id)
          .single();

        const enrichedMsg = {
          ...newMsg,
          isFromMe: newMsg.sender_id === user.id,
          senderName: senderProfile?.display_name || 'Unknown',
          senderAvatar: senderProfile?.avatar_url || '',
          reactionList: [],
          isDeletedForMe: false,
        };

        setMessages(prev => {
          // Deduplicate (in case of optimistic update)
          if (prev.some(m => m.id === enrichedMsg.id)) return prev;

          // Match optimistic message by content + timestamp proximity
          if (enrichedMsg.isFromMe) {
            const optIdx = prev.findIndex(m =>
              m.isFromMe &&
              m._optimistic &&
              m.content === enrichedMsg.content &&
              Math.abs(new Date(m.created_at) - new Date(enrichedMsg.created_at)) < 5000
            );
            if (optIdx !== -1) {
              const updated = [...prev];
              updated[optIdx] = { ...enrichedMsg, _optimistic: false };
              return updated;
            }
          }

          return [...prev, enrichedMsg];
        });

        // Mark as delivered if from other user
        if (newMsg.sender_id !== user.id) {
          await supabase
            .from('message_status')
            .upsert({
              message_id: newMsg.id,
              user_id: user.id,
              status: 'delivered',
              status_at: new Date().toISOString()
            }, { onConflict: 'message_id,user_id' });
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        const updated = payload.new;
        if (!updated) return;

        if (updated.is_deleted_for_everyone) {
          setMessages(prev => prev.filter(m => m.id !== updated.id));
        } else {
          setMessages(prev => prev.map(m =>
            m.id === updated.id
              ? { ...m, content: updated.content, is_edited: updated.is_edited, edited_at: updated.edited_at, is_pinned: updated.is_pinned }
              : m
          ));
        }
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      }, (payload) => {
        setMessages(prev => prev.filter(m => m.id !== payload.old?.id));
      })
      .subscribe();

    // Also subscribe to reactions
    const reactionChannel = supabase
      .channel(`reactions-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions'
      }, (payload) => {
        // Refetch reactions for affected message
        const msgId = payload.new?.message_id || payload.old?.message_id;
        if (!msgId) return;

        supabase
          .from('message_reactions')
          .select('id, emoji, user_id')
          .eq('message_id', msgId)
          .then(({ data }) => {
            setMessages(prev => prev.map(m =>
              m.id === msgId ? { ...m, reactionList: data || [] } : m
            ));
          });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionChannel);
    };
  }, [user, conversationId]);

  // --- Actions ---

  const sendMessage = useCallback(async (content, options = {}) => {
    if (!user || !conversationId) return;

    const {
      messageType = 'text',
      attachmentUrl = null,
      attachmentName = null,
      attachmentSize = null,
      attachmentMimeType = null,
      replyToId = null,
      forwardedFromId = null,
    } = options;

    const now = new Date().toISOString();
    const optimisticId = `opt-${Date.now()}`;

    // Optimistic local update
    const optimisticMsg = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: content || '',
      message_type: messageType,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      reply_to_id: replyToId,
      forwarded_from_id: forwardedFromId,
      is_edited: false,
      is_deleted_for_everyone: false,
      is_pinned: false,
      created_at: now,
      isFromMe: true,
      senderName: 'You',
      senderAvatar: '',
      reactionList: [],
      isDeletedForMe: false,
      _optimistic: true,
      _status: 'sending'
    };

    setMessages(prev => [...prev, optimisticMsg]);

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content || '',
          message_type: messageType,
          attachment_url: attachmentUrl,
          attachment_name: attachmentName,
          attachment_size: attachmentSize,
          attachment_mime_type: attachmentMimeType,
          reply_to_id: replyToId,
          forwarded_from_id: forwardedFromId,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace optimistic message with real one
      setMessages(prev => prev.map(m =>
        m.id === optimisticId
          ? { ...m, id: data.id, _optimistic: false, _status: 'sent', created_at: data.created_at }
          : m
      ));

      // Insert message_status for sender (sent)
      await supabase.from('message_status').upsert({
        message_id: data.id,
        user_id: user.id,
        status: 'sent',
        status_at: new Date().toISOString()
      }, { onConflict: 'message_id,user_id' });

      return data;
    } catch (err) {
      console.error('Error sending message:', err);
      // Mark optimistic message as failed
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, _status: 'failed' } : m
      ));
      throw err;
    }
  }, [user, conversationId]);

  const retryMessage = useCallback(async (messageId) => {
    const failed = messages.find(m => m.id === messageId && m._status === 'failed');
    if (!failed) return;

    setMessages(prev => prev.filter(m => m.id !== messageId));
    return sendMessage(failed.content, {
      messageType: failed.message_type,
      attachmentUrl: failed.attachment_url,
      attachmentName: failed.attachment_name,
      attachmentSize: failed.attachment_size,
      attachmentMimeType: failed.attachment_mime_type,
      replyToId: failed.reply_to_id,
      forwardedFromId: failed.forwarded_from_id,
    });
  }, [messages, sendMessage]);

  const editMessage = useCallback(async (messageId, newContent) => {
    if (!user) return;

    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, content: newContent, is_edited: true } : m
    ));

    await supabase
      .from('messages')
      .update({
        content: newContent,
        is_edited: true,
        edited_at: new Date().toISOString()
      })
      .eq('id', messageId)
      .eq('sender_id', user.id);
  }, [user]);

  const deleteForMe = useCallback(async (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));

    // Add user ID to deleted_for_users array
    const { data: msg } = await supabase
      .from('messages')
      .select('deleted_for_users')
      .eq('id', messageId)
      .single();

    if (msg) {
      const deletedFor = [...(msg.deleted_for_users || []), user.id];
      await supabase
        .from('messages')
        .update({ deleted_for_users: deletedFor })
        .eq('id', messageId);
    }
  }, [user]);

  const deleteForEveryone = useCallback(async (messageId) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));

    await supabase
      .from('messages')
      .update({ is_deleted_for_everyone: true, content: 'This message was deleted' })
      .eq('id', messageId)
      .eq('sender_id', user.id);  // Only sender can delete for everyone
  }, [user]);

  const addReaction = useCallback(async (messageId, emoji) => {
    if (!user) return;

    // Check if user already reacted with this emoji
    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .single();

    if (existing) {
      // Remove reaction
      await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id);
    } else {
      // Add reaction
      await supabase
        .from('message_reactions')
        .insert({
          message_id: messageId,
          user_id: user.id,
          emoji
        });
    }
  }, [user]);

  const removeReaction = useCallback(async (messageId, emoji) => {
    if (!user) return;
    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji);
  }, [user]);

  const togglePinMessage = useCallback(async (messageId) => {
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const newVal = !msg.is_pinned;
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, is_pinned: newVal } : m
    ));

    await supabase
      .from('messages')
      .update({ is_pinned: newVal })
      .eq('id', messageId);
  }, [messages]);

  const toggleStarMessage = useCallback(async (messageId) => {
    if (!user) return;
    const msg = messages.find(m => m.id === messageId);
    if (!msg) return;

    const isStarred = (msg.is_starred_by || []).includes(user.id);
    let newStarredBy;

    if (isStarred) {
      newStarredBy = (msg.is_starred_by || []).filter(id => id !== user.id);
    } else {
      newStarredBy = [...(msg.is_starred_by || []), user.id];
    }

    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, is_starred_by: newStarredBy } : m
    ));

    await supabase
      .from('messages')
      .update({ is_starred_by: newStarredBy })
      .eq('id', messageId);
  }, [user, messages]);

  const markAsRead = useCallback(async () => {
    if (!user || !conversationId) return;

    // Update message_status for all unread messages in this conversation
    const unreadMsgs = messages.filter(m => !m.isFromMe);

    for (const msg of unreadMsgs) {
      await supabase
        .from('message_status')
        .upsert({
          message_id: msg.id,
          user_id: user.id,
          status: 'read',
          status_at: new Date().toISOString()
        }, { onConflict: 'message_id,user_id' });
    }

    // Reset unread count
    await supabase
      .from('conversation_members')
      .update({ unread_count: 0, last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);
  }, [user, conversationId, messages]);

  // Upload a file and return the public URL
  const uploadFile = useCallback(async (file, oldUrl = null) => {
    if (!file) throw new Error('No file selected.');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`File is too large. Maximum upload size is ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }
    if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Delete old file if replacing
    if (oldUrl && oldUrl.includes('supabase.co/storage/v1/object/public/')) {
      try {
        const parts = oldUrl.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          const pathParts = parts[1].split('/');
          const bucket = pathParts[0];
          const filePath = pathParts.slice(1).join('/');
          await supabase.storage.from(bucket).remove([filePath]);
        }
      } catch (err) {
        console.warn('Failed to delete old file:', err);
      }
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const bucket = file.type?.startsWith('audio/') ? 'voice-notes' : 'attachments';

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return publicUrl;
    } catch (err) {
      console.warn('Upload failed:', err);
      throw err;
    }
  }, [user]);

  return {
    messages,
    isLoading,
    hasMore,

    sendMessage,
    retryMessage,
    editMessage,
    deleteForMe,
    deleteForEveryone,
    addReaction,
    removeReaction,
    togglePinMessage,
    toggleStarMessage,
    markAsRead,
    uploadFile,
    refetch: fetchMessages
  };
}
