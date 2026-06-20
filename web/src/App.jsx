import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { useSupabase } from './hooks/useSupabase';
import AuthScreen from './components/AuthScreen';
import Sidebar from './components/Sidebar';
import ChatView from './components/ChatView';
import StatusSection from './components/StatusSection';
import SettingsPanel from './components/SettingsPanel';
import CallingOverlay from './components/CallingOverlay';
import AdminEmbedPanel from './components/AdminEmbedPanel';
import { requestNotificationPermission } from './firebase';

// Icons for bottom navigation on mobile
import { MessageSquare, CircleDot, Settings, LogOut, Sparkles, X, Shield } from 'lucide-react';

const SoundWaveLogo = () => (
  <div className="soundwave-logo">
    <span className="wave-bar bar-1" />
    <span className="wave-bar bar-2" />
    <span className="wave-bar bar-3" />
    <span className="wave-bar bar-4" />
    <span className="wave-bar bar-5" />
  </div>
);

/**
 * App — Root component for Aahat messaging application.
 * Orchestrates auth state, tabs navigation, calling states, and mobile responsive layouts.
 */
export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  
  // Tab control: chats, status, settings, admin
  const [activeTab, setActiveTab] = useState('chats');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');

  // Dynamic mobile state listener
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calling state
  const [callState, setCallState] = useState({
    active: false,
    contact: null,
    type: 'voice', // voice or video
    isRinging: false
  });

  // Auth persistence
  // Auth persistence
  useEffect(() => {
    const handleRegisterPush = async (email) => {
      try {
        const token = await requestNotificationPermission();
        if (token) {
          await supabase
            .from('users')
            .update({ fcmToken: token })
            .eq('email', email);
        }
      } catch (err) {
        console.warn("FCM token registration failed", err);
      }
    };

    const handleUserSession = async (session) => {
      if (!session) {
        setUser(null);
        setIsAuthLoading(false);
        return;
      }
      const loggedUser = {
        email: session.user.email,
        name: session.user.user_metadata?.name || session.user.email.split('@')[0],
        role: 'user'
      };

      try {
        const { data, error } = await supabase
          .from('users')
          .select('role')
          .eq('email', loggedUser.email)
          .single();
        if (data && data.role) {
          loggedUser.role = data.role;
        } else {
          // If profile is missing in the users table, auto-create/sync it
          await supabase.from('users').upsert({
            email: loggedUser.email,
            name: loggedUser.name,
            passwordHash: '••••••••',
            isSessionActive: true,
            role: 'user'
          });
        }
      } catch (e) {
        // Fallback: Try to upsert in case of RLS missing insert policy or network issues
        try {
          await supabase.from('users').upsert({
            email: loggedUser.email,
            name: loggedUser.name,
            passwordHash: '••••••••',
            isSessionActive: true,
            role: 'user'
          });
        } catch (err) {}
      }

      setUser(loggedUser);
      handleRegisterPush(loggedUser.email);
      setIsAuthLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        handleUserSession(session);
      } else {
        setIsAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        handleUserSession(session);
      } else {
        setUser(null);
        setIsAuthLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Data layer
  const {
    contacts, messages, isLoading,
    selectedContactId, typingStatus,
    activeContact, activeMessages,
    sendMessage, addReaction, deleteMessage,
    selectContact, resetData, uploadFile,
    setSelectedContactId,
    toggleArchive, togglePin, toggleMute, toggleFavorite,
    clearChat, deleteChat,
    updateProfile
  } = useSupabase(user);

  // Handlers
  const handleLogin = useCallback((userData) => setUser(userData), []);

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const handleSelectContact = useCallback((id) => {
    selectContact(id);
    setActiveTab('chats');
    setIsMobileSidebarOpen(false);
  }, [selectContact]);

  const handleMobileBack = useCallback(() => {
    setSelectedContactId(null);
    setIsMobileSidebarOpen(true);
  }, [setSelectedContactId]);

  // Calling Triggers
  const handleStartCall = useCallback((contact, type) => {
    setCallState({
      active: true,
      contact,
      type,
      isRinging: true
    });

    // Ring for 3 seconds then connect call automatically
    setTimeout(() => {
      setCallState(prev => prev.active ? { ...prev, isRinging: false } : prev);
    }, 3000);
  }, []);

  const handleHangup = useCallback(() => {
    setCallState({
      active: false,
      contact: null,
      type: 'voice',
      isRinging: false
    });
  }, []);

  const handleNewChat = useCallback(() => {
    setShowNewChatModal(true);
  }, []);

  const handleCreateNewChat = useCallback(async (e) => {
    e?.preventDefault();
    if (!newChatName.trim()) return;
    const name = newChatName.trim();
    const contactId = name.toLowerCase().replace(/\s+/g, '-');
    
    // Optimistic insert into Supabase
    try {
      const newContact = {
        id: contactId,
        name,
        avatarUrl: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
        isActive: true,
        lastActiveText: "Active now",
        isRecent: true,
        recentMessageText: "Say hello!",
        recentMessageTime: "Just now",
        recentMessageIsUnread: false
      };
      await supabase.from('contacts').insert([newContact]);
      selectContact(contactId);
      setShowNewChatModal(false);
      setNewChatName('');
    } catch (err) {
      alert("Error adding contact, check connection.");
    }
  }, [newChatName, selectContact]);

  const handleAdminTabClick = useCallback(() => {
    if (isAdminAuthenticated || user?.role === 'super_admin') {
      setActiveTab('admin');
      setIsMobileSidebarOpen(false);
    } else {
      setShowAdminPasswordModal(true);
      setAdminPasswordError('');
      setAdminPasswordInput('');
    }
  }, [isAdminAuthenticated, user]);

  const handleAdminPasswordSubmit = useCallback((e) => {
    e?.preventDefault();
    if (adminPasswordInput === 'admin123' || adminPasswordInput === 'aahat-admin') {
      setIsAdminAuthenticated(true);
      setActiveTab('admin');
      setShowAdminPasswordModal(false);
      setIsMobileSidebarOpen(false);
      setAdminPasswordError('');
    } else {
      setAdminPasswordError('Invalid admin password.');
    }
  }, [adminPasswordInput]);

  if (isAuthLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg-gradient)', color: 'var(--text-primary)' }}>
        <SoundWaveLogo />
        <span style={{ fontSize: '14px', fontWeight: '500', letterSpacing: '1px', opacity: 0.8 }}>Loading Aahat...</span>
      </div>
    );
  }

  // Show auth screen if not logged in
  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // Mobile state tracked dynamically via resize Hook

  const unreadTotal = contacts.filter(c => {
    if (c.id === 'me') return false;
    if (user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === user.email?.split('@')[0])) return false;
    return c.recentMessageIsUnread || (c.unreadCount > 0);
  }).length;

  return (
    <div className="app-container" id="app-container">
      {/* Slim vertical navigation dock on Desktop */}
      {!isMobile && (
        <div className="nav-dock">
          <div className="dock-top">
            <div className="dock-logo-container" title="Aahat">
              <SoundWaveLogo />
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
              className={`dock-btn ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
              title="Stories"
              id="dock-tab-stories"
            >
              <CircleDot size={20} />
            </button>
          </div>
          <div className="dock-bottom">
            {user?.role === 'super_admin' && (
              <button 
                className={`dock-btn ${activeTab === 'admin' ? 'active' : ''}`}
                onClick={handleAdminTabClick}
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

      {/* Main View Area Tabs */}
      <div className="main-content-window">
        {activeTab === 'chats' && (
          <>
            <Sidebar
              user={user}
              contacts={contacts}
              selectedContactId={selectedContactId}
              onSelectContact={handleSelectContact}
              onLogout={handleLogout}
              onResetDb={resetData}
              isMobileOpen={isMobileSidebarOpen}
              onCloseMobile={() => setIsMobileSidebarOpen(false)}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              toggleArchive={toggleArchive}
              togglePin={togglePin}
              toggleMute={toggleMute}
              toggleFavorite={toggleFavorite}
              onNewChat={handleNewChat}
            />
            <ChatView
              activeContact={activeContact}
              activeMessages={activeMessages}
              typingStatus={typingStatus}
              onSend={sendMessage}
              onAddReaction={addReaction}
              onDeleteMessage={deleteMessage}
              onUploadFile={uploadFile}
              onBack={selectedContactId ? handleMobileBack : undefined}
              onStartCall={handleStartCall}
              contacts={contacts}
              onClearChat={clearChat}
              onDeleteChat={deleteChat}
            />
          </>
        )}

        {activeTab === 'status' && (
          <StatusSection 
            contacts={contacts} 
            user={user} 
            onSelectContact={handleSelectContact} 
            onUploadFile={uploadFile}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel 
            user={user} 
            onLogout={handleLogout} 
            meContact={contacts.find(c => c.id === 'me')}
            onUploadFile={uploadFile}
            onUpdateProfile={updateProfile}
          />
        )}
        {activeTab === 'admin' && (
          <AdminEmbedPanel 
            contacts={contacts} 
            messages={messages} 
            onResetDb={resetData} 
          />
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <div className="mobile-bottom-nav">
          <button 
            className={`mobile-nav-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => { setActiveTab('chats'); setIsMobileSidebarOpen(true); }}
          >
            <MessageSquare size={20} />
            <span>Chats</span>
          </button>
          <button 
            className={`mobile-nav-btn ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => { setActiveTab('status'); setIsMobileSidebarOpen(false); }}
          >
            <CircleDot size={20} />
            <span>Stories</span>
          </button>
          {user?.role === 'super_admin' && (
            <button 
              className={`mobile-nav-btn ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={handleAdminTabClick}
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

      {/* Call Fullscreen Overlays */}
      {callState.active && (
        <CallingOverlay 
          callState={callState} 
          onHangup={handleHangup}
        />
      )}

      {/* New Chat Premium Modal */}
      {showNewChatModal && (
        <div className="modal-overlay" onClick={() => setShowNewChatModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
                Start New Conversation
              </h3>
              <button className="modal-close" onClick={() => setShowNewChatModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateNewChat} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="new-chat-name" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Friend's Full Name
                </label>
                <input
                  id="new-chat-name"
                  type="text"
                  placeholder="Enter display name..."
                  value={newChatName}
                  onChange={e => setNewChatName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowNewChatModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Start Chat
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Admin Verification Modal */}
      {showAdminPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowAdminPasswordModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} style={{ color: 'var(--accent-light)' }} />
                Admin Verification Required
              </h3>
              <button className="modal-close" onClick={() => setShowAdminPasswordModal(false)}><X size={18} /></button>
            </div>
            {adminPasswordError && (
              <div className="error-banner" style={{ color: '#ef4444', fontSize: '12px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                {adminPasswordError}
              </div>
            )}
            <form onSubmit={handleAdminPasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="admin-password-input" style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                  Enter Admin Password
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  placeholder="Admin password..."
                  value={adminPasswordInput}
                  onChange={e => setAdminPasswordInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              <div className="form-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowAdminPasswordModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="admin-btn admin-btn-primary">
                  Access Dashboard
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
