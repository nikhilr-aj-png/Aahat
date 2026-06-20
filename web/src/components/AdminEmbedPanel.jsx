import React, { useState } from 'react';
import { Users, Activity, MessageSquare, ShieldAlert, Server, Trash2, Ban, ShieldCheck, CheckCircle } from 'lucide-react';
import SafeAvatar from './SafeAvatar';

/**
 * AdminEmbedPanel - Render client-side admin panel dashboard with charts,
 * moderation queue, user controls, and system configs.
 */
export default function AdminEmbedPanel({ conversations = [], messages = [] }) {
  const [adminTab, setAdminTab] = useState('overview');
  const [blockedCount, setBlockedCount] = useState(1);
  const [suspendList, setSuspendList] = useState({});
  const [reports, setReports] = useState([
    { id: "r1", sender: "Alex", reportedUser: "Elena R.", message: "Send the final files immediately", reason: "Spam behavior", timestamp: "10m ago" },
    { id: "r2", sender: "Casey", reportedUser: "Spammer Bot 99", message: "Buy tokens at discount website!", reason: "Abuse / Advertising", timestamp: "1h ago" }
  ]);

  // System credentials state
  const [otpProvider, setOtpProvider] = useState('twilio');
  const [storageBucket, setStorageBucket] = useState('supabase-attachments');
  const [pushChannel, setPushChannel] = useState('fcm-production');

  const toggleSuspend = (username) => {
    setSuspendList(prev => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const handleResolveReport = (reportId) => {
    setReports(prev => prev.filter(r => r.id !== reportId));
  };

  const totalUsers = conversations.filter(c => c.type === 'direct').length + 1; // plus self
  const onlineUsers = conversations.filter(c => c.isOnline && c.type === 'direct').length + 1;
  const totalGroups = conversations.filter(c => c.type === 'group').length;
  
  return (
    <div className="admin-embed-container" id="admin-panel">
      {/* Top Header */}
      <div className="admin-embed-header">
        <div className="header-badge-row">
          <ShieldAlert size={18} className="text-indigo-400 animate-pulse" />
          <h2>Aahat Admin Center</h2>
        </div>
        <div className="admin-tab-nav">
          <button className={adminTab === 'overview' ? 'active' : ''} onClick={() => setAdminTab('overview')}>Analytics</button>
          <button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>Users Manager</button>
          <button className={adminTab === 'moderation' ? 'active' : ''} onClick={() => setAdminTab('moderation')}>Moderation Queue</button>
          <button className={adminTab === 'settings' ? 'active' : ''} onClick={() => setAdminTab('settings')}>Configs</button>
        </div>
      </div>

      <div className="admin-embed-scroll">
        {/* OVERVIEW */}
        {adminTab === 'overview' && (
          <div className="admin-tab-section">
            <div className="admin-stats-grid">
              <div className="admin-stat-card">
                <Users className="icon users" size={20} />
                <div className="stat-info">
                  <h3>{totalUsers}</h3>
                  <p>Total Users</p>
                </div>
              </div>
              <div className="admin-stat-card">
                <Activity className="icon online" size={20} />
                <div className="stat-info">
                  <h3>{onlineUsers}</h3>
                  <p>Online Users</p>
                </div>
              </div>
              <div className="admin-stat-card">
                <MessageSquare className="icon messages" size={20} />
                <div className="stat-info">
                  <h3>{messages.length || 24}</h3>
                  <p>Active Messages</p>
                </div>
              </div>
              <div className="admin-stat-card">
                <Server className="icon groups" size={20} />
                <div className="stat-info">
                  <h3>{totalGroups}</h3>
                  <p>Total Groups</p>
                </div>
              </div>
            </div>

            {/* Custom SVG Growth Chart */}
            <div className="admin-chart-card">
              <h4>Telemetry Analytics (Weekly Traffic)</h4>
              <div className="svg-chart-container">
                <svg viewBox="0 0 400 120" className="w-full h-32">
                  <path 
                    d="M 10 100 Q 80 40, 150 70 T 290 20 T 390 40" 
                    fill="none" 
                    stroke="url(#chart-grad)" 
                    strokeWidth="3" 
                  />
                  <defs>
                    <linearGradient id="chart-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4F46E5" />
                      <stop offset="100%" stopColor="#06B6D4" />
                    </linearGradient>
                  </defs>
                  {/* Grid lines */}
                  <line x1="10" y1="20" x2="390" y2="20" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="10" y1="60" x2="390" y2="60" stroke="rgba(255,255,255,0.05)" strokeDasharray="4 4" />
                  <line x1="10" y1="100" x2="390" y2="100" stroke="rgba(255,255,255,0.1)" />
                  {/* Label nodes */}
                  <circle cx="80" cy="58" r="4" fill="#06B6D4" />
                  <circle cx="290" cy="20" r="4" fill="#4F46E5" />
                </svg>
                <div className="chart-labels">
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* USERS MANAGER */}
        {adminTab === 'users' && (
          <div className="admin-tab-section">
            <h3>Registered User Accounts</h3>
            <div className="users-mgmt-list">
              {conversations.map(user => (
                <div key={user.id} className="admin-user-row">
                  <div className="user-info-side">
                    <SafeAvatar src={user.avatarUrl} name={user.name} size={32} className="user-avatar-sm" />
                    <div>
                      <h4>{user.name}</h4>
                      <span>ID: <code>{user.id}</code> {user.type === 'group' && "• GROUP"}</span>
                    </div>
                  </div>
                  <div className="user-actions-side">
                    {suspendList[user.name] ? (
                      <span className="suspended-label">Suspended</span>
                    ) : (
                      <span className="active-label">Active</span>
                    )}
                    <button 
                      className={`btn-suspend-user ${suspendList[user.name] ? 'active' : ''}`}
                      onClick={() => toggleSuspend(user.name)}
                    >
                      <Ban size={12} /> {suspendList[user.name] ? "Reactivate" : "Suspend"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODERATION QUEUE */}
        {adminTab === 'moderation' && (
          <div className="admin-tab-section">
            <h3>Pending Moderation Reports</h3>
            <div className="reports-list">
              {reports.length === 0 ? (
                <div className="empty-reports-card">
                  <CheckCircle size={24} className="text-green-500" />
                  <p>Moderation queue clean! No spam reports.</p>
                </div>
              ) : (
                reports.map(rep => (
                  <div key={rep.id} className="report-item-card">
                    <div className="report-header-row">
                      <span className="reason-badge">{rep.reason}</span>
                      <span className="timestamp">{rep.timestamp}</span>
                    </div>
                    <p className="reported-text">
                      "<em>{rep.message}</em>"
                    </p>
                    <div className="reporter-info">
                      Reported user: <strong>{rep.reportedUser}</strong> • Filed by: {rep.sender}
                    </div>
                    <div className="report-actions-row">
                      <button className="btn-resolve" onClick={() => handleResolveReport(rep.id)}>
                        <ShieldCheck size={12} /> Dismiss
                      </button>
                      <button className="btn-ban" onClick={() => { toggleSuspend(rep.reportedUser); handleResolveReport(rep.id); }}>
                        <Ban size={12} /> Suspend User
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* CONFIGS / SYSTEM SETTINGS */}
        {adminTab === 'settings' && (
          <div className="admin-tab-section flex-column-gap">
            <h3>System Credentials Configs</h3>
            
            <div className="form-group">
              <label>SMS / OTP Verification Provider</label>
              <select value={otpProvider} onChange={e => setOtpProvider(e.target.value)} className="admin-select-input">
                <option value="twilio">Twilio Cloud API</option>
                <option value="messagebird">MessageBird SMS</option>
                <option value="firebase">Firebase OTP Verification</option>
              </select>
            </div>

            <div className="form-group">
              <label>Active Storage Bucket Bucket</label>
              <select value={storageBucket} onChange={e => setStorageBucket(e.target.value)} className="admin-select-input">
                <option value="supabase-attachments">Supabase Default (attachments)</option>
                <option value="aws-s3-prod">Amazon AWS S3 Bucket (prod)</option>
                <option value="google-cloud-bucket">Google Cloud Platform Storage</option>
              </select>
            </div>

            <div className="form-group">
              <label>Firebase Cloud Channel</label>
              <select value={pushChannel} onChange={e => setPushChannel(e.target.value)} className="admin-select-input">
                <option value="fcm-production">Firebase Cloud Messaging (FCM)</option>
                <option value="apns-apple">Apple APNS Gateway</option>
              </select>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
