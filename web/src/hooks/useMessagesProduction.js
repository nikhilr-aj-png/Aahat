import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const PAGE_SIZE = 50;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg',
  'application/pdf', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

const statusFor = (message, userId) => {
  if (message.sender_id !== userId) return undefined;
  const statuses = message.statuses || [];
  if (statuses.some(row => row.status === 'read')) return 'read';
  if (statuses.some(row => row.status === 'delivered')) return 'delivered';
  return 'sent';
};

const storageObjectFromPublicUrl = (url) => {
  const marker = '/storage/v1/object/public/';
  if (!url?.includes(marker)) return null;
  const [bucket, ...parts] = url.split(marker)[1].split('/');
  return bucket && parts.length ? { bucket, path: parts.join('/') } : null;
};

const hydrateReplyTargets = async (rows) => {
  const replyIds = [...new Set(rows.map(row => row.reply_to_id).filter(Boolean))];
  if (!replyIds.length) return rows;
  const { data, error } = await supabase.from('messages')
    .select('id,content,sender_id,message_type')
    .in('id', replyIds);
  if (error) {
    console.warn('Reply previews could not be loaded:', error.message);
    return rows;
  }
  const repliesById = new Map((data || []).map(row => [row.id, row]));
  return rows.map(row => ({ ...row, reply_to: repliesById.get(row.reply_to_id) || null }));
};
export function useMessages(user, conversationId) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const messagesRef = useRef([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const mapMessage = useCallback((message) => {
    const sender = Array.isArray(message.sender) ? message.sender[0] : message.sender;
    const reply = Array.isArray(message.reply_to) ? message.reply_to[0] : message.reply_to;
    return {
      ...message,
      isFromMe: message.sender_id === user?.id,
      senderName: typeof sender?.display_name === 'string' ? sender.display_name : 'Unknown',
      senderAvatar: typeof sender?.avatar_url === 'string' ? sender.avatar_url : '',
      replyToContent: typeof reply?.content === 'string' ? reply.content : null,
      replyToSenderName: reply?.sender_id === user?.id ? 'You' : null,
      replyToType: reply?.message_type || null,
      reactionList: Array.isArray(message.reactions) ? message.reactions : [],
      is_pinned: Boolean(message.pins?.length),
      is_starred: Boolean(message.stars?.some(row => row.user_id === user?.id)),
      _status: statusFor(message, user?.id)
    };
  }, [user?.id]);

  const fetchPage = useCallback(async (older = false) => {
    if (!user || !conversationId) {
      setMessages([]);
      return;
    }
    older ? setIsLoadingMore(true) : setIsLoading(true);
    try {
      let query = supabase.from('messages').select(`
        *, sender:profiles!messages_sender_id_fkey(id,display_name,avatar_url),
        reactions:message_reactions(id,emoji,user_id),
        statuses:message_status(id,user_id,status,status_at),
        pins:pinned_messages(id,pinned_by), stars:starred_messages(id,user_id)
      `).eq('conversation_id', conversationId)
        .eq('is_deleted_for_everyone', false)
        .order('created_at', { ascending: false }).limit(PAGE_SIZE);

      const oldest = messagesRef.current[0];
      if (older && oldest) query = query.lt('created_at', oldest.created_at);
      let { data, error } = await query;
      if (error) {
        console.warn('Rich message query failed; loading core messages instead:', error.message);
        let fallbackQuery = supabase.from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(id,display_name,avatar_url)')
          .eq('conversation_id', conversationId)
          .eq('is_deleted_for_everyone', false)
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);
        if (older && oldest) fallbackQuery = fallbackQuery.lt('created_at', oldest.created_at);
        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data;
        error = fallbackResult.error;
      }
      if (error) throw error;
      data = await hydrateReplyTargets(data || []);
      const page = [...(data || [])].reverse().map(mapMessage)
        .filter(message => !(message.deleted_for_users || []).includes(user.id));
      setMessages(current => older
        ? [...page, ...current.filter(row => !page.some(item => item.id === row.id))]
        : page);
      setHasMore((data || []).length === PAGE_SIZE);
    } finally {
      older ? setIsLoadingMore(false) : setIsLoading(false);
    }
  }, [conversationId, mapMessage, user]);

  useEffect(() => { fetchPage(false).catch(console.error); }, [fetchPage]);

  useEffect(() => {
    if (!user || !conversationId) return undefined;
    const refresh = () => fetchPage(false).catch(console.error);
    const messageChannel = supabase.channel(`messages-production-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, refresh)
      .subscribe();
    const reactionChannel = supabase.channel(`reactions-production-${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_status' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages', filter: `conversation_id=eq.${conversationId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(reactionChannel);
    };
  }, [conversationId, fetchPage, user]);

  useEffect(() => {
    if (!user || !conversationId) return undefined;
    const refresh = () => fetchPage(false).catch(console.error);
    const pollId = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(pollId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [conversationId, fetchPage, user]);

  const sendMessage = useCallback(async (content, options = {}) => {
    if (!user || !conversationId) throw new Error('Select a conversation first.');
    const payload = {
      conversation_id: conversationId, sender_id: user.id, content: content || '',
      message_type: options.messageType || 'text', attachment_url: options.attachmentUrl || null,
      attachment_name: options.attachmentName || null, attachment_size: options.attachmentSize || null,
      attachment_mime_type: options.attachmentMimeType || null, reply_to_id: options.replyToId || null,
      forwarded_from_id: options.forwardedFromId || null
    };
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    setMessages(current => [...current, { ...payload, id: optimisticId, created_at: new Date().toISOString(), isFromMe: true, senderName: 'You', reactionList: [], _optimistic: true, _status: 'sending' }]);
    const { data, error } = await supabase.from('messages').insert(payload).select().single();
    if (error) {
      setMessages(current => current.map(row => row.id === optimisticId ? { ...row, _status: 'failed' } : row));
      throw error;
    }
    setMessages(current => current.map(row => row.id === optimisticId ? mapMessage({ ...row, ...data, _optimistic: false }) : row));
    await fetchPage(false);
    return data;
  }, [conversationId, fetchPage, mapMessage, user]);

  const retryMessage = useCallback(async (messageId) => {
    const failed = messagesRef.current.find(row => row.id === messageId && row._status === 'failed');
    if (!failed) return;
    setMessages(current => current.filter(row => row.id !== messageId));
    return sendMessage(failed.content, {
      messageType: failed.message_type, attachmentUrl: failed.attachment_url,
      attachmentName: failed.attachment_name, attachmentSize: failed.attachment_size,
      attachmentMimeType: failed.attachment_mime_type, replyToId: failed.reply_to_id,
      forwardedFromId: failed.forwarded_from_id
    });
  }, [sendMessage]);

  const editMessage = useCallback(async (messageId, content) => {
    const { error } = await supabase.from('messages').update({ content, is_edited: true, edited_at: new Date().toISOString() })
      .eq('id', messageId).eq('sender_id', user.id);
    if (error) throw error;
    setMessages(current => current.map(message => message.id === messageId ? { ...message, content, is_edited: true, edited_at: new Date().toISOString() } : message));
  }, [user]);

  const deleteForMe = useCallback(async (messageId) => {
    const { error } = await supabase.rpc('delete_message_for_me', { p_message_id: messageId });
    if (error) throw error;
    setMessages(current => current.filter(row => row.id !== messageId));
  }, []);

  const deleteForEveryone = useCallback(async (messageId) => {
    const { error } = await supabase.from('messages').update({ is_deleted_for_everyone: true, content: '' })
      .eq('id', messageId).eq('sender_id', user.id);
    if (error) throw error;
  }, [user]);

  const addReaction = useCallback(async (messageId, emoji) => {
    const { data } = await supabase.from('message_reactions').select('id').eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji).maybeSingle();
    const result = data
      ? await supabase.from('message_reactions').delete().eq('id', data.id)
      : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
    if (result.error) throw result.error;
  }, [user]);

  const removeReaction = useCallback(async (messageId, emoji) => {
    const { error } = await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji);
    if (error) throw error;
  }, [user]);

  const togglePinMessage = useCallback(async (messageId) => {
    const message = messagesRef.current.find(row => row.id === messageId);
    const result = message?.is_pinned
      ? await supabase.from('pinned_messages').delete().eq('conversation_id', conversationId).eq('message_id', messageId)
      : await supabase.from('pinned_messages').insert({ conversation_id: conversationId, message_id: messageId, pinned_by: user.id });
    if (result.error) throw result.error;
    setMessages(current => current.map(row => row.id === messageId ? { ...row, is_pinned: !message?.is_pinned } : row));
  }, [conversationId, user]);

  const toggleStarMessage = useCallback(async (messageId) => {
    const message = messagesRef.current.find(row => row.id === messageId);
    const result = message?.is_starred
      ? await supabase.from('starred_messages').delete().eq('user_id', user.id).eq('message_id', messageId)
      : await supabase.from('starred_messages').insert({ user_id: user.id, message_id: messageId });
    if (result.error) throw result.error;
    setMessages(current => current.map(row => row.id === messageId ? { ...row, is_starred: !message?.is_starred } : row));
  }, [user]);

  const markAsRead = useCallback(async () => {
    if (!conversationId) return;
    const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    if (error) throw error;
  }, [conversationId]);

  const uploadFile = useCallback(async (file, oldUrl = null, preferredBucket = null) => {
    if (!file) throw new Error('No file selected.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('File exceeds the 50MB limit.');
    if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) throw new Error(`Unsupported file type: ${file.type}`);
    const oldObject = storageObjectFromPublicUrl(oldUrl);
    if (oldObject) await supabase.storage.from(oldObject.bucket).remove([oldObject.path]);
    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const bucket = preferredBucket || (file.type.startsWith('audio/') ? 'voice-notes' : 'attachments');
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    await supabase.from('storage_files').insert({ owner_id: user.id, bucket_id: bucket, object_path: path, public_url: data.publicUrl, mime_type: file.type, file_size: file.size }).then(() => undefined);
    return data.publicUrl;
  }, [user]);

  return {
    messages, isLoading, isLoadingMore, hasMore, loadMore: () => fetchPage(true),
    sendMessage, retryMessage, editMessage, deleteForMe, deleteForEveryone,
    addReaction, removeReaction, togglePinMessage, toggleStarMessage, markAsRead,
    uploadFile, refetch: () => fetchPage(false)
  };
}
