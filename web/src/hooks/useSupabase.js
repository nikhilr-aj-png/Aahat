import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../supabase';

/**
 * Custom hook encapsulating all Supabase data operations, real-time subscriptions,
 * and offline fallback logic for the Aahat messaging app.
 */
export function useSupabase(user) {
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [typingStatus, setTypingStatus] = useState({});

  // Helper mapping functions to isolate tenant records using email-prefixed IDs
  const getDbId = useCallback((clientId) => {
    if (!user) return clientId;
    return clientId.includes(':') ? clientId : `${user.email}:${clientId}`;
  }, [user]);

  const getClientId = useCallback((dbId) => {
    if (!dbId) return '';
    const splitIndex = dbId.indexOf(':');
    return splitIndex !== -1 ? dbId.substring(splitIndex + 1) : dbId;
  }, []);

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Fetch Contacts isolated to this user
      let { data: dbContacts, error: cErr } = await supabase
        .from('contacts')
        .select('*')
        .like('id', `${user.email}:%`);
      if (cErr) throw cErr;

      let finalContacts = (dbContacts || []).map(c => ({
        ...c,
        id: getClientId(c.id)
      }));

      // Ensure 'me' (Message Yourself) contact exists
      const hasSelf = finalContacts.some(c => c.id === 'me');
      if (!hasSelf) {
        const selfContact = {
          id: 'me',
          name: `${user.name} (You)`,
          avatarUrl: user.avatarUrl || '',
          isActive: true,
          lastActiveText: 'Online',
          isRecent: true,
          recentMessageText: 'Tap to send notes, reminders, or drafts to yourself.',
          recentMessageTime: '',
          recentMessageIsUnread: false,
          isGroup: false,
          memberCount: 0,
          description: 'Your personal notes and reminders container. Encrypted and synced.',
          unreadCount: 0,
          isPinned: true
        };
        try {
          await supabase.from('contacts').insert([{ ...selfContact, id: getDbId('me') }]);
          finalContacts = [selfContact, ...finalContacts];
        } catch (insSelfErr) {
          finalContacts = [selfContact, ...finalContacts];
        }
      } else {
        // Keep the displayed name and avatar synchronized with the logged-in user
        finalContacts = finalContacts.map(c => c.id === 'me' ? { 
          ...c, 
          name: `${user.name} (You)`,
          avatarUrl: user.avatarUrl || c.avatarUrl || ''
        } : c);
      }

      setContacts(finalContacts);

      // Fetch Messages isolated to this user
      let { data: dbMessages, error: mErr } = await supabase
        .from('messages')
        .select('*')
        .like('contactId', `${user.email}:%`);
      if (mErr) throw mErr;

      const mappedMessages = (dbMessages || []).map(m => ({
        ...m,
        contactId: getClientId(m.contactId)
      }));

      setMessages(mappedMessages.sort((a, b) => a.timestamp - b.timestamp));
    } catch (e) {
      console.error("Supabase load error, using fallback", e);
      const savedContacts = localStorage.getItem('aahat_contacts');
      const savedMessages = localStorage.getItem('aahat_messages');
      let finalContacts = [];
      if (savedContacts) {
        finalContacts = JSON.parse(savedContacts);
      }

      const hasSelf = finalContacts.some(c => c.id === 'me');
      if (!hasSelf && user) {
        const selfContact = {
          id: 'me',
          name: `${user.name} (You)`,
          avatarUrl: user.avatarUrl || '',
          isActive: true,
          lastActiveText: 'Online',
          isRecent: true,
          recentMessageText: 'Tap to send notes, reminders, or drafts to yourself.',
          recentMessageTime: '',
          recentMessageIsUnread: false,
          isGroup: false,
          memberCount: 0,
          description: 'Your personal notes and reminders container. Encrypted and synced.',
          unreadCount: 0,
          isPinned: true
        };
        finalContacts = [selfContact, ...finalContacts];
      } else if (hasSelf && user) {
        finalContacts = finalContacts.map(c => c.id === 'me' ? { 
          ...c, 
          name: `${user.name} (You)`,
          avatarUrl: user.avatarUrl || c.avatarUrl || ''
        } : c);
      }
      setContacts(finalContacts);

      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      } else {
        setMessages([]);
      }
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Load data when user is available
  useEffect(() => {
    if (user) fetchData();
  }, [user, fetchData]);

  // --- Real-time Subscription ---
  useEffect(() => {
    if (!user) return;
    
    // Subscribe to messages changes
    const msgChannel = supabase
      .channel('public-messages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new;
        if (payload.eventType === 'INSERT') {
          if (!newMsg || !newMsg.contactId || !newMsg.contactId.startsWith(`${user.email}:`)) return;
          
          const clientContactId = getClientId(newMsg.contactId);
          const clientMsg = { ...newMsg, contactId: clientContactId };

          setMessages(prev => {
            if (prev.some(m => m.id === clientMsg.id)) return prev;

            // Match and resolve optimistic messages to prevent duplicates
            if (clientMsg.isFromMe) {
              const optIndex = prev.findIndex(m => 
                m.isFromMe &&
                m.contactId === clientMsg.contactId &&
                m.text === clientMsg.text &&
                m.attachmentUrl === clientMsg.attachmentUrl &&
                Math.abs(Number(m.timestamp) - Number(clientMsg.timestamp)) < 3000
              );
              if (optIndex !== -1) {
                const updated = [...prev];
                updated[optIndex] = { ...updated[optIndex], id: clientMsg.id };
                return updated;
              }
            }

            return [...prev, clientMsg].sort((a, b) => a.timestamp - b.timestamp);
          });
          setContacts(prev => prev.map(c => {
            if (c.id === clientMsg.contactId) {
              return {
                ...c, isRecent: true,
                recentMessageText: clientMsg.attachmentUrl && !clientMsg.text ? "Sent an image" : clientMsg.text,
                recentMessageTime: "Just now",
                recentMessageIsUnread: !clientMsg.isFromMe
              };
            }
            return c;
          }));
        } else if (payload.eventType === 'UPDATE') {
          if (!newMsg || !newMsg.contactId || !newMsg.contactId.startsWith(`${user.email}:`)) return;
          const clientContactId = getClientId(newMsg.contactId);
          setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...newMsg, contactId: clientContactId } : m));
        } else if (payload.eventType === 'DELETE') {
          const oldMsg = payload.old;
          setMessages(prev => prev.filter(m => m.id !== oldMsg.id));
        }
      })
      .subscribe();

    // Subscribe to contacts changes (for real-time profile name/avatar/bio and new chats updates)
    const contactsChannel = supabase
      .channel('public-contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        const eventId = payload.new?.id || payload.old?.id;
        if (!eventId || !eventId.startsWith(`${user.email}:`)) return;
        const clientId = getClientId(eventId);

        if (payload.eventType === 'INSERT') {
          setContacts(prev => {
            if (prev.some(c => c.id === clientId)) return prev;
            return [...prev, { ...payload.new, id: clientId }];
          });
        } else if (payload.eventType === 'UPDATE') {
          setContacts(prev => prev.map(c => c.id === clientId ? { ...c, ...payload.new, id: clientId } : c));
        } else if (payload.eventType === 'DELETE') {
          setContacts(prev => prev.filter(c => c.id !== clientId));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [user, getClientId]);

  // --- Actions ---
  const sendMessage = useCallback(async (contactId, text, attachmentUrl, replyTo = null) => {
    const now = Date.now();
    const timeText = new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMsg = {
      contactId, text: text || '',
      isFromMe: true, timestamp: now, timeText, isRead: true,
      attachmentUrl: attachmentUrl || null,
      replyToId: replyTo?.id || null,
      replyToText: replyTo?.text || null,
      replyToSender: replyTo?.sender || null
    };

    // Optimistic local update
    const localMsg = { ...newMsg, id: now };
    setMessages(prev => [...prev, localMsg].sort((a, b) => a.timestamp - b.timestamp));
    setContacts(prev => prev.map(c => c.id === contactId ? {
      ...c, isRecent: true,
      recentMessageText: attachmentUrl && !text ? "Sent an image" : text,
      recentMessageTime: "Just now", recentMessageIsUnread: false
    } : c));

    const dbContactId = getDbId(contactId);
    const dbMsg = { ...newMsg, contactId: dbContactId };

    try {
      await supabase.from('messages').insert([dbMsg]);
      await supabase.from('contacts').update({
        isRecent: true,
        recentMessageText: attachmentUrl && !text ? "Sent an image" : text,
        recentMessageTime: "Just now", recentMessageIsUnread: false
      }).eq('id', dbContactId);
    } catch (err) {
      localStorage.setItem('aahat_messages', JSON.stringify([...messages, localMsg]));
      localStorage.setItem('aahat_contacts', JSON.stringify(contacts));
    }
  }, [messages, contacts, getDbId]);

  const addReaction = useCallback(async (msgId, emoji) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: emoji } : m));
    try { await supabase.from('messages').update({ reaction: emoji }).eq('id', msgId); }
    catch (e) { console.error(e); }
  }, []);

  const deleteMessage = useCallback(async (msgId) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    try { await supabase.from('messages').delete().eq('id', msgId); }
    catch (e) { console.error(e); }
  }, []);

  const selectContact = useCallback(async (id) => {
    setSelectedContactId(id);
    const dbId = getDbId(id);
    setContacts(prev => {
      const exists = prev.some(c => c.id === id);
      if (!exists && id === 'me' && user) {
        const selfContact = {
          id: 'me',
          name: `${user.name} (You)`,
          avatarUrl: '',
          isActive: true,
          lastActiveText: 'Online',
          isRecent: true,
          recentMessageText: 'Tap to send notes, reminders, or drafts to yourself.',
          recentMessageTime: '',
          recentMessageIsUnread: false,
          isGroup: false,
          memberCount: 0,
          description: 'Your personal notes and reminders container. Encrypted and synced.',
          unreadCount: 0,
          isPinned: true
        };
        // Async insert to DB using prefixed ID
        supabase.from('contacts').insert([{ ...selfContact, id: dbId }]).then(() => {});
        return [selfContact, ...prev];
      }
      return prev.map(c => c.id === id ? { ...c, recentMessageIsUnread: false } : c);
    });
    try { await supabase.from('contacts').update({ recentMessageIsUnread: false }).eq('id', dbId); }
    catch (e) { /* silent */ }
  }, [user, getDbId]);

  const toggleArchive = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isArchived: !c.isArchived } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isArchived: !contact.isArchived }).eq('id', getDbId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbId]);

  const togglePin = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isPinned: !contact.isPinned }).eq('id', getDbId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbId]);

  const toggleMute = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isMuted: !c.isMuted } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isMuted: !contact.isMuted }).eq('id', getDbId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbId]);

  const toggleFavorite = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isFavorite: !contact.isFavorite }).eq('id', getDbId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbId]);


  const clearChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.map(c => c.id === contactId ? {
      ...c, isRecent: false, recentMessageText: '', recentMessageTime: '', recentMessageIsUnread: false, unreadCount: 0
    } : c));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', getDbId(contactId));
      await supabase.from('contacts').update({
        isRecent: false,
        recentMessageText: '',
        recentMessageTime: '',
        recentMessageIsUnread: false,
        unreadCount: 0
      }).eq('id', getDbId(contactId));
    } catch (e) {
      console.error("Error clearing chat:", e);
    }
  }, [selectedContactId, getDbId]);

  const deleteChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.filter(c => c.id !== contactId));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', getDbId(contactId));
      await supabase.from('contacts').delete().eq('id', getDbId(contactId));
    } catch (e) {
      console.error("Error deleting chat:", e);
    }
  }, [selectedContactId, getDbId]);

  const uploadFile = useCallback(async (file, oldUrl = null) => {
    if (oldUrl && oldUrl.includes('supabase.co/storage/v1/object/public/')) {
      try {
        const parts = oldUrl.split('/storage/v1/object/public/');
        if (parts.length > 1) {
          const pathParts = parts[1].split('/');
          const bucket = pathParts[0];
          const filePath = pathParts.slice(1).join('/');
          await supabase.storage.from(bucket).remove([filePath]);
        }
      } catch (delErr) {
        console.warn("Failed to remove old file from storage", delErr);
      }
    }

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `avatars/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('attachments').upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(filePath);
      return publicUrl;
    } catch (err) {
      console.warn("Upload failed, using base64 fallback", err);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.readAsDataURL(file);
      });
    }
  }, []);

  const updateProfile = useCallback(async (name, bio, avatarUrl) => {
    try {
      await supabase.auth.updateUser({
        data: { name, avatarUrl }
      });

      await supabase.from('contacts').update({
        name: `${name} (You)`,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      }).eq('id', getDbId('me'));

      setContacts(prev => prev.map(c => c.id === 'me' ? {
        ...c,
        name: `${name} (You)`,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      } : c));
    } catch (err) {
      console.error("Profile update failed:", err);
    }
  }, [getDbId]);

  // --- Derived Data ---
  const activeContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId),
    [contacts, selectedContactId]
  );

  const activeMessages = useMemo(
    () => messages.filter(m => m.contactId === selectedContactId),
    [messages, selectedContactId]
  );

  return {
    contacts, messages, isLoading,
    selectedContactId, typingStatus,
    activeContact, activeMessages,
    sendMessage, addReaction, deleteMessage,
    selectContact, uploadFile,
    setSelectedContactId,
    toggleArchive, togglePin, toggleMute, toggleFavorite,
    clearChat, deleteChat,
    updateProfile
  };
}
