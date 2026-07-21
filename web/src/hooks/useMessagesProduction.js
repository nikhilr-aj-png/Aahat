import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';

const PAGE_SIZE = 50;
const MAX_IMAGE_UPLOAD_BYTES = 1 * 1024 * 1024;
const MAX_VIDEO_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_PDF_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_AUDIO_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/wav', 'audio/ogg',
  'application/pdf', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv'
]);

const statusFor = (message, userId) => {
  if (message.sender_id !== userId) return undefined;
  const statuses = message.statuses || [];
  if (statuses.some(row => row.status === 'read')) return 'read';
  if (statuses.some(row => row.status === 'delivered')) return 'delivered';
  return 'sent';
};

const storageObjectFromPublicUrl = (url) => {
  const marker = ['/storage/v1/object/public/', '/storage/v1/object/sign/']
    .find(candidate => url?.includes(candidate));
  if (!marker) return null;
  const [bucket, ...parts] = url.split(marker)[1].split('?')[0].split('/');
  return bucket && parts.length ? { bucket, path: parts.join('/') } : null;
};

// Chat media lives in private buckets, so every read needs a short-lived
// signed URL. The bucket/path pair is kept on the message row by a trigger;
// older rows fall back to parsing the stored URL.
const storageObjectForMessage = (message) => {
  if (message?.attachment_bucket && message?.attachment_path) {
    return { bucket: message.attachment_bucket, path: message.attachment_path };
  }
  return storageObjectFromPublicUrl(message?.attachment_url);
};

const SIGNED_URL_TTL_SECONDS = 120;

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
const hydrateMessageStatuses = async (rows, userId) => {
  const outgoingIds = rows.filter(row => row.sender_id === userId).map(row => row.id);
  if (!outgoingIds.length) return rows;
  const { data, error } = await supabase.from('message_status')
    .select('id,message_id,user_id,status,status_at')
    .in('message_id', outgoingIds);
  if (error) {
    console.warn('Message receipts could not be loaded:', error.message);
    return rows;
  }
  const statusesByMessage = new Map();
  (data || []).forEach(status => {
    const current = statusesByMessage.get(status.message_id) || [];
    current.push(status);
    statusesByMessage.set(status.message_id, current);
  });
  return rows.map(row => ({
    ...row,
    statuses: statusesByMessage.get(row.id) || row.statuses || []
  }));
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
      data = await hydrateMessageStatuses(data, user.id);

      let deletedQuery = supabase.from('deleted_messages')
        .select('message_id,conversation_id,sender_id,deleted_by,original_message_type,original_created_at,deleted_at,had_attachment')
        .eq('conversation_id', conversationId)
        .order('original_created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (older && oldest) deletedQuery = deletedQuery.lt('original_created_at', oldest.created_at);
      const { data: deletedRows, error: deletedError } = await deletedQuery;
      if (deletedError) console.warn('Deleted message markers could not be loaded:', deletedError.message);

      if ((data || []).some(message => message.sender_id !== user.id)) {
        supabase.rpc('mark_pending_messages_delivered').then(({ error: deliveryError }) => {
          if (deliveryError) console.warn('Could not acknowledge fetched messages:', deliveryError.message);
        });
      }
      const tombstones = (deletedRows || []).map(row => ({
        id: row.message_id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        created_at: row.original_created_at,
        message_type: 'deleted',
        content: '',
        _deletedTombstone: true,
        deleted_at: row.deleted_at,
        original_message_type: row.original_message_type,
        had_attachment: row.had_attachment
      }));
      const page = [...(data || []), ...tombstones]
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map(mapMessage)
        .filter(message => !(message.deleted_for_users || []).includes(user.id));
      setMessages(current => older
        ? [...page, ...current.filter(row => !page.some(item => item.id === row.id))]
        : page);
      setHasMore((data || []).length === PAGE_SIZE || (deletedRows || []).length === PAGE_SIZE);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deleted_messages', filter: `conversation_id=eq.${conversationId}` }, refresh)
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
    const { data, error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: messageId });
    if (error) throw error;
    setMessages(current => current.map(message => message.id === messageId ? {
      id: message.id,
      conversation_id: message.conversation_id,
      sender_id: message.sender_id,
      created_at: message.created_at,
      message_type: 'deleted',
      content: '',
      isFromMe: true,
      _deletedTombstone: true,
      original_message_type: message.message_type,
      had_attachment: Boolean(message.attachment_url)
    } : message));

    if (data?.storage_bucket && data?.storage_path) {
      const cleanup = await supabase.storage.from(data.storage_bucket).remove([data.storage_path]);
      await supabase.rpc('complete_deleted_message_storage', {
        p_message_id: messageId,
        p_success: !cleanup.error,
        p_error: cleanup.error?.message || null
      });
      if (cleanup.error) console.warn('Message media cleanup is pending:', cleanup.error.message);
    }
    await fetchPage(false);
  }, [fetchPage]);

  /**
   * Mints a short-lived signed URL for a message's attachment. Chat buckets are
   * private: read access is granted only while a message the caller can see
   * still points at the object, so this fails as soon as the media expires.
   */
  const getAttachmentUrl = useCallback(async (message) => {
    const object = storageObjectForMessage(message);
    if (!object) throw new Error('This attachment is no longer available.');
    const { data, error } = await supabase.storage.from(object.bucket)
      .createSignedUrl(object.path, SIGNED_URL_TTL_SECONDS);
    if (error) throw error;
    return data.signedUrl;
  }, []);

  /**
   * Auto-expiring media: called by the receiver once the attachment has been
   * written to their device. The RPC strips the attachment from the message for
   * both sides — which immediately revokes read access, since the storage
   * policy resolves objects through the message row — and queues the purge.
   * The object is then deleted straight away; the queue is the retry path.
   */
  const consumeAttachment = useCallback(async (messageId) => {
    const { data, error } = await supabase.rpc('consume_message_attachment', { p_message_id: messageId });
    if (error) throw error;
    if (data?.skipped) return data;

    const expiredType = data?.expired_type || 'file';
    setMessages(current => current.map(message => message.id === messageId ? {
      ...message,
      attachment_url: null,
      attachment_name: null,
      attachment_size: null,
      attachment_mime_type: null,
      attachment_bucket: null,
      attachment_path: null,
      attachment_expired_type: expiredType,
      attachment_consumed_at: new Date().toISOString()
    } : message));

    if (data?.storage_bucket && data?.storage_path) {
      const cleanup = await supabase.storage.from(data.storage_bucket).remove([data.storage_path]);
      const { error: completionError } = await supabase.rpc('complete_attachment_purge', {
        p_message_id: messageId,
        p_success: !cleanup.error,
        p_error: cleanup.error?.message || null
      });
      if (cleanup.error) console.warn('Attachment purge stays queued for retry:', cleanup.error.message);
      if (completionError) console.warn('Could not record the purge result:', completionError.message);
    }
    await fetchPage(false);
    return data;
  }, [fetchPage]);

  // Retry path: drains purge requests this account is party to, so an
  // interrupted delete does not leave the object behind.
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const drainPurgeQueue = async () => {
      const { data, error } = await supabase.from('attachment_purge_queue')
        .select('message_id,storage_bucket,storage_path')
        .eq('status', 'pending')
        .limit(25);
      if (error || cancelled || !data?.length) return;
      for (const row of data) {
        const cleanup = await supabase.storage.from(row.storage_bucket).remove([row.storage_path]);
        const { error: completionError } = await supabase.rpc('complete_attachment_purge', {
          p_message_id: row.message_id,
          p_success: !cleanup.error,
          p_error: cleanup.error?.message || null
        });
        if (completionError) console.warn('Attachment purge stays queued:', completionError.message);
      }
    };
    drainPurgeQueue().catch(console.warn);
    const queueId = window.setInterval(() => drainPurgeQueue().catch(console.warn), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(queueId);
    };
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

  const searchMessages = useCallback(async (query) => {
    const normalized = query?.trim();
    if (!user || !conversationId || !normalized) return [];
    let { data, error } = await supabase.rpc('search_conversation_messages', {
      p_conversation_id: conversationId,
      p_query: normalized,
      p_limit: 100
    });
    if (error && /search_conversation_messages|schema cache|PGRST202/i.test(error.message || '')) {
      const safeQuery = normalized.replace(/[%_,()]/g, ' ').trim();
      const fallback = await supabase.from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(id,display_name,avatar_url)')
        .eq('conversation_id', conversationId)
        .eq('is_deleted_for_everyone', false)
        .ilike('content', '%' + safeQuery + '%')
        .order('created_at', { ascending: false })
        .limit(100);
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return (data || [])
      .filter(row => !(row.deleted_for_users || []).includes(user.id))
      .map(row => mapMessage({
        ...row,
        sender: row.sender || {
          display_name: row.sender_name,
          avatar_url: row.sender_avatar
        },
        reactions: [],
        pins: [],
        stars: []
      }));
  }, [conversationId, mapMessage, user]);

  const fetchSharedMedia = useCallback(async () => {
    if (!user || !conversationId) return [];
    let { data, error } = await supabase.rpc('list_conversation_media', {
      p_conversation_id: conversationId,
      p_limit: 250
    });
    if (error && /list_conversation_media|schema cache|PGRST202/i.test(error.message || '')) {
      const fallback = await supabase.from('messages')
        .select('id,conversation_id,sender_id,message_type,attachment_url,attachment_name,attachment_size,attachment_mime_type,attachment_bucket,attachment_path,created_at,deleted_for_users')
        .eq('conversation_id', conversationId)
        .eq('is_deleted_for_everyone', false)
        .not('attachment_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(250);
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    return (data || []).filter(row => !(row.deleted_for_users || []).includes(user.id));
  }, [conversationId, user]);
  const uploadFile = useCallback(async (file, oldUrl = null, preferredBucket = null) => {
    if (!file) throw new Error('No file selected.');
    const uploadLimit = file.type.startsWith('image/') ? MAX_IMAGE_UPLOAD_BYTES
      : file.type.startsWith('video/') ? MAX_VIDEO_UPLOAD_BYTES
        : file.type.startsWith('audio/') ? MAX_AUDIO_UPLOAD_BYTES
          : file.type === 'application/pdf' ? MAX_PDF_UPLOAD_BYTES
            : MAX_DOCUMENT_UPLOAD_BYTES;
    if (file.size > uploadLimit) throw new Error(`Prepared file exceeds the ${Math.round(uploadLimit / 1024 / 1024)}MB upload limit.`);
    if (file.type && !ALLOWED_UPLOAD_TYPES.has(file.type)) throw new Error(`Unsupported file type: ${file.type}`);
    const oldObject = storageObjectFromPublicUrl(oldUrl);
    if (oldObject) await supabase.storage.from(oldObject.bucket).remove([oldObject.path]);
    const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '') || 'bin';
    const path = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const bucket = preferredBucket || (file.type.startsWith('audio/') ? 'voice-notes' : 'attachments');
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    // Chat buckets are private, so this URL is not fetchable. It is stored as
    // the object's canonical identity — a trigger parses bucket/path out of it,
    // and reads go through getAttachmentUrl's signed URLs.
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    await supabase.from('storage_files').insert({ owner_id: user.id, bucket_id: bucket, object_path: path, public_url: data.publicUrl, mime_type: file.type, file_size: file.size }).then(() => undefined);
    return data.publicUrl;
  }, [user]);

  return {
    messages, isLoading, isLoadingMore, hasMore, loadMore: () => fetchPage(true),
    sendMessage, retryMessage, editMessage, deleteForMe, deleteForEveryone,
    addReaction, removeReaction, togglePinMessage, toggleStarMessage, markAsRead,
    consumeAttachment, getAttachmentUrl,
    uploadFile, searchMessages, fetchSharedMedia, refetch: () => fetchPage(false)
  };
}
