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
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import StatusSection from './components/StatusSection';
import SettingsPanel from './components/SettingsPanelProduction';
import CallingOverlay from './components/CallingOverlay';
import AdminEmbedPanel from './components/AdminEmbedProduction';
import SafeAvatar from './components/SafeAvatar';
import ContactsSection from './components/ContactsSection';
import { requestNotificationPermission } from './firebase';

import { MessageSquare, CircleDot, Settings, LogOut, Sparkles, X, Shield, Users } from 'lucide-react';

const BrandLogo = () => (
  <img src="/logo.png" alt="Aahat" className="brand-logo-image" />
);

/**
 * App â€” Root component for Aahat messaging application (V2).
 * Uses normalized database hooks for auth, conversations, messages,
 * presence, calling, and statuses.
 */
export default function App() {
  // --- Auth ---
  const {
    user, profile, isLoading: isAuthLoading,
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
    rotatePin
  } = useAahatContacts(user, refetchConversations);

  // --- Messages (for the active conversation) ---
  const {
    messages: activeMessages,
    sendMessage, retryMessage, editMessage, deleteForMe, deleteForEveryone,
    addReaction, removeReaction,
    markAsRead, uploadFile, loadMore, hasMore, isLoadingMore
  } = useMessages(user, selectedConversationId);

  // --- Presence ---
  const { isUserOnline, setTyping, getTypingUsers } = usePresence(user);

  // --- Calling ---
  const {
    callState, callDuration, isMuted: isCallMuted, isCameraOff, isSpeakerOn, isScreenSharing,
    localStream, remoteStream,
    startCall, answerCall, hangup, rejectCall,
    toggleMute: toggleCallMute, toggleCamera, toggleScreenShare, setIsSpeakerOn
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
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [activeToast, setActiveToast] = useState(null);

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

      if (messageId) {
        const { error } = await supabase.rpc('mark_message_delivered', { p_message_id: messageId });
        if (error) console.warn('Could not acknowledge message delivery:', error.message);
      }

      if (conversationId === selectedConvRef.current && document.visibilityState === 'visible') {
        await markNotificationRead(notification.id);
        return;
      }

      const conv = conversations.find(item => item.id === conversationId);
      setActiveToast({
        id: notification.id,
        notificationId: notification.id,
        sender: notification.title || conv?.name || 'New message',
        text: notification.body || 'Sent a message',
        conversationId,
        avatarUrl: conv?.avatarUrl || ''
      });

      if (document.visibilityState !== 'visible' && 'Notification' in window && Notification.permission === 'granted') {
        const options = {
          body: notification.body || 'Sent a message',
          icon: conv?.avatarUrl || '/logo.png',
          badge: '/logo.png',
          tag: `message-${conversationId || notification.id}`,
          data: { conversationId }
        };
        try {
          if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations[0]) await registrations[0].showNotification(notification.title || 'Aahat', options);
            else new Notification(notification.title || 'Aahat', options);
          } else {
            new Notification(notification.title || 'Aahat', options);
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
  }, [user, conversations]);
  // FCM registration is tied to the current account through a security-definer
  // RPC so a shared browser token cannot remain attached to a previous user.
  const registerPushToken = useCallback(async (showFeedback = false) => {
    try {
      const token = await requestNotificationPermission();
      if (token && user) {
        const { error } = await supabase.rpc('register_push_token', {
          p_token: token,
          p_provider: 'fcm'
        });
        if (error) throw error;
        if (showFeedback) alert("Push notifications enabled successfully!");
      } else if (showFeedback) {
        alert("Notification permission denied or failed.");
      }
    } catch (e) {
      if (showFeedback) alert("Error enabling notifications: " + e.message);
      else console.warn('Could not refresh push token:', e.message);
    }
  }, [user]);

  const handleRequestNotificationPermission = useCallback(
    () => registerPushToken(true),
    [registerPushToken]
  );

  useEffect(() => {
    if (user && 'Notification' in window && Notification.permission === 'granted') {
      void registerPushToken(false);
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

    try {
      const result = await requestContact(newChatId, newChatPin);
      setShowNewChatModal(false);
      setNewChatId('');
      setNewChatPin('');
      alert(`Invitation sent to ${result?.display_name || 'this Aahat user'}. You can chat after they accept it.`);
    } catch (err) {
      alert(err.message || 'Could not send invitation');
    }
  }, [newChatId, newChatPin, requestContact]);

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-gradient)', color: 'var(--text-primary)' }}>
        <BrandLogo />
        <span style={{ fontSize: '14px', fontWeight: '500', letterSpacing: '1px', opacity: 0.8 }}>Loading Aahat...</span>
      </div>
    );
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
              onNewChat={() => setShowNewChatModal(true)}
              onNewGroup={() => setShowNewGroupModal(true)}
              isUserOnline={isUserOnline}
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
              onBack={selectedConversationId ? handleMobileBack : undefined}
              onStartCall={handleStartCall}
              conversations={conversations}
              onClearChat={() => clearChat(selectedConversationId)}
              onDeleteChat={() => deleteChat(selectedConversationId)}
              onToggleArchive={toggleArchive}
              onToggleMute={toggleMute}
              onSetTyping={setTyping}
              currentUserId={user?.id}
              isUserOnline={isUserOnline}
              onForwardMessage={async (text, attachmentUrl, targetConvId) => {
                if (!user || !targetConvId) return;
                const messageType = attachmentUrl
                  ? (attachmentUrl.match(/\.(mp4|webm|mov)/i) ? 'video'
                    : attachmentUrl.match(/\.(pdf|doc|docx|zip)/i) ? 'file'
                    : 'image')
                  : 'text';
                await supabase.from('messages').insert({
                  conversation_id: targetConvId,
                  sender_id: user.id,
                  content: text || '',
                  attachment_url: attachmentUrl || null,
                  message_type: messageType
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
            credentials={aahatCredentials}
            conversations={conversations}
            incomingRequests={incomingRequests}
            outgoingRequests={outgoingRequests}
            isLoading={areContactsLoading}
            isUserOnline={isUserOnline}
            onAddContact={() => setShowNewChatModal(true)}
            onSelectConversation={handleSelectConversation}
            onRespond={respondToRequest}
            onRotatePin={rotatePin}
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
          onAnswer={() => answerCall(callState.callId, callState.contact?.id, callState.type)}
          onToggleMute={toggleCallMute}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onToggleSpeaker={() => setIsSpeakerOn(!isSpeakerOn)}
        />
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
                Send Contact Invitation
              </h3>
              <button className="modal-close" onClick={() => setShowNewChatModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleNewChat} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="new-chat-id" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Friend's 10-digit Aahat ID
                </label>
                <input
                  id="new-chat-id"
                  type="text"
                  placeholder="Enter 10-digit Aahat ID..."
                  value={newChatId}
                  inputMode="numeric"
                  maxLength={10}
                  onChange={e => setNewChatId(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-chat-pin" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  6-digit connection PIN
                </label>
                <input id="new-chat-pin" type="password" inputMode="numeric" autoComplete="off"
                  placeholder="Enter 6-digit PIN..." value={newChatPin} maxLength={6}
                  onChange={e => setNewChatPin(e.target.value.replace(/\D/g, ''))} required />
                <small style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  They will receive an invitation. Messaging unlocks only after they accept.
                </small>
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowNewChatModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary" disabled={newChatId.length !== 10 || newChatPin.length !== 6}>Send Invitation</button>
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
