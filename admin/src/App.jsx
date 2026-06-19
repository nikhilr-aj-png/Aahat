import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, UserCheck, MessageSquare, Plus, Activity, 
  Trash2, Radio, Shield, Search, X, AlertTriangle,
  LogOut, ChevronRight, Menu
} from 'lucide-react';
import { supabase } from './supabase';

/**
 * Admin Panel — Dashboard for managing contacts, users, and audit logs.
 * Includes simple password-protected gate, responsive layout, and confirmation dialogs.
 */
export default function App() {
  // Admin auth gate
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // DB States
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);

  // UI states
  const [selectedAuditContactId, setSelectedAuditContactId] = useState(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [searchFilter, setSearchFilter] = useState('');

  // Form fields
  const [newContactId, setNewContactId] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactAvatar, setNewContactAvatar] = useState('');

  const messagesEndRef = useRef(null);

  // Admin auth check
  const handleAdminLogin = (e) => {
    e.preventDefault();
    // Simple admin password check
    if (adminPassword === 'admin123' || adminPassword === 'aahat-admin') {
      setIsAuthenticated(true);
      setAuthError('');
    } else {
      setAuthError('Invalid admin password. Try: admin123');
    }
  };

  // Fetch data
  const fetchData = async () => {
    try {
      const { data: dbContacts } = await supabase.from('contacts').select('*');
      const { data: dbMessages } = await supabase.from('messages').select('*');
      const { data: dbUsers } = await supabase.from('users').select('*');
      if (dbContacts) setContacts(dbContacts);
      if (dbMessages) setMessages(dbMessages);
      if (dbUsers) setUsers(dbUsers);
    } catch (e) {
      console.error("Data fetch error:", e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) fetchData();
  }, [isAuthenticated]);

  // Real-time sync
  useEffect(() => {
    if (!isAuthenticated) return;
    const channel = supabase
      .channel('admin-dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAuthenticated]);

  // Scroll audit messages to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedAuditContactId, messages]);

  // Handlers
  const handleToggleContactActive = async (contactId, currentStatus) => {
    const updatedStatus = !currentStatus;
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, isActive: updatedStatus, lastActiveText: updatedStatus ? "Active now" : "Offline" } : c));
    try {
      await supabase.from('contacts').update({ isActive: updatedStatus, lastActiveText: updatedStatus ? "Active now" : "Offline" }).eq('id', contactId);
    } catch (e) { console.error(e); }
  };

  const handleAddContactSubmit = async (e) => {
    e.preventDefault();
    if (!newContactId || !newContactName) return;
    const newContact = {
      id: newContactId.toLowerCase().replace(/\s+/g, '-'),
      name: newContactName,
      avatarUrl: newContactAvatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150",
      isActive: true, lastActiveText: "Active now",
      isRecent: false, recentMessageText: "", recentMessageTime: "", recentMessageIsUnread: false
    };
    try {
      await supabase.from('contacts').insert([newContact]);
      fetchData();
      setShowAddContactModal(false);
      setNewContactId(''); setNewContactName(''); setNewContactAvatar('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteContact = async (contactId) => {
    setConfirmDialog({
      title: 'Delete Contact',
      message: `Are you sure you want to delete the contact "${contacts.find(c => c.id === contactId)?.name}"? This will also delete all their messages.`,
      onConfirm: async () => {
        try {
          await supabase.from('messages').delete().eq('contactId', contactId);
          await supabase.from('contacts').delete().eq('id', contactId);
          fetchData();
        } catch (e) { console.error(e); }
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  const handleDeleteMessage = async (msgId) => {
    setConfirmDialog({
      title: 'Delete Message',
      message: 'Are you sure you want to permanently delete this message?',
      onConfirm: async () => {
        try { await supabase.from('messages').delete().eq('id', msgId); }
        catch (e) { console.error(e); }
        setMessages(prev => prev.filter(m => m.id !== msgId));
        setConfirmDialog(null);
      },
      onCancel: () => setConfirmDialog(null)
    });
  };

  // Computations
  const activeFriendsCount = contacts.filter(c => c.isActive).length;
  const auditMessages = messages
    .filter(m => m.contactId === selectedAuditContactId)
    .sort((a, b) => a.timestamp - b.timestamp);

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
    c.id.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const getMessageCount = (contactId) => messages.filter(m => m.contactId === contactId).length;

  // --- Auth Gate ---
  if (!isAuthenticated) {
    return (
      <div className="admin-auth-wrapper">
        <div className="admin-auth-card">
          <div className="admin-auth-header">
            <img src="/logo.png" alt="Aahat" className="admin-auth-logo" />
            <h2>Admin Panel</h2>
            <p>Enter the admin password to continue</p>
          </div>
          {authError && <div className="admin-auth-error"><AlertTriangle size={14} /> {authError}</div>}
          <form onSubmit={handleAdminLogin} className="admin-auth-form">
            <div className="admin-input-group">
              <Shield size={16} />
              <input
                type="password"
                placeholder="Admin password"
                value={adminPassword}
                onChange={e => setAdminPassword(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="admin-btn-primary">Access Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  // --- Dashboard ---
  return (
    <div className="admin-layout">
      {/* Mobile Menu Toggle */}
      <button
        className="mobile-menu-toggle"
        onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
      >
        <Menu size={20} />
      </button>

      {/* Sidebar */}
      <div className={`admin-sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="logo-section">
          <img src="/logo.png" alt="Aahat" className="admin-logo" />
          <h2>Aahat Admin</h2>
        </div>
        <ul className="nav-menu">
          {[
            { key: 'overview', icon: <Activity size={16} />, label: 'Overview' },
            { key: 'contacts', icon: <Users size={16} />, label: 'Contacts' },
            { key: 'users', icon: <UserCheck size={16} />, label: 'Users' },
            { key: 'audit', icon: <MessageSquare size={16} />, label: 'Audit Logs' },
          ].map(tab => (
            <li
              key={tab.key}
              className={`nav-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => { setActiveTab(tab.key); setIsMobileSidebarOpen(false); }}
            >
              {tab.icon}
              <span>{tab.label}</span>
              <ChevronRight size={14} className="nav-arrow" />
            </li>
          ))}
        </ul>
        <div className="admin-sidebar-footer">
          <button className="admin-logout-btn" onClick={() => setIsAuthenticated(false)}>
            <LogOut size={14} /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="header-row">
          <div>
            <h1>
              {activeTab === 'overview' && 'System Analytics'}
              {activeTab === 'contacts' && 'Contacts Manager'}
              {activeTab === 'users' && 'User Database'}
              {activeTab === 'audit' && 'Chat Audit Logs'}
            </h1>
            <p className="header-subtitle">
              Connection: <span className="status-live">● Connected</span>
            </p>
          </div>
          {(activeTab === 'contacts' || activeTab === 'users') && (
            <div className="header-search">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* === Overview === */}
        {activeTab === 'overview' && (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon purple"><Users size={22} /></div>
                <div className="stat-info">
                  <h3>{users.length}</h3>
                  <p>Registered Users</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon indigo"><Activity size={22} /></div>
                <div className="stat-info">
                  <h3>{contacts.length}</h3>
                  <p>Total Contacts</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon green"><UserCheck size={22} /></div>
                <div className="stat-info">
                  <h3>{activeFriendsCount}</h3>
                  <p>Active Online</p>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon rose"><MessageSquare size={22} /></div>
                <div className="stat-info">
                  <h3>{messages.length}</h3>
                  <p>Total Messages</p>
                </div>
              </div>
            </div>

            <div className="table-container">
              <div className="table-header">
                <h2>Active Connections</h2>
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Contact</th>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Messages</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id}>
                      <td>
                        <div className="table-user">
                          <img src={c.avatarUrl} alt="" className="avatar-img" />
                          <span className="table-user-name">{c.name}</span>
                        </div>
                      </td>
                      <td><code className="id-tag">{c.id}</code></td>
                      <td>
                        <span className={`badge ${c.isActive ? 'success' : 'muted'}`}>
                          {c.isActive ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td>{getMessageCount(c.id)}</td>
                      <td className="text-muted">{c.recentMessageTime || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* === Contacts === */}
        {activeTab === 'contacts' && (
          <div className="table-container">
            <div className="table-header">
              <h2>Contacts ({filteredContacts.length})</h2>
              <button className="admin-btn admin-btn-primary" onClick={() => setShowAddContactModal(true)}>
                <Plus size={15} /> Add Contact
              </button>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Messages</th>
                  <th>Last Sync</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredContacts.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div className="table-user">
                        <img src={c.avatarUrl} alt="" className="avatar-img" />
                        <span className="table-user-name">{c.name}</span>
                      </div>
                    </td>
                    <td><code className="id-tag">{c.id}</code></td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={c.isActive} onChange={() => handleToggleContactActive(c.id, c.isActive)} />
                        <span className="slider" />
                      </label>
                    </td>
                    <td>{getMessageCount(c.id)}</td>
                    <td className="text-muted">{c.recentMessageTime || '—'}</td>
                    <td>
                      <button className="admin-btn admin-btn-danger-ghost" onClick={() => handleDeleteContact(c.id)} title="Delete Contact">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* === Users === */}
        {activeTab === 'users' && (
          <div className="table-container">
            <div className="table-header">
              <h2>Registered Users ({users.length})</h2>
            </div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Password</th>
                  <th>Session</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.email}>
                    <td className="text-bold">{u.name}</td>
                    <td>{u.email}</td>
                    <td className="text-muted">••••••••</td>
                    <td>
                      <span className={`badge ${u.isSessionActive ? 'success' : 'muted'}`}>
                        {u.isSessionActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={4} className="empty-table-cell">No registered users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* === Audit Logs === */}
        {activeTab === 'audit' && (
          <div className="audit-grid">
            <div className="audit-contact-list">
              <div className="audit-list-header">
                <h3>Contacts</h3>
              </div>
              {contacts.map(c => (
                <div
                  key={c.id}
                  className={`audit-contact-item ${selectedAuditContactId === c.id ? 'selected' : ''}`}
                  onClick={() => setSelectedAuditContactId(c.id)}
                >
                  <img src={c.avatarUrl} alt="" className="avatar-img" />
                  <div className="audit-contact-info">
                    <h4>{c.name}</h4>
                    <span>{getMessageCount(c.id)} messages</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="audit-chat-window">
              {selectedAuditContactId ? (
                <div className="audit-messages-container">
                  {auditMessages.length === 0 && (
                    <div className="audit-empty">No messages for this contact</div>
                  )}
                  {auditMessages.map(m => (
                    <div key={m.id} className={`audit-message-row ${m.isFromMe ? 'me' : 'other'}`}>
                      <div className="audit-bubble">
                        <p>{m.text}</p>
                        <button className="audit-delete-btn" title="Delete" onClick={() => handleDeleteMessage(m.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <span className="audit-meta">
                        {m.isFromMe ? 'User' : 'Contact'} • {m.timeText}
                      </span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="audit-placeholder">
                  <MessageSquare size={28} />
                  <p>Select a contact to view message history</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add Contact Modal */}
      {showAddContactModal && (
        <div className="modal-overlay" onClick={() => setShowAddContactModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Contact</h3>
              <button className="modal-close" onClick={() => setShowAddContactModal(false)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddContactSubmit}>
              <div className="form-group">
                <label>Contact ID</label>
                <input type="text" placeholder="e.g. david" required value={newContactId} onChange={e => setNewContactId(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input type="text" placeholder="e.g. David Beckham" required value={newContactName} onChange={e => setNewContactName(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Avatar URL <span className="optional-tag">optional</span></label>
                <input type="url" placeholder="https://images.unsplash.com/..." value={newContactAvatar} onChange={e => setNewContactAvatar(e.target.value)} />
              </div>
              <div className="form-actions">
                <button type="button" className="admin-btn admin-btn-ghost" onClick={() => setShowAddContactModal(false)}>Cancel</button>
                <button type="submit" className="admin-btn admin-btn-primary">Create Contact</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="modal-overlay" onClick={confirmDialog.onCancel}>
          <div className="modal-card confirm-dialog" onClick={e => e.stopPropagation()}>
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
