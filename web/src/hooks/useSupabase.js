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
  const getDbContactId = useCallback((clientId) => {
    if (!user) return clientId;
    const cleanEmail = user.email.toLowerCase();
    return clientId.includes(':') ? clientId : `${cleanEmail}:${clientId}`;
  }, [user]);

  const getClientId = useCallback((dbId) => {
    if (!dbId) return '';
    const splitIndex = dbId.indexOf(':');
    return splitIndex !== -1 ? dbId.substring(splitIndex + 1) : dbId;
  }, []);

  // Helper to generate a shared 1-to-1 conversation ID
  const getConversationId = useCallback((clientId) => {
    if (!user || clientId === 'me') return `${user.email.toLowerCase()}:me`;
    const userPart = user.email.split('@')[0].toLowerCase();
    const clientPart = clientId.toLowerCase();
    const users = [userPart, clientPart].sort();
    return `conversation:${users[0]}_${users[1]}`;
  }, [user]);

  // --- Data Fetching ---
  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Fetch Contacts isolated to this user
      let { data: dbContacts, error: cErr } = await supabase
        .from('contacts')
        .select('*')
        .like('id', `${user.email.toLowerCase()}:%`);
      if (cErr) throw cErr;

      // Fetch all users to dynamically join name, avatar, bio (description)
      let { data: dbUsers } = await supabase
        .from('users')
        .select('email, name, avatarUrl, description');

      let finalContacts = (dbContacts || []).map(c => {
        const clientId = getClientId(c.id).toLowerCase();
        const matchingUser = (dbUsers || []).find(u => u.email.toLowerCase().split('@')[0] === clientId);
        if (matchingUser && clientId !== 'me') {
          return {
            ...c,
            id: clientId,
            name: matchingUser.name || c.name,
            avatarUrl: matchingUser.avatarUrl || '',
            description: matchingUser.description || ''
          };
        }
        return {
          ...c,
          id: clientId
        };
      });

      // Ensure 'me' (Message Yourself) contact exists
      const hasSelf = finalContacts.some(c => c.id === 'me');
      const currentUserProfile = (dbUsers || []).find(u => u.email.toLowerCase() === user.email.toLowerCase());
      const userBio = currentUserProfile?.description || '';

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
          description: userBio || 'Your personal notes and reminders container. Encrypted and synced.',
          unreadCount: 0,
          isPinned: true
        };
        try {
          await supabase.from('contacts').insert([{ ...selfContact, id: getDbContactId('me') }]);
          finalContacts = [selfContact, ...finalContacts];
        } catch (insSelfErr) {
          finalContacts = [selfContact, ...finalContacts];
        }
      } else {
        // Keep the displayed name and avatar synchronized with the logged-in user
        finalContacts = finalContacts.map(c => c.id === 'me' ? { 
          ...c, 
          name: `${user.name} (You)`,
          avatarUrl: user.avatarUrl || c.avatarUrl || '',
          description: userBio || c.description || ''
        } : c);
      }

      // Fetch Messages isolated to this user (either self-chat or shared conversation)
      const username = user.email.split('@')[0].toLowerCase();
      let { data: dbMessages, error: mErr } = await supabase
        .from('messages')
        .select('*')
        .or(`contactId.eq.${user.email.toLowerCase()}:me,conversationId.like.conversation:%${username}%`);
      if (mErr) throw mErr;

      const mappedMessages = (dbMessages || []).map(m => {
        let contactId = 'me';
        if (m.conversationId && m.conversationId.startsWith('conversation:')) {
          const parts = m.conversationId.substring('conversation:'.length).split('_');
          contactId = parts.find(p => p !== username) || 'me';
        }
        return {
          ...m,
          contactId,
          isFromMe: m.sender.toLowerCase() === user.email.toLowerCase()
        };
      });

      // Dynamically calculate preview states (recent message, unread count) based on loaded messages
      finalContacts = finalContacts.map(c => {
        if (c.id === 'me') return c;
        const contactMsgs = mappedMessages.filter(m => m.contactId === c.id);
        if (contactMsgs.length > 0) {
          const lastMsg = contactMsgs[contactMsgs.length - 1];
          const unreadCount = contactMsgs.filter(m => !m.isFromMe && !m.isRead).length;
          return {
            ...c,
            isRecent: true,
            recentMessageText: lastMsg.attachmentUrl && !lastMsg.text ? "Sent an image" : lastMsg.text,
            recentMessageTime: lastMsg.timeText || "Just now",
            recentMessageIsUnread: unreadCount > 0,
            unreadCount: unreadCount
          };
        }
        return c;
      });

      setContacts(finalContacts);
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
          if (!newMsg) return;
          const username = user.email.split('@')[0];
          const isSelf = newMsg.contactId === `${user.email}:me`;
          
          let isShared = false;
          if (newMsg.conversationId && newMsg.conversationId.startsWith('conversation:')) {
            const participants = newMsg.conversationId.substring('conversation:'.length).split('_');
            isShared = participants.includes(username);
          }
          if (!isSelf && !isShared) return;

          let clientContactId = 'me';
          if (isShared) {
            const parts = newMsg.conversationId.substring('conversation:'.length).split('_');
            clientContactId = parts.find(p => p !== username) || 'me';
          }
          
          const clientMsg = { 
            ...newMsg, 
            contactId: clientContactId,
            isFromMe: newMsg.sender === user.email
          };

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
              const newUnreadCount = clientMsg.isFromMe ? c.unreadCount : (c.unreadCount || 0) + 1;
              return {
                ...c, isRecent: true,
                recentMessageText: clientMsg.attachmentUrl && !clientMsg.text ? "Sent an image" : clientMsg.text,
                recentMessageTime: "Just now",
                recentMessageIsUnread: !clientMsg.isFromMe,
                unreadCount: newUnreadCount
              };
            }
            return c;
          }));

          // Trigger local browser notification and sound for incoming messages
          if (!clientMsg.isFromMe) {
            try {
              // Play a light synth-beep audio sound
              const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
              const osc = audioCtx.createOscillator();
              const gainNode = audioCtx.createGain();
              osc.connect(gainNode);
              gainNode.connect(audioCtx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
              gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
              gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
              osc.start();
              osc.stop(audioCtx.currentTime + 0.35);
            } catch (soundErr) {
              console.warn("Notification sound blocked by autoplay policy", soundErr);
            }

            if (Notification.permission === 'granted') {
              new Notification(clientMsg.sender.split('@')[0], {
                body: clientMsg.text || 'Sent an image',
                icon: '/favicon.ico'
              });
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          if (!newMsg) return;
          const username = user.email.split('@')[0];
          const isSelf = newMsg.contactId === `${user.email}:me`;
          
          let isShared = false;
          if (newMsg.conversationId && newMsg.conversationId.startsWith('conversation:')) {
            const participants = newMsg.conversationId.substring('conversation:'.length).split('_');
            isShared = participants.includes(username);
          }
          if (!isSelf && !isShared) return;

          let clientContactId = 'me';
          if (isShared) {
            const parts = newMsg.conversationId.substring('conversation:'.length).split('_');
            clientContactId = parts.find(p => p !== username) || 'me';
          }
          setMessages(prev => prev.map(m => m.id === newMsg.id ? { ...newMsg, contactId: clientContactId, isFromMe: newMsg.sender === user.email } : m));
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
        if (!eventId || !eventId.startsWith(`${user.email.toLowerCase()}:`)) return;
        const clientId = getClientId(eventId);

        if (payload.eventType === 'INSERT') {
          setContacts(prev => {
            if (prev.some(c => c.id === clientId)) return prev;
            return [...prev, { ...payload.new, id: clientId }];
          });
        } else if (payload.eventType === 'UPDATE') {
          setContacts(prev => prev.map(c => c.id === clientId ? { 
            ...c, 
            ...payload.new, 
            id: clientId,
            avatarUrl: c.avatarUrl,
            description: c.description
          } : c));
        } else if (payload.eventType === 'DELETE') {
          setContacts(prev => prev.filter(c => c.id !== clientId));
        }
      })
      .subscribe();

    // Subscribe to users changes (for real-time profile updates of contacts)
    const usersChannel = supabase
      .channel('public-users-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const updatedUser = payload.new;
          if (!updatedUser) return;
          const contactId = updatedUser.email.split('@')[0].toLowerCase();
          setContacts(prev => prev.map(c => {
            if (c.id === contactId) {
              return {
                ...c,
                name: updatedUser.name || c.name,
                avatarUrl: updatedUser.avatarUrl || '',
                description: updatedUser.description || '',
                stories: updatedUser.stories || []
              };
            }
            if (c.id === 'me' && updatedUser.email.toLowerCase() === user.email.toLowerCase()) {
              return {
                ...c,
                name: `${updatedUser.name} (You)`,
                avatarUrl: updatedUser.avatarUrl || '',
                description: updatedUser.description || '',
                stories: updatedUser.stories || []
              };
            }
            return c;
          }));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(contactsChannel);
      supabase.removeChannel(usersChannel);
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

    const dbContactId = getDbContactId(contactId);
    const dbMsg = { 
      ...newMsg, 
      contactId: dbContactId,
      conversationId: getConversationId(contactId),
      sender: user.email
    };

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
  }, [messages, contacts, getDbContactId, getConversationId]);

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
    const dbId = getDbContactId(id);
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
  }, [user, getDbContactId]);

  const toggleArchive = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isArchived: !c.isArchived } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isArchived: !contact.isArchived }).eq('id', getDbContactId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbContactId]);

  const togglePin = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isPinned: !c.isPinned } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isPinned: !contact.isPinned }).eq('id', getDbContactId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbContactId]);

  const toggleMute = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isMuted: !c.isMuted } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isMuted: !contact.isMuted }).eq('id', getDbContactId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbContactId]);

  const toggleFavorite = useCallback(async (id) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, isFavorite: !c.isFavorite } : c));
    try {
      const contact = contacts.find(c => c.id === id);
      if (contact) {
        await supabase.from('contacts').update({ isFavorite: !contact.isFavorite }).eq('id', getDbContactId(id));
      }
    } catch (e) { /* silent */ }
  }, [contacts, getDbContactId]);


  const clearChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.map(c => c.id === contactId ? {
      ...c, isRecent: false, recentMessageText: '', recentMessageTime: '', recentMessageIsUnread: false, unreadCount: 0
    } : c));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', getDbContactId(contactId));
      await supabase.from('contacts').update({
        isRecent: false,
        recentMessageText: '',
        recentMessageTime: '',
        recentMessageIsUnread: false,
        unreadCount: 0
      }).eq('id', getDbContactId(contactId));
    } catch (e) {
      console.error("Error clearing chat:", e);
    }
  }, [selectedContactId, getDbContactId]);

  const deleteChat = useCallback(async (contactId) => {
    setMessages(prev => prev.filter(m => m.contactId !== contactId));
    setContacts(prev => prev.filter(c => c.id !== contactId));
    if (selectedContactId === contactId) {
      setSelectedContactId(null);
    }

    try {
      await supabase.from('messages').delete().eq('contactId', getDbContactId(contactId));
      await supabase.from('contacts').delete().eq('id', getDbContactId(contactId));
    } catch (e) {
      console.error("Error deleting chat:", e);
    }
  }, [selectedContactId, getDbContactId]);

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

      await supabase.from('users').update({
        name,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      }).eq('email', user.email.toLowerCase());

      await supabase.from('contacts').update({
        name: `${name} (You)`,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      }).eq('id', getDbContactId('me'));

      setContacts(prev => prev.map(c => c.id === 'me' ? {
        ...c,
        name: `${name} (You)`,
        avatarUrl: avatarUrl || '',
        description: bio || ''
      } : c));
    } catch (err) {
      console.error("Profile update failed:", err);
    }
  }, [getDbContactId, user]);

  const postStory = useCallback(async (type, contentOrUrl, bgGradient = '') => {
    if (!user) return;
    
    // Fetch the current user's profile to get existing stories
    const { data: profile } = await supabase
      .from('users')
      .select('stories')
      .eq('email', user.email.toLowerCase())
      .single();
      
    const currentStories = profile?.stories || [];
    const newStory = {
      id: `m-${Date.now()}`,
      type,
      content: type === 'text' ? contentOrUrl : undefined,
      url: type === 'video' ? contentOrUrl : undefined,
      bgGradient: type === 'text' ? bgGradient : undefined,
      timestamp: Date.now(),
      views: 0
    };
    
    const updatedStories = [newStory, ...currentStories];
    
    try {
      await supabase
        .from('users')
        .update({ stories: updatedStories })
        .eq('email', user.email.toLowerCase());
        
      setContacts(prev => prev.map(c => c.id === 'me' ? { ...c, stories: updatedStories } : c));
    } catch (e) {
      console.error("Failed to post story:", e);
    }
  }, [user]);

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
    updateProfile, postStory
  };
}
