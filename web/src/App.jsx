import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useConversations } from './hooks/useConversations';
import { useMessages } from './hooks/useMessagesProduction';
import { usePresence } from './hooks/usePresence';
import { useCalling } from './hooks/useCalling';
import { useStatuses } from './hooks/useStatuses';
import { useChannels } from './hooks/useChannels';
import { useAahatContacts } from './hooks/useAahatContacts';
import { supabase, isSupabaseConfigured } from './supabase';

import AuthScreen from './components/AuthScreenProduction';
import PasswordRecoveryGate from './components/PasswordRecoveryGate';
import MfaChallengeScreen from './components/MfaChallengeScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import StatusSection from './components/StatusSection';
import SettingsPanel from './components/SettingsPanelProduction';
import './ConnectAahatModal.css';
import CallingOverlay from './components/CallingOverlay';
import AdminEmbedPanel from './components/AdminEmbedProduction';
import SafeAvatar from './components/SafeAvatar';
import ContactsSection from './components/ContactsSection';
import { requestNotificationPermission } from './firebase';

import { ArrowLeft, Lock, MessageSquare, CircleDot, Settings, LogOut, Sparkles, X, Shield, Users } from 'lucide-react';

const BrandLogo = () => (
  <img src="/logo.png" alt="Aahat" className="brand-logo-image" />
);

const playNotificationChime = async () => {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  try {
    if (context.state === 'suspended') await context.resume();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    gain.connect(context.destination);
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + (index * 0.11));
      oscillator.stop(context.currentTime + 0.3 + (index * 0.11));
    });
    window.setTimeout(() => context.close().catch(() => undefined), 650);
  } catch {
    context.close().catch(() => undefined);
  }
};

/**
 * App â€” Root component for Aahat messaging application (V2).
 * Uses normalized database hooks for auth, conversations, messages,
 * presence, calling, and statuses.
 */
export default function App() {
  // --- Auth ---
  const {
    user, profile, isLoading: isAuthLoading,
    mfaChallenge, refreshMfaSession,
    signOut, updateProfile
  } = useAuth();

  // --- Conversations ---
  const {
    conversations, selectedConversationId, activeConversation,
    selectConversation, setSelectedConversationId,
    createGroup,
    fetchGroupMembers, addGroupMember, removeGroupMember,
    updateGroupMemberRole, leaveGroup,
    toggleMute, togglePin, toggleArchive, toggleFavorite,
    clearChat, deleteChat,
    isLoading: isConvLoading,
    refetch: refetchConversations
  } = useConversations(user);

  const {
    credentials: aahatCredentials,
    incomingRequests,
    outgoingRequests,
    isLoading: areContactsLoading,
    requestContact,
    respondToRequest,
    rotatePin,
    removeContact,
    blockContact
  } = useAahatContacts(user, refetchConversations);

  // --- Messages (for the active conversation) ---
  const {
    messages: activeMessages,
    sendMessage, retryMessage, editMessage, deleteForMe, deleteForEveryone,
    addReaction, removeReaction,
    markAsRead, uploadFile, searchMessages, fetchSharedMedia, refetch: refetchMessages, loadMore, hasMore, isLoadingMore
  } = useMessages(user, selectedConversationId);

  // --- Presence ---
  const presenceContactIds = conversations
    .filter(conversation => conversation.type === 'direct' && conversation.otherMemberId)
    .map(conversation => conversation.otherMemberId);
  const { canViewOnlineStatus, isUserOnline, getLastSeen, setTyping, getTypingUsers } = usePresence(user, profile, presenceContactIds);

  // --- Calling ---
  const {
    callState, callDuration, isMuted: isCallMuted, isCameraOff, isSpeakerOn, isScreenSharing,
    localStream, remoteStream, callError, clearCallError,
    startCall, answerCall, hangup, rejectCall,
    toggleMute: toggleCallMute, toggleCamera, switchCamera, toggleScreenShare, setIsSpeakerOn
  } = useCalling(user);

  // --- Statuses ---
  const {
    myStatuses, otherStatuses, postStatus, viewStatus, deleteStatus
  } = useStatuses(user);

  // --- Channels ---
  const channelsData = useChannels(user);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState('chats');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newChatId, setNewChatId] = useState('');
  const [newChatPin, setNewChatPin] = useState('');
  const [newChatStep, setNewChatStep] = useState('id');
  const [newChatError, setNewChatError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [activeToast, setActiveToast] = useState(null);
  const resetNewChatForm = useCallback(() => {
    setNewChatId('');
    setNewChatPin('');
    setNewChatStep('id');
    setNewChatError('');
    setIsConnecting(false);
  }, []);
  const openNewChatModal = useCallback(() => {
    resetNewChatForm();
    setShowNewChatModal(true);
  }, [resetNewChatForm]);
  const closeNewChatModal = useCallback(() => {
    setShowNewChatModal(false);
    resetNewChatForm();
  }, [resetNewChatForm]);


  // Mobile responsive
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock an open mobile chat to the browser's actually visible area. This keeps
  // the contact header fixed while only the message list shrinks for the keyboard.
  useEffect(() => {
    const isOpenMobileChat = isMobile && activeTab === 'chats' && selectedConversationId;
    if (!isOpenMobileChat) return undefined;
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = Math.round(viewport?.height || window.innerHeight);
      const offsetTop = Math.round(viewport?.offsetTop || 0);
      document.documentElement.style.setProperty('--aahat-chat-viewport-height', `${height}px`);
      document.documentElement.style.setProperty('--aahat-chat-viewport-top', `${offsetTop}px`);
    };
    syncViewport();
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    window.addEventListener('resize', syncViewport);
    return () => {
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
      window.removeEventListener('resize', syncViewport);
      document.documentElement.style.removeProperty('--aahat-chat-viewport-height');
      document.documentElement.style.removeProperty('--aahat-chat-viewport-top');
    };
  }, [isMobile, activeTab, selectedConversationId]);
  // Read means the conversation is actually open in a visible browser tab.
  useEffect(() => {
    if (!selectedConversationId || activeMessages.length === 0 || activeTab !== 'chats') return undefined;
    const acknowledgeRead = () => {
      if (document.visibilityState === 'visible') markAsRead().catch(console.error);
    };
    acknowledgeRead();
    window.addEventListener('focus', acknowledgeRead);
    document.addEventListener('visibilitychange', acknowledgeRead);
    return () => {
      window.removeEventListener('focus', acknowledgeRead);
      document.removeEventListener('visibilitychange', acknowledgeRead);
    };
  }, [selectedConversationId, activeMessages.length, activeTab, markAsRead]);

  // Delivered means the receiver's app is online, even if this conversation is
  // not currently open. This also catches messages received while the app was offline.
  useEffect(() => {
    if (!user) return undefined;
    const acknowledgePending = async () => {
      const { error } = await supabase.rpc('mark_pending_messages_delivered');
      if (error) console.warn('Could not acknowledge delivered messages:', error.message);
    };
    const acknowledgeWhenVisible = () => {
      if (document.visibilityState === 'visible') acknowledgePending();
    };
    acknowledgePending();
    window.addEventListener('online', acknowledgePending);
    window.addEventListener('focus', acknowledgePending);
    document.addEventListener('visibilitychange', acknowledgeWhenVisible);
    return () => {
      window.removeEventListener('online', acknowledgePending);
      window.removeEventListener('focus', acknowledgePending);
      document.removeEventListener('visibilitychange', acknowledgeWhenVisible);
    };
  }, [user]);

  // Toast auto-dismiss
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => setActiveToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Durable message notifications are created by the database trigger. Listening
  // to the recipient's own rows keeps delivery receipts and previews in sync.
  const selectedConvRef = useRef(null);
  useEffect(() => { selectedConvRef.current = selectedConversationId; }, [selectedConversationId]);

  useEffect(() => {
    if (!user) return undefined;
    let mounted = true;

    const markNotificationRead = async (notificationId) => {
      if (!notificationId) return;
      const { error } = await supabase.from('user_notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', user.id);
      if (error) console.warn('Could not mark notification as read:', error.message);
    };

    const showNotification = async (notification) => {
      if (!mounted || !notification || notification.type !== 'message') return;
      const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
      const conversationId = data.conversation_id;
      const messageId = data.message_id;
      const notificationSettings = profile?.notification_settings || {};
      const previewsEnabled = notificationSettings.previews !== false;
      const soundEnabled = notificationSettings.sound !== false;
      const displayTitle = previewsEnabled ? (notification.title || 'Aahat') : 'Aahat';
      const displayBody = previewsEnabled ? (notification.body || 'Sent a message') : 'New message';

      if (messageId) {
        const { error } = await supabase.rpc('mark_message_delivered', { p_message_id: messageId });
        if (error) console.warn('Could not acknowledge message delivery:', error.message);
      }

      if (conversationId === selectedConvRef.current && document.visibilityState === 'visible') {
        await markNotificationRead(notification.id);
        return;
      }

      const conv = conversations.find(item => item.id === conversationId);
      if (soundEnabled && document.visibilityState === 'visible') void playNotificationChime();
      setActiveToast({
        id: notification.id,
        notificationId: notification.id,
        sender: previewsEnabled ? (displayTitle || conv?.name) : 'Aahat',
        text: displayBody,
        conversationId,
        avatarUrl: conv?.avatarUrl || ''
      });

      if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        const options = {
          body: displayBody,
          icon: conv?.avatarUrl || '/logo.png',
          badge: '/logo.png',
          tag: `message-${conversationId || notification.id}`,
          data: { conversationId },
          silent: !soundEnabled
        };
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations[0]) await registrations[0].showNotification(displayTitle, options);
            else new Notification(displayTitle, options);
          } else {
            new Notification(displayTitle, options);
          }
        } catch (error) {
          console.warn('Could not display browser notification:', error.message);
        }
      }
    };

    const toastChannel = supabase
      .channel(`message-notifications-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`
      }, (payload) => { void showNotification(payload.new); })
      .subscribe();

    supabase.from('user_notifications')
      .select('id,type,title,body,data,is_read,created_at')
      .eq('user_id', user.id)
      .eq('type', 'message')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.warn('Could not load message notifications:', error.message);
        else if (data) void showNotification(data);
      });

    return () => {
      mounted = false;
      supabase.removeChannel(toastChannel);
    };
  }, [user, conversations, profile?.notification_settings]);
  // FCM registration is tied to the current account through a security-definer
  // RPC so a shared browser token cannot remain attached to a previous user.
  const registerPushToken = useCallback(async () => {
    const token = await requestNotificationPermission();
    if (!token || !user) throw new Error('Notification permission was not granted or push is unsupported on this device.');
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_provider: 'fcm'
    });
    if (error) throw error;
    return true;
  }, [user]);

  const handleRequestNotificationPermission = useCallback(
    () => registerPushToken(true),
    [registerPushToken]
  );

  useEffect(() => {
    if (user && 'Notification' in window && Notification.permission === 'granted') {
      void registerPushToken().catch(error => console.warn('Could not refresh push token:', error.message));
    }
  }, [user, registerPushToken]);
  // Popstate for mobile back
  useEffect(() => {
    const handlePopState = () => {
      setSelectedConversationId(null);
      setIsMobileSidebarOpen(true);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSelectedConversationId]);

  useEffect(() => {
    if (selectedConversationId && isMobile) {
      if (!window.history.state?.isChatOpen) {
        window.history.pushState({ isChatOpen: true }, '');
      }
    }
  }, [selectedConversationId, isMobile]);

  // --- Handlers ---
  const handleSelectConversation = useCallback((id) => {
    selectConversation(id);
    setActiveTab('chats');
    setIsMobileSidebarOpen(false);
  }, [selectConversation]);

  // A background notification opens the exact conversation encoded by the
  // service worker, then removes the routing query from the address bar.
  useEffect(() => {
    const conversationId = new URLSearchParams(window.location.search).get('conversation');
    if (!conversationId || !conversations.some(item => item.id === conversationId)) return;
    handleSelectConversation(conversationId);
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('conversation');
    window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
  }, [conversations, handleSelectConversation]);
  const handleMobileBack = useCallback(() => {
    if (window.history.state?.isChatOpen) {
      window.history.back();
    } else {
      setSelectedConversationId(null);
      setIsMobileSidebarOpen(true);
    }
  }, [setSelectedConversationId]);

  const handleSend = useCallback(async (text, attachmentPayload, replyPayload) => {
    const options = {};
    const attachmentUrl = typeof attachmentPayload === 'string' ? attachmentPayload : attachmentPayload?.url;
    if (attachmentPayload && typeof attachmentPayload === 'object') {
      options.attachmentName = attachmentPayload.name || null;
      options.attachmentSize = attachmentPayload.size || null;
      options.attachmentMimeType = attachmentPayload.mimeType || null;
    }
    if (attachmentUrl) {
      const mimeType = options.attachmentMimeType || '';
      // Determine type from MIME metadata first, then URL fallback
      if (mimeType.startsWith('audio/') || (typeof attachmentUrl === 'string' && attachmentUrl.includes('voice-note'))) {
        options.messageType = 'voice_note';
        options.attachmentUrl = attachmentUrl;
      } else if (mimeType.startsWith('image/') || (typeof attachmentUrl === 'string' && attachmentUrl.match(/\.(jpg|jpeg|png|gif|webp)/i))) {
        options.messageType = 'image';
        options.attachmentUrl = attachmentUrl;
      } else if (mimeType.startsWith('video/') || (typeof attachmentUrl === 'string' && attachmentUrl.match(/\.(mp4|webm|mov)/i))) {
        options.messageType = 'video';
        options.attachmentUrl = attachmentUrl;
      } else if (mimeType || (typeof attachmentUrl === 'string' && attachmentUrl.match(/\.(pdf|doc|docx|zip)/i))) {
        options.messageType = 'file';
        options.attachmentUrl = attachmentUrl;
      } else if (typeof attachmentUrl === 'string' && attachmentUrl.startsWith('data:')) {
        // Base64 fallback
        if (attachmentUrl.startsWith('data:image')) {
          options.messageType = 'image';
        } else if (attachmentUrl.startsWith('data:audio')) {
          options.messageType = 'voice_note';
        } else {
          options.messageType = 'file';
        }
        options.attachmentUrl = attachmentUrl;
      } else {
        options.attachmentUrl = attachmentUrl;
      }
    }
    if (replyPayload?.id) {
      options.replyToId = replyPayload.id;
    }

    await sendMessage(text, options);
  }, [sendMessage]);

  const handleStartCall = useCallback((type) => {
    if (!activeConversation) return;
    startCall(activeConversation, type);
  }, [activeConversation, startCall]);

  const handleNewChat = useCallback(async (e) => {
    e?.preventDefault();
    if (!newChatId.trim()) return;

    setIsConnecting(true);
    setNewChatError('');
    try {
      const result = await requestContact(newChatId, newChatStep === 'pin' ? newChatPin : '');
      closeNewChatModal();
      if (result?.conversation_id) {
        handleSelectConversation(result.conversation_id);
      } else {
        alert('Invitation sent to Aahat. You can chat after they accept it.');
      }
    } catch (err) {
      if (err?.code === 'AAHAT_PIN_REQUIRED' && newChatStep === 'id') {
        setNewChatStep('pin');
        setNewChatPin('');
      } else {
        setNewChatError(err.message || 'Could not connect to this user.');
      }
    } finally {
      setIsConnecting(false);
    }
  }, [closeNewChatModal, handleSelectConversation, newChatId, newChatPin, newChatStep, requestContact]);

  const handleCreateGroup = useCallback(async (e) => {
    e?.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      await createGroup(newGroupName.trim(), newGroupDesc.trim());
      setShowNewGroupModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
    } catch (err) {
      alert(err.message || 'Error creating group');
    }
  }, [newGroupName, newGroupDesc, createGroup]);

  const handleUpdateProfile = useCallback(async (updates) => {
    // SettingsPanel calls this with an object like { display_name, bio, avatar_url }
    // or { privacy_settings: {...} } etc.
    return updateProfile(updates);
  }, [updateProfile]);

  const handleLogout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  // --- Computed ---
  const unreadTotal = conversations.filter(c => 
    c.type !== 'self' && c.unreadCount > 0
  ).length;

  const typingUsersInActiveConv = selectedConversationId
    ? getTypingUsers(selectedConversationId)
    : [];

  // --- Render ---
  if (!isSupabaseConfigured) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '24px', background: 'var(--bg-gradient)', color: 'var(--text-primary)', textAlign: 'center' }}>
        <BrandLogo />
        <h2 style={{ margin: 0 }}>Supabase is not configured</h2>
        <p style={{ margin: 0, maxWidth: '520px', color: 'var(--text-secondary)' }}>
          Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to web/.env before running Aahat.
        </p>
      </div>
    );
  }

  if (isAuthLoading) {
    return (
      <div className="app-loading-screen" role="status" aria-live="polite">
        <BrandLogo />
        <span className="app-loading-label">Loading Aahat...</span>
      </div>
    );
  }

  if (mfaChallenge) {
    return <MfaChallengeScreen
      challenge={mfaChallenge}
      onVerified={refreshMfaSession}
      onSignOut={signOut}
    />;
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div
      className={`app-container ${isMobile && activeTab === 'chats' && selectedConversationId ? 'mobile-chat-open' : ''}`}
      id="app-container"
    >
      {/* Desktop Navigation Dock */}
      {!isMobile && (
        <div className="nav-dock">
          <div className="dock-top">
            <div className="dock-logo-container" title="Aahat">
              <BrandLogo />
            </div>
            <button
              className={`dock-btn ${activeTab === 'chats' ? 'active' : ''}`}
              onClick={() => setActiveTab('chats')}
              title="Chats"
              id="dock-tab-chats"
            >
              <MessageSquare size={20} />
              {unreadTotal > 0 && <span className="dock-badge-dot" />}
            </button>
            <button
              className={`dock-btn ${activeTab === 'contacts' ? 'active' : ''}`}
              onClick={() => setActiveTab('contacts')}
              title="Contacts"
              id="dock-tab-contacts"
            >
              <Users size={20} />
            </button>
            <button
              className={`dock-btn ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
              title="Stories"
              id="dock-tab-stories"
            >
              <CircleDot size={20} />
            </button>
          </div>
          <div className="dock-bottom">
            {profile?.role === 'super_admin' && (
              <button
                className={`dock-btn ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={() => setActiveTab('admin')}
                title="Admin Panel"
                id="dock-tab-admin"
              >
                <Shield size={20} />
              </button>
            )}
            <button
              className={`dock-btn ${activeTab === 'settings' ? 'active' : ''}`}
              onClick={() => setActiveTab('settings')}
              title="Settings"
              id="dock-tab-settings"
            >
              <Settings size={20} />
            </button>
            <button
              className="dock-btn logout"
              onClick={handleLogout}
              title="Sign Out"
              id="dock-tab-logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="main-content-window">
        {activeTab === 'chats' && (
          <>
            <Sidebar
              user={user}
              profile={profile}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              onSelectConversation={handleSelectConversation}
              onLogout={handleLogout}
              isMobileOpen={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              toggleArchive={toggleArchive}
              togglePin={togglePin}
              toggleMute={toggleMute}
              toggleFavorite={toggleFavorite}
              onNewChat={openNewChatModal}
              onNewGroup={() => setShowNewGroupModal(true)}
              isUserOnline={isUserOnline}
              canViewOnlineStatus={canViewOnlineStatus}
              isLoading={isConvLoading}
            />
            <ChatView
              conversation={activeConversation}
              messages={activeMessages}
              typingUsers={typingUsersInActiveConv}
              onSend={handleSend}
              onAddReaction={addReaction}
              onRemoveReaction={removeReaction}
              onDeleteForMe={deleteForMe}
              onDeleteForEveryone={deleteForEveryone}
              onEditMessage={editMessage}
              onRetryMessage={retryMessage}
              onLoadMoreMessages={loadMore}
              hasMoreMessages={hasMore}
              isLoadingMoreMessages={isLoadingMore}
              onUploadFile={uploadFile}
              onSearchMessages={searchMessages}
              onFetchSharedMedia={fetchSharedMedia}
              onBack={selectedConversationId ? handleMobileBack : undefined}
              onStartCall={handleStartCall}
              conversations={conversations}
              onClearChat={async () => { await clearChat(selectedConversationId); await refetchMessages(); }}
              onDeleteChat={() => deleteChat(selectedConversationId)}
              onToggleArchive={toggleArchive}
              onToggleMute={toggleMute}
              onSetTyping={setTyping}
              currentUserId={user?.id}
              isUserOnline={isUserOnline}
              canViewOnlineStatus={canViewOnlineStatus}
              getLastSeen={getLastSeen}
              onForwardMessage={async (message, targetConvId) => {
                if (!user || !targetConvId) return;
                await supabase.from('messages').insert({
                  conversation_id: targetConvId,
                  sender_id: user.id,
                  content: message.content || '',
                  attachment_url: message.attachment_url || null,
                  attachment_name: message.attachment_name || null,
                  attachment_size: message.attachment_size || null,
                  attachment_mime_type: message.attachment_mime_type || null,
                  message_type: message.message_type || 'text',
                  forwarded_from_id: message.id
                });
              }}
              onFetchGroupMembers={fetchGroupMembers}
              onAddGroupMember={addGroupMember}
              onRemoveGroupMember={removeGroupMember}
              onUpdateGroupMemberRole={updateGroupMemberRole}
              onLeaveGroup={leaveGroup}
            />
          </>
        )}

        {activeTab === 'contacts' && (
          <ContactsSection
            conversations={conversations}
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            isLoading={areContactsLoading}
            isUserOnline={isUserOnline}
            canViewOnlineStatus={canViewOnlineStatus}
            onAddContact={openNewChatModal}
            onSelectConversation={handleSelectConversation}
            onRespond={respondToRequest}
            onRemoveContact={removeContact}
            onBlockContact={blockContact}
          />
        )}

        {activeTab === 'status' && (
          <StatusSection
            myStatuses={myStatuses}
            otherStatuses={otherStatuses}
            user={user}
            profile={profile}
            onPostStatus={postStatus}
            onViewStatus={viewStatus}
            onDeleteStatus={deleteStatus}
            onSelectConversation={handleSelectConversation}
            onUploadFile={uploadFile}
            isUserOnline={isUserOnline}
            conversations={conversations}
            channels={channelsData.channels}
            myChannels={channelsData.myChannels}
            activeChannelId={channelsData.activeChannelId}
            activeChannelPosts={channelsData.activeChannelPosts}
            setActiveChannelId={channelsData.setActiveChannelId}
            onCreateChannel={channelsData.createChannel}
            onSubscribeToChannel={channelsData.subscribeToChannel}
            onUnsubscribeFromChannel={channelsData.unsubscribeFromChannel}
            onCreateChannelPost={channelsData.createChannelPost}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            user={user}
            profile={profile}
            onLogout={handleLogout}
            conversations={conversations}
            onUploadFile={uploadFile}
            onUpdateProfile={handleUpdateProfile}
            onRequestNotificationPermission={handleRequestNotificationPermission}
            aahatCredentials={aahatCredentials}
            onRotateAahatPin={rotatePin}
          />
        )}

        {activeTab === 'admin' && (
          <AdminEmbedPanel
            conversations={conversations}
            messages={activeMessages}
            isUserOnline={isUserOnline}
          />
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobile && !(activeTab === 'chats' && selectedConversationId) && (
        <div className="mobile-bottom-nav">
          <button
            className={`mobile-nav-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => { setActiveTab('chats'); setIsMobileSidebarOpen(true); }}
          >
            <MessageSquare size={20} />
            <span>Chats</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeTab === 'contacts' ? 'active' : ''}`}
            onClick={() => { setActiveTab('contacts'); setIsMobileSidebarOpen(false); }}
          >
            <Users size={20} />
            <span>Contacts</span>
          </button>
          <button
            className={`mobile-nav-btn ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => { setActiveTab('status'); setIsMobileSidebarOpen(false); }}
          >
            <CircleDot size={20} />
            <span>Stories</span>
          </button>
          {profile?.role === 'super_admin' && (
            <button
              className={`mobile-nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => setActiveTab('admin')}
            >
              <Shield size={20} />
              <span>Admin</span>
            </button>
          )}
          <button
            className={`mobile-nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => { setActiveTab('settings'); setIsMobileSidebarOpen(false); }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      )}

      <PasswordRecoveryGate />

      {callError && (
        <div className="call-error-toast" role="alert">
          <span>{callError}</span>
          <button type="button" onClick={clearCallError} aria-label="Dismiss call error">×</button>
        </div>
      )}
      {/* Calling Overlay */}
      {callState && (
        <CallingOverlay
          callState={callState}
          callDuration={callDuration}
          isMuted={isCallMuted}
          isCameraOff={isCameraOff}
          isSpeakerOn={isSpeakerOn}
          isScreenSharing={isScreenSharing}
          localStream={localStream}
          remoteStream={remoteStream}
          onHangup={hangup}
          onReject={rejectCall}
          onAnswer={answerCall}
          onToggleMute={toggleCallMute}
          onToggleCamera={toggleCamera}
          onSwitchCamera={switchCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleSpeaker={setIsSpeakerOn}
        />
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="modal-overlay" onClick={closeNewChatModal}>
          <div className="modal-card connect-aahat-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
                Connect by Aahat ID
              </h3>
              <button className="modal-close" onClick={closeNewChatModal}><X size={18} /></button>
            </div>
            <form onSubmit={handleNewChat} className="connect-aahat-form">
              <div className="connect-step-bar" aria-label={`Step ${newChatStep === 'id' ? '1' : '2'} of 2`}><i className="active"/><i className={newChatStep === 'pin' ? 'active' : ''}/></div>
              <div className="connect-step-copy">
                <span>Step {newChatStep === 'id' ? '1' : '2'} of 2</span>
                <strong>{newChatStep === 'id' ? 'Find the Aahat profile' : 'Private profile found'}</strong>
                <p>{newChatStep === 'id'
                  ? 'Enter the Aahat ID first. Public profiles open instantly; private profiles ask for their PIN next.'
                  : 'This profile accepts approved invitations. Enter the PIN shared by this person.'}</p>
              </div>
              {newChatStep === 'id' ? <div className="form-group">
                <label htmlFor="new-chat-id" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  10-digit Aahat ID
                </label>
                <input
                  id="new-chat-id"
                  type="text"
                  placeholder="Enter 10-digit Aahat ID..."
                  value={newChatId}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => { setNewChatId(e.target.value.replace(/\D/g, '')); setNewChatError(''); }}
                  autoFocus
                  required
                />
              </div>
              : <>
              <div className="connect-id-summary"><img src="/logo.png" alt=""/><span><small>Private profile</small><strong>Aahat</strong></span><button type="button" title="Change Aahat ID" onClick={() => { setNewChatStep('id'); setNewChatPin(''); setNewChatError(''); }}><ArrowLeft size={17}/></button></div>
              <div className="form-group">
                <label htmlFor="new-chat-pin" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  <Lock size={12}/> Connection PIN
                </label>
                <input id="new-chat-pin" type="password" inputMode="numeric" autoComplete="off"
                  placeholder="Enter 6-digit PIN..." value={newChatPin} maxLength={6}
                  onChange={e => { setNewChatPin(e.target.value.replace(/\D/g, '')); setNewChatError(''); }} autoFocus required />
              </div>
              </>}
              {newChatError && <p className="connect-aahat-error" role="alert">{newChatError}</p>}
              <div className="form-actions">
                <button type="button" className="admin-btn admin-btn-ghost" onClick={newChatStep === 'pin' ? () => { setNewChatStep('id'); setNewChatPin(''); setNewChatError(''); } : closeNewChatModal}>{newChatStep === 'pin' ? 'Back' : 'Cancel'}</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={isConnecting || newChatId.length !== 10 || (newChatStep === 'pin' && newChatPin.length !== 6)}>{isConnecting ? (newChatStep === 'id' ? 'Checking…' : 'Sending…') : newChatStep === 'id' ? 'Continue' : 'Send invitation'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Group Modal */}
      {showNewGroupModal && (
        <div className="modal-overlay" onClick={() => setShowNewGroupModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} style={{ color: 'var(--accent-light)' }} />
                Create Group
              </h3>
              <button className="modal-close" onClick={() => setShowNewGroupModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Group Name</label>
                <input
                  type="text"
                  placeholder="Enter group name..."
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>Description (optional)</label>
                <input
                  type="text"
                  placeholder="What is this group about?"
                  value={newGroupDesc}
                  onChange={e => setNewGroupDesc(e.target.value)}
                />
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowNewGroupModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {activeToast && (
        <div
          className="in-app-toast-container"
          onClick={() => {
            if (activeToast.notificationId) {
              void supabase.from('user_notifications')
                .update({ is_read: true })
                .eq('id', activeToast.notificationId)
                .eq('user_id', user.id);
            }
            if (activeToast.conversationId) handleSelectConversation(activeToast.conversationId);
            setActiveToast(null);
          }}
        >
          <div className="in-app-toast-avatar">
            <SafeAvatar src={activeToast.avatarUrl} name={activeToast.sender} size={40} />
          </div>
          <div className="in-app-toast-content">
            <div className="in-app-toast-sender">{activeToast.sender}</div>
            <div className="in-app-toast-text">{activeToast.text}</div>
          </div>
          <button
            className="in-app-toast-close"
            onClick={(e) => { e.stopPropagation(); setActiveToast(null); }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
