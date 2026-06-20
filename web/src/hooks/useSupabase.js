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

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch Contacts
      let { data: dbContacts, error: cErr } = await supabase.from('contacts').select('*');
      if (cErr) throw cErr;

      let finalContacts = dbContacts || [];

      // Ensure 'me' (Message Yourself) contact exists
      const hasSelf = finalContacts.some(c => c.id === 'me');
      if (!hasSelf && user) {
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
        try {
          await supabase.from('contacts').insert([selfContact]);
          finalContacts = [selfContact, ...finalContacts];
        } catch (insSelfErr) {
          finalContacts = [selfContact, ...finalContacts];
        }
      } else if (hasSelf && user) {
        // Keep the displayed name synchronized with the logged-in user name
        finalContacts = finalContacts.map(c => c.id === 'me' ? { ...c, name: `${user.name} (You)` } : c);
      }

      setContacts(finalContacts);

      // Fetch Messages
      let { data: dbMessages, error: mErr } = await supabase.from('messages').select('*');
      if (mErr) throw mErr;

      setMessages((dbMessages || []).sort((a, b) => a.timestamp - b.timestamp));
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
        finalContacts = [selfContact, ...finalContacts];
      } else if (hasSelf && user) {
        finalContacts = finalContacts.map(c => c.id === 'me' ? { ...c, name: `${user.name} (You)` } : c);
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
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;

            // Match and resolve optimistic messages to prevent duplicates
            if (newMsg.isFromMe) {
              const optIndex = prev.findIndex(m => 
                m.isFromMe &&
                m.contactId === newMsg.contactId &&
                m.text === newMsg.text &&
                m.attachmentUrl === newMsg.attachmentUrl &&
                Math.abs(Number(m.timestamp) - Number(newMsg.timestamp)) < 3000
              );
              if (optIndex !== -1) {
                const updated = [...prev];
                updated[optIndex] = { ...updated[optIndex], id: newMsg.id };
                return updated;
              }
            }

            return [...prev, newMsg].sort((a, b) => a.timestamp - b.timestamp);
          });
          setContacts(prev => prev.map(c => {
            if (c.id === newMsg.contactId) {
              return {
                ...c, isRecent: true,
                recentMessageText: newMsg.attachmentUrl && !newMsg.text ? "Sent an image" : newMsg.text,
                recentMessageTime: "Just now",
                recentMessageIsUnread: !newMsg.isFromMe
              };
            }
            return c;
          }));
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        } else if (payload.eventType === 'DELETE') {
          setMessages(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    // Subscribe to contacts changes (for real-time profile name/avatar/bio and new chats updates)
    const contactsChannel = supabase
      .channel('public-contacts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setContacts(prev => {
            if (prev.some(c => c.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === 'UPDATE') {
          setContacts(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
        } else if (payload.eventType === 'DELETE') {
          setContacts(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(contactsChannel);
    };
  }, [user]);

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

    try {
      await supabase.from('messages').insert([newMsg]);
      await supabase.from('contacts').update({
        isRecent: true,
        recentMessageText: attachmentUrl && !text ? "Sent an image" : text,
        recentMessageTime: "Just now", recentMessageIsUnread: false
      }).eq('id', contactId);
    } catch (err) {
      localStorage.setItem('aahat_messages', JSON.stringify([...messages, localMsg]));
      localStorage.setItem('aahat_contacts', JSON.stringify(contacts));
    }
  }, [messages, contacts]);

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
        // Async insert to DB
        supabase.from('contacts').insert([selfContact]).then(() => {});
        return [selfContact, ...prev];
      }
      return prev.map(c => c.id === id ? { ...c, recentMessageIsUnread: false } : c);
    });
    try { await supabase.from('contacts').update({ recentMessageIsUnread: false }).eq('id', id); }
    catch (e) { /* silent */ }
  }, [user]);

  const toggleArchive = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isArchived: !c.isArchived } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isArchived: !contact.isArchived }).eq('id', id);
      }
    } catch (e) { /* silent */ }
  }, [contacts]);

  const togglePin = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isPinned: !contact.isPinned }).eq('id', id);
      }
    } catch (e) { /* silent */ }
  }, [contacts]);

  const toggleMute = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isMuted: !c.isMuted } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isMuted: !contact.isMuted }).eq('id', id);
      }
    } catch (e) { /* silent */ }
  }, [contacts]);

  const toggleFavorite = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isFavorite: !contact.isFavorite }).eq('id', id);
      }
    } catch (e) { /* silent */ }
  }, [contacts]);

  const resetData = useCallback(async () => {
    try {
      await supabase.from('messages').delete().neq('id', 0);
      await supabase.from('contacts').delete().neq('id', 'none');
    } catch (e) { /* silent */ }
    localStorage.removeItem('aahat_contacts');
    localStorage.removeItem('aahat_messages');
    setSelectedContactId(null);
    fetchData();
  }, [fetchData]);

  const clearChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.map(c => c.id === contactId ? {
      ...c, isRecent: false, recentMessageText: '', recentMessageTime: '', recentMessageIsUnread: false, unreadCount: 0
    } : c));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', contactId);
      await supabase.from('contacts').update({
        isRecent: false,
        recentMessageText: '',
        recentMessageTime: '',
        recentMessageIsUnread: false,
        unreadCount: 0
      }).eq('id', contactId);
    } catch (e) {
      console.error("Error clearing chat:", e);
    }
  }, [selectedContactId]);

  const deleteChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.filter(c => c.id !== contactId));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', contactId);
      await supabase.from('contacts').delete().eq('id', contactId);
    } catch (e) {
      console.error("Error deleting chat:", e);
    }
  }, [selectedContactId]);

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
      }).eq('id', 'me');

      setContacts(prev => prev.map(c => c.id === 'me' ? {
        ...c,
        name: `${name} (You)`,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      } : c));
    } catch (err) {
      console.error("Profile update failed:", err);
    }
  }, []);

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
    selectContact, resetData, uploadFile,
    setSelectedContactId,
    toggleArchive, togglePin, toggleMute, toggleFavorite,
    clearChat, deleteChat,
    updateProfile
  };
}
