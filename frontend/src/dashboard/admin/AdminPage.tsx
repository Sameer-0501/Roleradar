import { useState, useEffect } from 'react';
// @ts-ignore - preferences-client is JS
import { apiClient } from '../../modules/preferences-client.js';

const TABS = [
  'Overview', 'Sources', 'Scans', 'Verifications',
  'Jobs', 'Notifications', 'Workers', 'Coverage', 'Audit Logs'
];

function formatDateIST(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d) + ' IST';
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  const fetchTab = async (tabName: string, pageNum: number = 1) => {
    setLoading(true);
    setError('');
    try {
      const endpoint = tabName.toLowerCase().replace(' ', '-');
      // Ensure we are authenticated (apiClient handles token attachment internally)
      if (!apiClient.getToken()) throw new Error('Unauthenticated');

      const result = await apiClient.request(`/admin/${endpoint}?page=${pageNum}&limit=20`);
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTab(activeTab, page);
  }, [activeTab, page]);

  const renderPagination = () => {
    if (!data?.pagination) return null;
    const { page: currentPage, total, limit } = data.pagination;
    const maxPages = Math.ceil(total / limit);
    if (maxPages <= 1) return null;
    
    return (
      <div className="admin-pagination">
        <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</button>
        <span>Page {currentPage} of {maxPages} (Total: {total})</span>
        <button disabled={currentPage >= maxPages} onClick={() => setPage(currentPage + 1)}>Next</button>
      </div>
    );
  };

  const renderContent = () => {
    if (loading) return <div>Loading operational data...</div>;
    if (error) return <div style={{ color: 'var(--color-danger)' }}>Error: {error}</div>;
    if (!data) return <div>No data available</div>;

    switch (activeTab) {
      case 'Overview':
        return (
          <div className="admin-grid">
            <div className="admin-card">
              <h3>System Health</h3>
              <p>Active Sources: {data.system?.activeSources ?? 0}</p>
            </div>
            <div className="admin-card">
              <h3>Jobs</h3>
              <p>Active + Verified: {data.jobs?.activeAndVerified ?? 0}</p>
              <p>Discovered (24h): {data.jobs?.discovered24h ?? 0}</p>
              <p>Verified (24h): {data.jobs?.verified24h ?? 0}</p>
              <p>Closed (24h): {data.jobs?.closed24h ?? 0}</p>
            </div>
            <div className="admin-card">
              <h3>Digest Emails (24h)</h3>
              <p style={{ fontSize: '0.85em', color: '#64748b', marginBottom: '8px' }}>Provider-delivered batch emails</p>
              <p>Sent: {data.notifications?.digestEmails?.sent ?? data.notifications?.sent24h ?? 0}</p>
              <p>Failed: {data.notifications?.digestEmails?.failed ?? data.notifications?.failed24h ?? 0}</p>
              <p>Deferred: {data.notifications?.digestEmails?.pending ?? data.notifications?.pending24h ?? 0}</p>
            </div>
            <div className="admin-card">
              <h3>Job Intents (24h)</h3>
              <p style={{ fontSize: '0.85em', color: '#64748b', marginBottom: '8px' }}>Matched jobs grouped into digests</p>
              <p>Waiting for Next Window: {data.notifications?.jobIntents?.pending ?? data.notifications?.pendingJobs24h ?? 0}</p>
              <p>Included in Sent Digest: {data.notifications?.jobIntents?.includedInDigest ?? data.notifications?.sentJobs24h ?? 0}</p>
              <p>Failed: {data.notifications?.jobIntents?.failed ?? 0}</p>
            </div>
          </div>
        );
      
      case 'Sources':
        return (
          <table className="admin-table">
            <thead>
              <tr><th>Name</th><th>Domain</th><th>Type</th><th>Active</th><th>Health</th><th>Running</th></tr>
            </thead>
            <tbody>
              {(Array.isArray(data) ? data : []).map((s: any) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.domain}</td>
                  <td>{s.atsType}</td>
                  <td>{s.isActive ? 'Yes' : 'No'}</td>
                  <td><span className={`badge badge-${s.health.toLowerCase()}`}>{s.health}</span></td>
                  <td>{s.isCurrentlyRunning ? 'Running' : 'Waiting'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
        
      case 'Scans':
        return (
          <div>
            <table className="admin-table">
              <thead><tr><th>Source</th><th>Status</th><th>Started At (IST)</th><th>Completed At (IST)</th><th>Jobs Disc.</th><th>Jobs Verif.</th></tr></thead>
              <tbody>
                {(data.data || []).map((s: any) => (
                  <tr key={s.id}>
                    <td>{s.sourceName}</td>
                    <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                    <td>{formatDateIST(s.startedAt)}</td>
                    <td>{formatDateIST(s.completedAt)}</td>
                    <td>{s.jobsDiscovered}</td>
                    <td>{s.jobsVerified}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      case 'Jobs':
        return (
          <div>
            <table className="admin-table">
              <thead><tr><th>Title</th><th>Company</th><th>Status</th><th>Verification</th><th>Type</th><th>Location</th></tr></thead>
              <tbody>
                {(data.data || []).map((j: any) => (
                  <tr key={j.id}>
                    <td>{j.title}</td>
                    <td>{j.companyName}</td>
                    <td><span className={`badge badge-${j.status.toLowerCase()}`}>{j.status}</span></td>
                    <td><span className={`badge badge-${j.verificationStatus.toLowerCase()}`}>{j.verificationStatus}</span></td>
                    <td>{j.classification}</td>
                    <td>{j.location || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );
        
      case 'Verifications':
        return (
          <div>
            <table className="admin-table">
              <thead><tr><th>Job ID</th><th>Status</th><th>Score</th><th>Attempted At (IST)</th><th>Error</th></tr></thead>
              <tbody>
                {(data.data || []).map((v: any) => (
                  <tr key={v.id}>
                    <td style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>{v.jobId}</td>
                    <td><span className={`badge badge-${v.status.toLowerCase()}`}>{v.status}</span></td>
                    <td>{v.score ?? '-'}</td>
                    <td>{formatDateIST(v.attemptedAt)}</td>
                    <td>{v.errorReason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      case 'Notifications':
        return (
          <div>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Recipient</th>
                  <th>Semantics / Context</th>
                  <th>Job Target</th>
                  <th>Digest Relationship</th>
                  <th>Status</th>
                  <th>Attempts</th>
                  <th>Error State</th>
                  <th>Created (IST)</th>
                  <th>Sent (IST)</th>
                </tr>
              </thead>
              <tbody>
                {(data.data || []).map((n: any) => {
                  let typeBadge = 'badge-discovered';
                  let typeDisplay = n.type;
                  let context = '';

                  if (n.type === 'INSTANT_JOB') {
                    typeBadge = 'badge-running';
                    typeDisplay = 'Job Intent';
                    if (n.status === 'PENDING') {
                      context = 'Waiting for next digest window';
                    } else if (n.status === 'SENT') {
                      context = n.digestId ? 'Included in sent digest' : 'Direct alert sent (legacy)';
                    } else if (n.status === 'FAILED' || n.status === 'FAILED_PERMANENT') {
                      context = 'Intent processing failed';
                    } else {
                      context = n.status;
                    }
                  } else if (n.type === 'WINDOWED_DIGEST' || n.type === 'DAILY_DIGEST') {
                    typeBadge = 'badge-healthy';
                    typeDisplay = n.type === 'DAILY_DIGEST' ? 'Daily Digest' : 'Digest Email';
                    if (n.status === 'PENDING') {
                      context = 'Delivery deferred / waiting for eligible window';
                    } else if (n.status === 'SENT') {
                      context = 'Digest email sent via provider';
                    } else if (n.status === 'FAILED' || n.status === 'FAILED_PERMANENT') {
                      context = 'Delivery failed (jobs remain eligible for next window)';
                    } else if (n.status === 'PROCESSING') {
                      context = 'Processing batch & sending...';
                    } else {
                      context = n.status;
                    }
                  }

                  const jobDisplay = n.jobTitle
                    ? `${n.jobTitle}${n.companyName ? ` (${n.companyName})` : ''}`
                    : (n.jobId ? `Job #${n.jobId.slice(0, 8)}` : (n.type === 'INSTANT_JOB' ? '-' : 'Windowed Batch'));

                  const digestDisplay = n.digestId
                    ? `Digest #${n.digestId.slice(0, 8)}`
                    : (n.type === 'WINDOWED_DIGEST' || n.type === 'DAILY_DIGEST' ? `Digest #${n.id.slice(0, 8)} (Self)` : '-');

                  return (
                    <tr key={n.id}>
                      <td>
                        <span className={`badge ${typeBadge}`}>{typeDisplay}</span>
                      </td>
                      <td style={{ fontSize: '0.85em' }}>
                        <div>{n.userEmail || n.userId || '-'}</div>
                        {n.userName && <div style={{ color: '#64748b', fontSize: '0.8em' }}>{n.userName}</div>}
                      </td>
                      <td style={{ fontSize: '0.85em', color: '#475569', maxWidth: '240px' }}>{context}</td>
                      <td style={{ fontSize: '0.85em' }}>{jobDisplay}</td>
                      <td style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>{digestDisplay}</td>
                      <td>
                        <span className={`badge badge-${n.status.toLowerCase()}`}>{n.status}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {n.attempts}
                        {n.type === 'INSTANT_JOB' && (
                          <span title="Job intents do not make independent delivery attempts; delivery attempt is counted on the parent digest" style={{ color: '#94a3b8', marginLeft: '4px', cursor: 'help' }}>ⓘ</span>
                        )}
                      </td>
                      <td style={{ fontSize: '0.8em', color: n.failureReason ? '#dc2626' : '#94a3b8', maxWidth: '200px', wordBreak: 'break-word' }}>
                        {n.failureReason || '-'}
                      </td>
                      <td style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>{formatDateIST(n.createdAt)}</td>
                      <td style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>{formatDateIST(n.sentAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );

      case 'Workers':
        return (
          <div className="admin-grid">
            <div className="admin-card">
              <h3>Scheduler Engine</h3>
              <p>Status: {data.scheduler?.status}</p>
              <p>Registered Jobs: {data.scheduler?.registeredJobs}</p>
              <p>Active Scans: {data.scheduler?.activeScans}</p>
              <p>Last Tick (IST): {formatDateIST(data.scheduler?.lastTick)}</p>
            </div>
            <div className="admin-card">
              <h3>Windowed Digest Worker</h3>
              <p>Status: {data.digestWorker?.status || 'UNKNOWN'}</p>
              <p style={{ fontSize: '0.85em', color: '#64748b', marginTop: '4px' }}>Handles job grouping and actual email delivery</p>
            </div>
          </div>
        );

      case 'Coverage':
        return (
          <div className="admin-grid">
            <div className="admin-card">
              <h3>Experience Classification (Active + Verified)</h3>
              <p style={{ fontSize: '0.85em', color: '#64748b', marginBottom: '8px' }}>Categorized by experience matching engine</p>
              <p>Fresher-Eligible (0–2 yrs): <strong>{data.classification?.fresher ?? 0}</strong></p>
              <p style={{ fontSize: '0.8em', color: '#64748b', paddingLeft: '12px' }}>
                ↳ Strictly Entry Level: {data.classification?.fresherOnly ?? 0} | Dual (0-2y): {data.classification?.both ?? 0}
              </p>
              <p>Experienced (3+ yrs): <strong>{data.classification?.experienced ?? 0}</strong></p>
              <p>Conservative Unspecified: <strong>{data.classification?.unknown ?? 0}</strong></p>
            </div>
            <div className="admin-card">
              <h3>Workplace Distribution (Active + Verified)</h3>
              <p style={{ fontSize: '0.85em', color: '#64748b', marginBottom: '8px' }}>Direct from employer job listings</p>
              <p>Remote: <strong>{data.workplace?.remote ?? 0}</strong></p>
              <p>Onsite: <strong>{data.workplace?.onsite ?? 0}</strong></p>
              <p>Hybrid: <strong>{data.workplace?.hybrid ?? 0}</strong></p>
              <p>Unspecified: <strong>{data.workplace?.unknown ?? 0}</strong></p>
            </div>
          </div>
        );
        
      case 'Audit Logs':
        return (
          <div>
            <table className="admin-table">
              <thead><tr><th>Action</th><th>Outcome</th><th>Actor ID</th><th>Target</th><th>Created At (IST)</th></tr></thead>
              <tbody>
                {(data.data || []).map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.action}</td>
                    <td><span className={`badge badge-${l.outcome.toLowerCase()}`}>{l.outcome}</span></td>
                    <td style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>{l.actor_user_id || l.actorUserId}</td>
                    <td style={{ fontSize: '0.85em', fontFamily: 'monospace' }}>{l.resource_type || l.resourceType} ({l.resource_id || l.resourceId})</td>
                    <td>{formatDateIST(l.created_at || l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {renderPagination()}
          </div>
        );
        
      default:
        return <div>Data representation not yet implemented.</div>;
    }
  };

  return (
    <div className="admin-console">
      <header className="admin-header">
        <h2>RoleRadar Operations Console</h2>
        <p className="admin-subtitle">Read-Only Production Observability</p>
      </header>
      
      <nav className="admin-tabs">
        {TABS.map(tab => (
          <button 
            key={tab} 
            className={`admin-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setPage(1); }}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main className="admin-main">
        {renderContent()}
      </main>
    </div>
  );
}
