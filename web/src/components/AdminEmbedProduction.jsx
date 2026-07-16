import { useCallback, useEffect, useState } from 'react';
import { Activity, Ban, CheckCircle, MessageSquare, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '../supabase';

export default function AdminEmbedProduction() {
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ conversations: 0, messages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [profileResult, reportResult, conversationResult, messageResult] = await Promise.all([
        supabase.from('profiles').select('id,display_name,email,avatar_url,role,is_online,account_status,created_at').order('created_at', { ascending: false }).limit(200),
        supabase.from('reports').select('*,reporter:profiles!reports_reporter_id_fkey(display_name),reported:profiles!reports_reported_user_id_fkey(display_name)').in('status', ['open','reviewing']).order('created_at', { ascending: false }).limit(100),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true })
      ]);
      for (const result of [profileResult, reportResult, conversationResult, messageResult]) if (result.error) throw result.error;
      setProfiles(profileResult.data || []); setReports(reportResult.data || []);
      setStats({ conversations: conversationResult.count || 0, messages: messageResult.count || 0 });
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (profile, status) => {
    const reason = prompt(`Reason for setting ${profile.display_name} to ${status}:`) || '';
    const { error: rpcError } = await supabase.rpc('admin_set_account_status', { p_user_id: profile.id, p_status: status, p_reason: reason });
    if (rpcError) return setError(rpcError.message);
    await load();
  };
  const resolve = async (id, status) => {
    const { error: rpcError } = await supabase.rpc('admin_resolve_report', { p_report_id: id, p_status: status, p_reason: '' });
    if (rpcError) return setError(rpcError.message);
    await load();
  };

  return <div className="admin-embed-container">
    <div className="admin-embed-header"><h2><ShieldAlert size={19}/> Aahat Admin Center</h2><button onClick={load}><RefreshCw size={15}/>Refresh</button></div>
    {error && <div className="admin-auth-error">{error}</div>}
    <div className="admin-stats-grid">
      <div className="admin-stat-card"><Users size={20}/><div><h3>{profiles.length}</h3><p>Loaded users</p></div></div>
      <div className="admin-stat-card"><Activity size={20}/><div><h3>{profiles.filter(row => row.is_online).length}</h3><p>Online</p></div></div>
      <div className="admin-stat-card"><MessageSquare size={20}/><div><h3>{stats.messages}</h3><p>Messages</p></div></div>
      <div className="admin-stat-card"><ShieldAlert size={20}/><div><h3>{reports.length}</h3><p>Open reports</p></div></div>
    </div>
    {loading ? <p>Loading verified backend data…</p> : <>
      <section className="admin-tab-section"><h3>Users</h3><div className="users-mgmt-list">{profiles.map(profile => <div className="admin-user-row" key={profile.id}><div><strong>{profile.display_name}</strong><small>{profile.email} · {profile.role} · {profile.account_status}</small></div><button onClick={() => setStatus(profile, profile.account_status === 'active' ? 'suspended' : 'active')}><Ban size={13}/>{profile.account_status === 'active' ? 'Suspend' : 'Reactivate'}</button></div>)}</div></section>
      <section className="admin-tab-section"><h3>Moderation queue</h3>{reports.length === 0 ? <p><CheckCircle size={18}/> No open reports.</p> : reports.map(report => <article className="report-item-card" key={report.id}><strong>{report.reason}</strong><p>{report.details}</p><small>Filed by {report.reporter?.display_name || 'Unknown'}</small><div><button onClick={() => resolve(report.id,'dismissed')}>Dismiss</button><button onClick={() => resolve(report.id,'resolved')}>Resolve</button></div></article>)}</section>
    </>}
  </div>;
}
