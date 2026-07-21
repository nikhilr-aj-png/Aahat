import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Ban, Check, CheckCircle2, Clock3, EyeOff, FileWarning, Gavel,
  History, LoaderCircle, MessageSquare, RefreshCw, Search, ShieldAlert,
  ShieldCheck, Trash2, UserCheck, Users, X, XCircle,
} from 'lucide-react';
import { supabase } from '../supabase';
import './AdminEmbedProduction.css';

const EMPTY = { users: 0, online: 0, messages: 0, messages_today: 0, conversations: 0, calls_today: 0, open_reports: 0, suspended: 0, banned: 0 };
const TABS = [
  ['overview', 'Overview', Activity], ['users', 'Users', Users],
  ['reports', 'Reports', FileWarning], ['audit', 'Audit trail', History],
];
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function formatDate(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function Avatar({ user }) {
  const letters = (user.display_name || 'Aahat User').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return user.avatar_url
    ? <img className="admin-avatar" src={user.avatar_url} alt="" />
    : <span className="admin-avatar admin-avatar-fallback">{letters}</span>;
}

function hasFreshDatabasePresence(user) {
  const lastSeen = Date.parse(user.last_seen || '');
  return Boolean(user.is_online && Number.isFinite(lastSeen) && Date.now() - lastSeen < 45_000);
}

export default function AdminEmbedProduction() {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(EMPTY);
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [audit, setAudit] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [reportFilter, setReportFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    const results = await Promise.all([
      supabase.rpc('admin_dashboard_overview'),
      supabase.rpc('admin_list_users', { p_search: '', p_status: 'all', p_limit: 500 }),
      supabase.rpc('admin_list_reports', { p_status: 'all', p_limit: 300 }),
      supabase.rpc('admin_list_moderation_actions', { p_limit: 200 }),
    ]);
    const failed = results.find(result => result.error);
    if (failed) setError(failed.error.message);
    else {
      setOverview({ ...EMPTY, ...(results[0].data || {}) });
      setProfiles(Array.isArray(results[1].data) ? results[1].data : []);
      setReports(Array.isArray(results[2].data) ? results[2].data : []);
      setAudit(Array.isArray(results[3].data) ? results[3].data : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Keep presence dots live: refresh quietly while the tab is visible. The 45s
  // server freshness window means a sub-45s cadence keeps online/offline honest.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load(true); };
    const interval = window.setInterval(tick, 25000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [load]);

  const shownUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return profiles.filter(user => (status === 'all' || user.account_status === status)
      && (!query || [user.display_name, user.email].some(value => String(value || '').toLowerCase().includes(query))));
  }, [profiles, search, status]);

  const shownReports = useMemo(() => reports.filter(report => reportFilter === 'all'
    || (reportFilter === 'active' && ['open', 'reviewing'].includes(report.status))
    || report.status === reportFilter), [reports, reportFilter]);

  // Admins see global operational presence straight from the database heartbeat
  // (is_online + last_seen freshness), not the viewer's contact-scoped realtime
  // presence — otherwise every non-contact would incorrectly read as offline here.
  const onlineState = useCallback(user => hasFreshDatabasePresence(user), []);
  const liveOnlineCount = useMemo(() => profiles.filter(onlineState).length, [profiles, onlineState]);

  const openAction = (type, item, nextStatus) => { setReason(''); setDialog({ type, item, status: nextStatus }); };
  const submitAction = async () => {
    if (!dialog || busy) return;
    if (dialog.type === 'user' && dialog.status !== 'active' && reason.trim().length < 3) {
      setError('Suspend, ban या delete करने के लिए कम-से-कम 3 अक्षर का कारण लिखें।');
      return;
    }
    setBusy(true); setError('');
    let result;
    if (dialog.type === 'user' && dialog.status === 'deleted') {
      // Permanent deletion runs through the service-role Edge Function.
      result = await supabase.functions.invoke('admin-delete-user', { body: { userId: dialog.item.id, reason: reason.trim() } });
    } else if (dialog.type === 'user') {
      result = await supabase.rpc('admin_set_account_status', { p_user_id: dialog.item.id, p_status: dialog.status, p_reason: reason.trim() });
    } else {
      result = await supabase.rpc('admin_update_report_status', { p_report_id: dialog.item.id, p_status: dialog.status, p_reason: reason.trim() });
    }
    if (result.error) setError(result.error.message);
    else {
      setDialog(null);
      setNotice(dialog.type === 'user' ? (dialog.status === 'deleted' ? 'Account permanently deleted.' : 'Account status updated.') : 'Report updated.');
      await load(true); window.setTimeout(() => setNotice(''), 3000);
    }
    setBusy(false);
  };

  const stats = [
    ['Total users', overview.users, `${liveOnlineCount} online now`, Users, 'violet'],
    ['Messages', overview.messages, `${overview.messages_today} sent today`, MessageSquare, 'cyan'],
    ['Open reports', overview.open_reports, 'Needs moderation', ShieldAlert, 'amber'],
    ['Restricted', Number(overview.suspended) + Number(overview.banned), `${overview.banned} permanently banned`, Ban, 'rose'],
  ];

  return <div className="admin-embed-container"><div className="admin-shell">
    <header className="admin-embed-header">
      <div className="admin-title-group"><span className="admin-title-icon"><ShieldCheck size={22}/></span><div><h2>Aahat Admin Center</h2><p>Safety, moderation and platform health</p></div></div>
      <div className="admin-header-actions"><span className="admin-live-pill"><i/> Protected admin session</span><button className="admin-refresh-btn" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'is-spinning' : ''}/> Refresh</button></div>
    </header>
    <nav className="admin-tab-nav" aria-label="Admin sections">{TABS.map(([id, label, Icon]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}><Icon size={16}/><span>{label}</span>{id === 'reports' && overview.open_reports > 0 && <b>{overview.open_reports}</b>}</button>)}</nav>
    <main className="admin-embed-scroll">
      {error && <div className="admin-banner is-error" role="alert"><XCircle size={18}/><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div>}
      {notice && <div className="admin-banner is-success"><CheckCircle2 size={18}/><span>{notice}</span></div>}
      {loading ? <div className="admin-loading"><LoaderCircle size={28} className="is-spinning"/><strong>Loading secure admin data</strong><span>Verifying permissions and platform health…</span></div> : <>
        {tab === 'overview' && <section>
          <div className="admin-section-heading"><div><span className="admin-eyebrow">Live overview</span><h3>Platform pulse</h3></div><small>Updated {formatDate(overview.generated_at)}</small></div>
          <div className="admin-stats-grid">{stats.map(([label, value, detail, Icon, tone]) => <article className={`admin-stat-card tone-${tone}`} key={label}><span className="admin-stat-icon"><Icon size={21}/></span><div><p>{label}</p><h3>{compact.format(value || 0)}</h3><small>{detail}</small></div></article>)}</div>
          <div className="admin-overview-grid">
            <article className="admin-premium-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">Operations</span><h4>Moderation snapshot</h4></div><Gavel size={19}/></div><div className="admin-metric-list"><button onClick={() => setTab('reports')}><span><ShieldAlert size={17}/> Reports waiting</span><b>{overview.open_reports}</b></button><button onClick={() => { setStatus('suspended'); setTab('users'); }}><span><Clock3 size={17}/> Suspended accounts</span><b>{overview.suspended}</b></button><button onClick={() => { setStatus('banned'); setTab('users'); }}><span><Ban size={17}/> Banned accounts</span><b>{overview.banned}</b></button></div></article>
            <article className="admin-premium-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">System</span><h4>Service health</h4></div><Activity size={19}/></div>{[['Database & RLS','Operational'],['Admin RPC','Protected'],['Conversations',compact.format(overview.conversations || 0)],['Calls today',compact.format(overview.calls_today || 0)]].map(([label,value]) => <div className="admin-health-row" key={label}><span><i/>{label}</span><b>{value}</b></div>)}</article>
            <article className="admin-premium-card admin-privacy-card"><div className="admin-card-heading"><div><span className="admin-eyebrow">Privacy guardrail</span><h4>What admins cannot access</h4></div><EyeOff size={19}/></div><p>Passwords, private message contents and account impersonation are intentionally unavailable. Moderation uses reports, metadata and audited actions only.</p></article>
          </div>
        </section>}
        {tab === 'users' && <section>
          <div className="admin-section-heading"><div><span className="admin-eyebrow">Account management</span><h3>Users</h3></div><small>{shownUsers.length} results</small></div>
          <div className="admin-toolbar"><label className="admin-search"><Search size={17}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email"/></label><div className="admin-filter-row">{['all','active','suspended','banned'].map(item => <button className={status === item ? 'active' : ''} onClick={() => setStatus(item)} key={item}>{item}</button>)}</div></div>
          <div className="admin-user-table"><div className="admin-table-head"><span>User</span><span>Presence</span><span>Reports</span><span>Account</span><span>Action</span></div>{shownUsers.map(user => <article className="admin-user-row" key={user.id}>
            <div className="admin-user-identity"><Avatar user={user}/><span><strong>{user.display_name || 'Unnamed user'}</strong><small>{user.email}</small></span></div><div className="admin-user-activity"><i className={onlineState(user) ? 'online' : ''}/><span>{onlineState(user) ? 'Online' : user.last_seen ? `Last seen ${formatDate(user.last_seen)}` : 'Offline'}</span></div><span className="admin-report-count">{user.report_count || 0}</span><span className={`admin-status-badge is-${user.account_status}`}>{user.account_status}</span>
            <div className="admin-user-actions">{user.role === 'super_admin' ? <span className="admin-protected-label"><ShieldCheck size={14}/> Protected</span> : <>{user.account_status === 'active' ? <><button onClick={() => openAction('user', user, 'suspended')}>Suspend</button><button className="danger" onClick={() => openAction('user', user, 'banned')}>Ban</button></> : <button className="success" onClick={() => openAction('user', user, 'active')}><UserCheck size={14}/> Reactivate</button>}<button className="danger" onClick={() => openAction('user', user, 'deleted')}><Trash2 size={14}/> Delete</button></>}</div>
          </article>)}{shownUsers.length === 0 && <Empty icon={Users} title="No users found" text="Try another search or status filter."/>}</div>
        </section>}
        {tab === 'reports' && <section>
          <div className="admin-section-heading"><div><span className="admin-eyebrow">Safety queue</span><h3>User reports</h3></div><small>{shownReports.length} shown</small></div><div className="admin-filter-row admin-report-filters">{['active','open','reviewing','resolved','dismissed','all'].map(item => <button className={reportFilter === item ? 'active' : ''} onClick={() => setReportFilter(item)} key={item}>{item}</button>)}</div>
          <div className="admin-reports-grid">{shownReports.map(report => <article className="report-item-card" key={report.id}><div className="report-header-row"><span className={`admin-status-badge is-${report.status}`}>{report.status}</span><time>{formatDate(report.created_at)}</time></div><h4>{report.reason}</h4><p>{report.details || 'No additional details were provided.'}</p><div className="admin-report-people"><span>Reported by <b>{report.reporter_name || 'Unknown'}</b></span><span>Against <b>{report.reported_name || 'Content / conversation'}</b></span></div>{report.assigned_admin_name && <small>Assigned to {report.assigned_admin_name}</small>}{['open','reviewing'].includes(report.status) && <div className="report-actions-row">{report.status === 'open' && <button onClick={() => openAction('report', report, 'reviewing')}><Clock3 size={14}/> Review</button>}<button className="success" onClick={() => openAction('report', report, 'resolved')}><Check size={14}/> Resolve</button><button onClick={() => openAction('report', report, 'dismissed')}><X size={14}/> Dismiss</button></div>}</article>)}{shownReports.length === 0 && <Empty icon={CheckCircle2} title="Queue is clear" text="No reports match this filter."/>}</div>
        </section>}
        {tab === 'audit' && <section><div className="admin-section-heading"><div><span className="admin-eyebrow">Immutable accountability</span><h3>Moderation audit trail</h3></div><small>{audit.length} recent actions</small></div><div className="admin-audit-list">{audit.map(entry => <article key={entry.id}><span className="admin-audit-icon"><History size={17}/></span><div><strong>{String(entry.action_type || '').replaceAll('_',' ')}</strong><p><b>{entry.admin_name || 'Administrator'}</b>{entry.target_name ? ` acted on ${entry.target_name}` : entry.report_id ? ' updated a report' : ' performed an admin action'}</p>{entry.reason && <small>Reason: {entry.reason}</small>}</div><time>{formatDate(entry.created_at)}</time></article>)}{audit.length === 0 && <Empty icon={History} title="No actions yet" text="Admin decisions will be recorded here."/>}</div></section>}
      </>}
    </main>
  </div>
  {dialog && <div className="admin-dialog-backdrop" onMouseDown={e => e.target === e.currentTarget && !busy && setDialog(null)}><div className="admin-action-dialog" role="dialog" aria-modal="true"><span className={`admin-dialog-icon ${['banned','suspended','deleted'].includes(dialog.status) ? 'danger' : ''}`}>{dialog.status === 'deleted' ? <Trash2 size={22}/> : <Gavel size={22}/>}</span><h3>{dialog.type === 'user' ? `${dialog.status === 'active' ? 'Reactivate' : dialog.status === 'deleted' ? 'Delete' : dialog.status} account` : `${dialog.status} report`}</h3><p>{dialog.type === 'user' ? (dialog.status === 'deleted' ? `${dialog.item.display_name} का account और उससे जुड़ा data स्थायी रूप से मिटा दिया जाएगा। यह वापस नहीं आ सकता।` : `${dialog.item.display_name} की account access बदलने से पहले निर्णय का कारण दर्ज करें।`) : 'यह moderation decision audit trail में सुरक्षित रहेगा।'}</p><label>Admin note {dialog.type === 'user' && dialog.status !== 'active' && <b>Required</b>}<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason and useful context…" rows={4} autoFocus/></label><div><button onClick={() => setDialog(null)} disabled={busy}>Cancel</button><button className="primary" onClick={submitAction} disabled={busy}>{busy && <LoaderCircle size={15} className="is-spinning"/>} Confirm action</button></div></div></div>}
  </div>;
}

function Empty({ icon: Icon, title, text }) {
  return <div className="admin-empty-state"><Icon size={29}/><strong>{title}</strong><span>{text}</span></div>;
}
