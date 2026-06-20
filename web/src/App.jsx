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
import SafeAvatar from './components/SafeAvatar';

// Icons for bottom navigation on mobile
import { MessageSquare, CircleDot, Settings, LogOut, Sparkles, X, Shield, Users, Plus } from 'lucide-react';

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
        email: session.user.email.toLowerCase(),
        name: session.user.user_metadata?.name || session.user.email.split('@')[0],
        avatarUrl: session.user.user_metadata?.avatarUrl || '',
        description: '',
        role: 'user',
        virtual_number: '',
        id: ''
      };

      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, role, virtual_number, avatarUrl, description')
          .eq('email', loggedUser.email)
          .single();
        if (data) {
          loggedUser.role = data.role || 'user';
          loggedUser.id = data.id || '';
          loggedUser.avatarUrl = data.avatarUrl || loggedUser.avatarUrl;
          loggedUser.description = data.description || '';
          if (data.virtual_number) {
            loggedUser.virtual_number = data.virtual_number;
          } else {
            // Trigger will generate it on insert. If missing on existing, fetch updated
            const { data: updated } = await supabase
              .from('users')
              .select('id, virtual_number, avatarUrl, description')
              .eq('email', loggedUser.email)
              .single();
            if (updated) {
              loggedUser.virtual_number = updated.virtual_number;
              loggedUser.id = updated.id || '';
              loggedUser.avatarUrl = updated.avatarUrl || loggedUser.avatarUrl;
              loggedUser.description = updated.description || '';
            }
          }
        } else {
          // If profile is missing in the users table, auto-create/sync it
          // Trigger automatically generates virtual_number
          await supabase.from('users').insert({
            email: loggedUser.email,
            name: loggedUser.name,
            passwordHash: '••••••••',
            isSessionActive: true,
            role: 'user'
          });
          const { data: updated } = await supabase
            .from('users')
            .select('id, virtual_number, avatarUrl, description')
            .eq('email', loggedUser.email)
            .single();
          if (updated) {
            loggedUser.virtual_number = updated.virtual_number;
            loggedUser.id = updated.id || '';
            loggedUser.avatarUrl = updated.avatarUrl || loggedUser.avatarUrl;
            loggedUser.description = updated.description || '';
          }
        }
      } catch (e) {
        // Fallback: Try to insert/upsert
        try {
          await supabase.from('users').upsert({
            email: loggedUser.email,
            name: loggedUser.name,
            passwordHash: '••••••••',
            isSessionActive: true,
            role: 'user'
          });
          const { data: updated } = await supabase
            .from('users')
            .select('id, virtual_number, avatarUrl, description')
            .eq('email', loggedUser.email)
            .single();
          if (updated) {
            loggedUser.virtual_number = updated.virtual_number;
            loggedUser.id = updated.id || '';
            loggedUser.avatarUrl = updated.avatarUrl || loggedUser.avatarUrl;
            loggedUser.description = updated.description || '';
          }
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

  // In-app notifications state
  const [activeToast, setActiveToast] = useState(null);

  const selectedContactIdRef = React.useRef(null);
  React.useEffect(() => {
    selectedContactIdRef.current = selectedContactId;
  }, [selectedContactId]);

  const contactsRef = React.useRef([]);
  React.useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  const handleMessageReceived = useCallback((msg) => {
    // Only show toast if we are not currently viewing the sender's chat conversation
    if (selectedContactIdRef.current !== msg.contactId) {
      const contact = contactsRef.current.find(c => c.id === msg.contactId);
      const senderName = contact?.name || msg.sender.split('@')[0];
      setActiveToast({
        id: Date.now(),
        sender: senderName,
        text: msg.text || "Sent a message",
        contactId: msg.contactId
      });
    }
  }, []);

  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  const handleRequestNotificationPermission = useCallback(async () => {
    try {
      const token = await requestNotificationPermission();
      if (token) {
        if (user?.email) {
          await supabase
            .from('users')
            .update({ fcmToken: token })
            .eq('email', user.email);
        }
        alert("Push notifications enabled successfully!");
      } else {
        alert("Notification permission denied or failed.");
      }
    } catch (e) {
      alert("Error enabling notifications: " + e.message);
    }
  }, [user]);

  // Data layer
  const {
    contacts, messages, isLoading,
    selectedContactId, typingStatus,
    activeContact, activeMessages,
    sendMessage, addReaction, deleteMessage,
    selectContact, uploadFile,
    setSelectedContactId,
    toggleArchive, togglePin, toggleMute, toggleFavorite,
    clearChat, deleteChat,
    updateProfile, postStory
  } = useSupabase(user, handleMessageReceived);

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
    if (window.history.state?.isChatOpen) {
      window.history.back();
    } else {
      setSelectedContactId(null);
      setIsMobileSidebarOpen(true);
    }
  }, [setSelectedContactId]);

  // Synchronize browser history Back action with chat closure
  useEffect(() => {
    const handlePopState = (event) => {
      if (!event.state?.isChatOpen) {
        setSelectedContactId(null);
        setIsMobileSidebarOpen(true);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setSelectedContactId]);

  // Push state to browser history when chat is opened on mobile
  useEffect(() => {
    if (selectedContactId && isMobile) {
      if (!window.history.state?.isChatOpen) {
        window.history.pushState({ isChatOpen: true }, '');
      }
    }
  }, [selectedContactId, isMobile]);

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
    const searchVal = newChatName.trim();

    if (user && searchVal === user.virtual_number) {
      alert("You cannot start a chat with yourself using your own Aahat ID. Use the 'You (Message Yourself)' chat!");
      return;
    }

    try {
      // Query users table for the virtual number with avatarUrl and description
      const { data: matchedUser, error } = await supabase
        .from('users')
        .select('email, name, virtual_number, avatarUrl, description')
        .eq('virtual_number', searchVal)
        .maybeSingle();

      if (error) throw error;

      if (!matchedUser) {
        alert(`No user found with Aahat ID: ${searchVal}`);
        return;
      }

      const contactId = matchedUser.email.split('@')[0];
      
      // Check if contact already exists in local list
      const contactExists = contacts.some(c => c.id === contactId);

      if (!contactExists) {
        const newContact = {
          id: `${user.email}:${contactId}`,
          name: matchedUser.name,
          avatarUrl: matchedUser.avatarUrl || '',
          description: matchedUser.description || '',
          isActive: true,
          lastActiveText: "Active now",
          isRecent: true,
          recentMessageText: "Say hello!",
          recentMessageTime: "Just now",
          recentMessageIsUnread: false
        };
        await supabase.from('contacts').insert([newContact]);
      }

      selectContact(contactId);
      setShowNewChatModal(false);
      setNewChatName('');
    } catch (err) {
      console.error(err);
      alert("Error adding contact. Please verify connection and try again.");
    }
  }, [newChatName, user, contacts, selectContact]);

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

        {activeTab === 'contacts' && (
          <div className="contacts-section" style={{ flex: 1, padding: '24px', overflowY: 'auto', background: 'var(--bg-gradient)', color: 'var(--text-primary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
                <Users size={22} style={{ color: 'var(--accent-light)' }} />
                My Contacts
              </h2>
              <button 
                onClick={handleNewChat} 
                className="admin-btn admin-btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                <Plus size={16} />
                Add Contact
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {contacts.filter(c => {
                if (c.id === 'me') return false;
                if (user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === user.email?.split('@')[0])) return false;
                return true;
              }).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--panel-border)', borderRadius: '12px', color: 'var(--text-secondary)' }}>
                  <Users size={32} style={{ opacity: 0.4, marginBottom: '12px' }} />
                  <p>No contacts added yet. Click "Add Contact" to add friends by their Aahat ID!</p>
                </div>
              ) : (
                contacts.filter(c => {
                  if (c.id === 'me') return false;
                  if (user && (c.name.toLowerCase() === user.name.toLowerCase() || c.id === user.email?.split('@')[0])) return false;
                  return true;
                }).map(contact => (
                  <div 
                    key={contact.id} 
                    onClick={() => handleSelectContact(contact.id)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '16px', 
                      background: 'rgba(30,41,59,0.3)', 
                      border: '1px solid var(--panel-border)', 
                      borderRadius: '12px', 
                      cursor: 'pointer',
                      transition: 'transform 0.2s, background 0.2s'
                    }}
                    className="contact-card-hover"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div className="avatar-wrapper" style={{ position: 'relative', width: '44px', height: '44px' }}>
                        {contact.avatarUrl ? (
                          <img src={contact.avatarUrl} alt={contact.name} style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-gradient)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '16px' }}>
                            {contact.name[0].toUpperCase()}
                          </div>
                        )}
                        <div className={`status-badge ${contact.isActive ? 'active' : 'offline'}`} style={{ position: 'absolute', bottom: '0', right: '0', width: '12px', height: '12px', borderRadius: '50%', border: '2px solid var(--panel-bg)', backgroundColor: contact.isActive ? 'var(--accent-light)' : '#9ca3af' }} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'white' }}>{contact.name}</h4>
                        <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-secondary)' }}>{contact.lastActiveText || 'Offline'}</p>
                      </div>
                    </div>
                    <button 
                      className="admin-btn admin-btn-ghost"
                      style={{ padding: '6px 12px', fontSize: '12px' }}
                    >
                      Chat
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'status' && (
          <StatusSection 
            contacts={contacts} 
            user={user} 
            onSelectContact={handleSelectContact} 
            onUploadFile={uploadFile}
            onPostStory={postStory}
          />
        )}
        {activeTab === 'settings' && (
          <SettingsPanel 
            user={user} 
            onLogout={handleLogout} 
            meContact={contacts.find(c => c.id === 'me')}
            onUploadFile={uploadFile}
            onUpdateProfile={updateProfile}
            onRequestNotificationPermission={handleRequestNotificationPermission}
          />
        )}
        {activeTab === 'admin' && (
          <AdminEmbedPanel 
            contacts={contacts} 
            messages={messages} 
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
                  Friend's Virtual Number (Aahat ID)
                </label>
                <input
                  id="new-chat-name"
                  type="text"
                  placeholder="Enter 10-digit Aahat ID..."
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

      {/* Glassmorphic Slide-in Notification Toast */}
      {activeToast && (
        <div 
          className="in-app-toast-container"
          onClick={() => {
            handleSelectContact(activeToast.contactId);
            setActiveToast(null);
          }}
        >
          <div className="in-app-toast-avatar">
            <SafeAvatar 
              src={contacts.find(c => c.id === activeToast.contactId)?.avatarUrl || ''} 
              name={activeToast.sender} 
              size={40} 
            />
          </div>
          <div className="in-app-toast-content">
            <div className="in-app-toast-sender">{activeToast.sender}</div>
            <div className="in-app-toast-text">{activeToast.text}</div>
          </div>
          <button 
            className="in-app-toast-close"
            onClick={(e) => {
              e.stopPropagation();
              setActiveToast(null);
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
