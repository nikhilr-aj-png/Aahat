import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ChevronRight,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  Users
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './supabase';

export default function App() {
  const [sessionUser, setSessionUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isDataLoading, setIsDataLoading] = useState(false);

  const messagesEndRef = useRef(null);

  const verifyAdmin = useCallback(async (user) => {
    if (!user) {
      setSessionUser(null);
      setAdminProfile(null);
      setIsAuthLoading(false);
      return false;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, display_name, role')
      .eq('id', user.id)
      .single();

    if (error || data?.role !== 'super_admin') {
      await supabase.auth.signOut();
      setSessionUser(null);
      setAdminProfile(null);
      setAuthError('This account does not have super admin access.');
      setIsAuthLoading(false);
      return false;
    }

    setSessionUser(user);
    setAdminProfile(data);
    setAuthError('');
    setIsAuthLoading(false);
    return true;
  }, []);

  const fetchData = useCallback(async () => {
    if (!sessionUser) return;
    setIsDataLoading(true);
    try {
      const [profilesRes, conversationsRes, membersRes, messagesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, email, display_name, avatar_url, is_online, last_seen, role, virtual_number, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('conversations')
          .select('id, type, name, description, created_by, created_at, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('conversation_members')
          .select('id, conversation_id, user_id, role, joined_at'),
        supabase
          .from('messages')
          .select('id, conversation_id, sender_id, content, message_type, attachment_url, created_at, is_deleted_for_everyone, sender:profiles!messages_sender_id_fkey(display_name)')
          .eq('is_deleted_for_everyone', false)
          .order('created_at', { ascending: false })
          .limit(500)
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (conversationsRes.error) throw conversationsRes.error;
      if (membersRes.error) throw membersRes.error;
      if (messagesRes.error) throw messagesRes.error;

      setProfiles(profilesRes.data || []);
      setConversations(conversationsRes.data || []);
      setMembers(membersRes.data || []);
      setMessages(messagesRes.data || []);
    } catch (error) {
      console.error('Admin data fetch error:', error);
      setAuthError(error.message || 'Unable to load admin data. Check RLS admin policies.');
    } finally {
      setIsDataLoading(false);
    }
  }, [sessionUser]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => verifyAdmin(data.session?.user || null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      verifyAdmin(session?.user || null);
    });
    return () => subscription.unsubscribe();
  }, [verifyAdmin]);

  useEffect(() => {
    if (sessionUser) fetchData();
  }, [sessionUser, fetchData]);

  useEffect(() => {
    if (!sessionUser) return;
    const channel = supabase
      .channel('admin-v2-dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, fetchData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionUser, fetchData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConversationId, messages]);

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setAuthError(error.message);
      setIsAuthLoading(false);
      return;
    }
    await verifyAdmin(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
    setAdminProfile(null);
    setProfiles([]);
    setConversations([]);
    setMembers([]);
    setMessages([]);
  };

  const handleDeleteMessage = (messageId) => {
    setConfirmDialog({
      title: 'Delete Message',
      message: 'Delete this message for everyone? This is a moderation action.',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('messages')
            .update({ is_deleted_for_everyone: true, content: 'This message was deleted by an admin' })
            .eq('id', messageId);
          if (error) throw error;
          setMessages(prev => prev.filter(message => message.id !== messageId));
        } catch (error) {
          setAuthError(error.message || 'Unable to delete message.');
        }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  const profileMap = useMemo(() => {
    const map = new Map();
    profiles.forEach(profile => map.set(profile.id, profile));
    return map;
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    const query = searchFilter.toLowerCase();
    return profiles.filter(profile =>
      (profile.display_name || '').toLowerCase().includes(query) ||
      (profile.email || '').toLowerCase().includes(query) ||
      (profile.virtual_number || '').toLowerCase().includes(query)
    );
  }, [profiles, searchFilter]);

  const conversationRows = useMemo(() => {
    const query = searchFilter.toLowerCase();
    return conversations
      .map(conversation => {
        const conversationMembers = members.filter(member => member.conversation_id === conversation.id);
        const lastMessage = messages.find(message => message.conversation_id === conversation.id);
        const fallbackName = conversationMembers
          .map(member => profileMap.get(member.user_id)?.display_name || 'Unknown')
          .join(', ');
        const name = conversation.name || fallbackName || conversation.type;
        return {
          ...conversation,
          name,
          memberCount: conversationMembers.length,
          messageCount: messages.filter(message => message.conversation_id === conversation.id).length,
          lastMessage
        };
      })
      .filter(conversation => conversation.name.toLowerCase().includes(query) || conversation.type.includes(query));
  }, [conversations, members, messages, profileMap, searchFilter]);

  const auditMessages = useMemo(
    () => messages
      .filter(message => message.conversation_id === selectedConversationId)
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages, selectedConversationId]
  );

  const onlineUsers = profiles.filter(profile => profile.is_online).length;
  const directConversations = conversations.filter(conversation => conversation.type === 'direct').length;
  const groupConversations = conversations.filter(conversation => conversation.type === 'group').length;

  if (!isSupabaseConfigured) {
    return (
      <div className="admin-auth-wrapper">
        <div className="admin-auth-card">
          <div className="admin-auth-header">
            <img src="/logo.png" alt="Aahat" className="admin-auth-logo" />
            <h2>Supabase is not configured</h2>
            <p>Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to admin/.env before opening the admin panel.</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAuthLoading && !sessionUser) {
    return (
      <div className="admin-auth-wrapper">
        <div className="admin-auth-card">
          <div className="admin-auth-header">
            <img src="/logo.png" alt="Aahat" className="admin-auth-logo" />
            <h2>Admin Panel</h2>
            <p>Checking admin session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <div className="admin-auth-wrapper">
        <div className="admin-auth-card">
          <div className="admin-auth-header">
            <img src="/logo.png" alt="Aahat" className="admin-auth-logo" />
            <h2>Admin Panel</h2>
            <p>Sign in with a Supabase account whose profile role is super_admin.</p>
          </div>
          {authError && <div className="admin-auth-error"><AlertTriangle size={14} /> {authError}</div>}
          <form onSubmit={handleAdminLogin} className="admin-auth-form">
            <div className="admin-input-group">
              <UserCheck size={16} />
              <input type="email" placeholder="Admin email" value={email} onChange={event => setEmail(event.target.value)} autoFocus required />
            </div>
            <div className="admin-input-group">
              <Shield size={16} />
              <input type="password" placeholder="Password" value={password} onChange={event => setPassword(event.target.value)} required />
            </div>
            <button type="submit" className="admin-btn-primary" disabled={isAuthLoading}>Access Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <button className="mobile-menu-toggle" onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}>
        <Menu size={20} />
      </button>

      <div className={`admin-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="logo-section">
          <img src="/logo.png" alt="Aahat" className="admin-logo" />
          <h2>Aahat Admin</h2>
        </div>
        <ul className="nav-menu">
          {[
            { key: 'overview', icon: <Activity size={16} />, label: 'Overview' },
            { key: 'users', icon: <Users size={16} />, label: 'Profiles' },
            { key: 'conversations', icon: <MessageSquare size={16} />, label: 'Conversations' },
            { key: 'audit', icon: <Shield size={16} />, label: 'Audit Logs' }
          ].map(tab => (
            <li key={tab.key} className={`nav-item ${activeTab === tab.key ? 'active' : ''}`} onClick={() => { setActiveTab(tab.key); setIsMobileSidebarOpen(false); }}>
              {tab.icon}
              <span>{tab.label}</span>
              <ChevronRight size={14} className="nav-arrow" />
            </li>
          ))}
        </ul>
        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={handleLogout}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="header-row">
          <div>
            <h1>
              {activeTab === 'overview' && 'System Analytics'}
              {activeTab === 'users' && 'User Profiles'}
              {activeTab === 'conversations' && 'Conversation Monitor'}
              {activeTab === 'audit' && 'Chat Audit Logs'}
            </h1>
            <p className="header-subtitle">
              Signed in as {adminProfile?.display_name || adminProfile?.email || 'super admin'}
            </p>
          </div>
          <div className="header-search">
            <Search size={14} />
            <input type="text" placeholder="Search..." value={searchFilter} onChange={event => setSearchFilter(event.target.value)} />
          </div>
        </div>

        {authError && <div className="admin-auth-error"><AlertTriangle size={14} /> {authError}</div>}

        {activeTab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-icon purple"><Users size={22} /></div><div className="stat-info"><h3>{profiles.length}</h3><p>Registered Profiles</p></div></div>
              <div className="stat-card"><div className="stat-icon green"><UserCheck size={22} /></div><div className="stat-info"><h3>{onlineUsers}</h3><p>Online Now</p></div></div>
              <div className="stat-card"><div className="stat-icon indigo"><MessageSquare size={22} /></div><div className="stat-info"><h3>{directConversations + groupConversations}</h3><p>Conversations</p></div></div>
              <div className="stat-card"><div className="stat-icon rose"><Activity size={22} /></div><div className="stat-info"><h3>{messages.length}</h3><p>Recent Messages</p></div></div>
            </div>
            <div className="table-container">
              <div className="table-header">
                <h2>Recent Conversations</h2>
                <button className="admin-btn admin-btn-primary" onClick={fetchData}><RefreshCw size={15} /> Refresh</button>
              </div>
              <table className="admin-table">
                <thead><tr><th>Name</th><th>Type</th><th>Members</th><th>Messages</th><th>Last Activity</th></tr></thead>
                <tbody>
                  {conversationRows.slice(0, 10).map(conversation => (
                    <tr key={conversation.id}>
                      <td className="text-bold">{conversation.name}</td>
                      <td><code className="id-tag">{conversation.type}</code></td>
                      <td>{conversation.memberCount}</td>
                      <td>{conversation.messageCount}</td>
                      <td className="text-muted">{conversation.updated_at ? new Date(conversation.updated_at).toLocaleString() : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'users' && (
          <div className="table-container">
            <div className="table-header"><h2>Profiles ({filteredProfiles.length})</h2></div>
            <table className="admin-table">
              <thead><tr><th>User</th><th>Email</th><th>Aahat ID</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {filteredProfiles.map(profile => (
                  <tr key={profile.id}>
                    <td><div className="table-user"><img src={profile.avatar_url || '/logo.png'} alt="" className="avatar-img" /><span className="table-user-name">{profile.display_name || 'Unnamed'}</span></div></td>
                    <td>{profile.email || '-'}</td>
                    <td><code className="id-tag">{profile.virtual_number || '-'}</code></td>
                    <td>{profile.role || 'user'}</td>
                    <td><span className={`badge ${profile.is_online ? 'success' : 'muted'}`}>{profile.is_online ? 'Online' : 'Offline'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'conversations' && (
          <div className="table-container">
            <div className="table-header"><h2>Conversations ({conversationRows.length})</h2></div>
            <table className="admin-table">
              <thead><tr><th>Name</th><th>ID</th><th>Type</th><th>Members</th><th>Messages</th></tr></thead>
              <tbody>
                {conversationRows.map(conversation => (
                  <tr key={conversation.id} onClick={() => { setSelectedConversationId(conversation.id); setActiveTab('audit'); }} style={{ cursor: 'pointer' }}>
                    <td className="text-bold">{conversation.name}</td>
                    <td><code className="id-tag">{conversation.id.slice(0, 8)}</code></td>
                    <td>{conversation.type}</td>
                    <td>{conversation.memberCount}</td>
                    <td>{conversation.messageCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="audit-grid">
            <div className="audit-contact-list">
              <div className="audit-list-header"><h3>Conversations</h3></div>
              {conversationRows.map(conversation => (
                <div key={conversation.id} className={`audit-contact-item ${selectedConversationId === conversation.id ? 'selected' : ''}`} onClick={() => setSelectedConversationId(conversation.id)}>
                  <div className="audit-contact-info">
                    <h4>{conversation.name}</h4>
                    <span>{conversation.messageCount} messages</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="audit-chat-window">
              {selectedConversationId ? (
                <div className="audit-messages-container">
                  {auditMessages.length === 0 && <div className="audit-empty">No visible messages for this conversation</div>}
                  {auditMessages.map(message => (
                    <div key={message.id} className={`audit-message-row ${message.sender_id === sessionUser.id ? 'me' : 'other'}`}>
                      <div className="audit-bubble">
                        <p>{message.content || `[${message.message_type}]`}</p>
                        <button className="audit-delete-btn" title="Delete" onClick={() => handleDeleteMessage(message.id)}><Trash2 size={12} /></button>
                      </div>
                      <span className="audit-meta">{message.sender?.display_name || profileMap.get(message.sender_id)?.display_name || 'Unknown'} - {new Date(message.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="audit-placeholder"><MessageSquare size={28} /><p>Select a conversation to view message history</p></div>
              )}
            </div>
          </div>
        )}

        {isDataLoading && <div className="audit-placeholder"><RefreshCw size={20} /> <p>Refreshing data...</p></div>}
      </div>

      {confirmDialog && (
        <div className="modal-overlay" onClick={confirmDialog.onCancel}>
          <div className="modal-card confirm-dialog" onClick={event => event.stopPropagation()}>
            <div className="confirm-icon"><AlertTriangle size={24} /></div>
            <h3>{confirmDialog.title}</h3>
            <p>{confirmDialog.message}</p>
            <div className="form-actions">
              <button className="admin-btn admin-btn-ghost" onClick={confirmDialog.onCancel}>Cancel</button>
              <button className="admin-btn admin-btn-danger" onClick={confirmDialog.onConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


