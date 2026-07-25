import { useEffect, useState } from 'react';
import { api, authHeaders } from '../lib/api';

type Dashboard = { total_content: number; active_jobs: number; completed_jobs: number; failed_jobs: number };
type Job = { id: string; job_type: string; content_id?: number; status: string; progress: number; log_message?: string; error_message?: string; created_at: string };
type Provider = { id: number; provider_name: string; status: string; response_time_ms?: number; message: string; last_checked_at: string };
type Log = { id: number; level: string; source: string; message: string; created_at: string };

type MetricCardProps = {
  value: number | string;
  label: string;
  icon: 'library' | 'bolt' | 'check' | 'alert';
};

function MetricCard({ value, label, icon }: MetricCardProps) {
  const icons = {
    library: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
    bolt: <path d="m13 2-7 11h6l-1 9 7-12h-6z" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    alert: <><path d="M12 4 3.5 19h17z" /><path d="M12 9v4M12 16h.01" /></>,
  };

  return (
    <article className="metric-card">
      <span className="metric-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none">{icons[icon]}</svg></span>
      <strong>{value}</strong>
      <span>{label}</span>
    </article>
  );
}

export default function AdminApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    const init = { headers: authHeaders() };
    const results = await Promise.allSettled([
      api<Dashboard>('/api/admin/dashboard', init),
      api<Job[]>('/api/admin/jobs', init),
      api<Provider[]>('/api/admin/providers', init),
      api<Log[]>('/api/admin/logs', init),
    ]);

    if (results[0].status === 'fulfilled') setDashboard(results[0].value);
    if (results[1].status === 'fulfilled') setJobs(results[1].value);
    if (results[2].status === 'fulfilled') setProviders(results[2].value);
    if (results[3].status === 'fulfilled') setLogs(results[3].value);

    const failure = results.find(result => result.status === 'rejected');
    setError(failure && failure.status === 'rejected' ? failure.reason?.message || 'Some dashboard data could not be loaded' : '');
  };

  useEffect(() => {
    if (!localStorage.getItem('admin_token')) {
      location.href = '/admin/login';
      return;
    }
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  const createJob = async (jobType: string) => {
    const contentId = jobType === 'duplicate_detection' ? null : 1;
    const payload = jobType === 'duplicate_detection'
      ? { title: 'Mountain Horizons', release_year: 2026 }
      : jobType === 'subtitle_import'
        ? { language_code: 'fr', label: 'Français', file_url: '/subtitles/mountain-horizons-en.vtt' }
        : { description: 'Metadata enriched by the background worker.' };
    await api('/api/admin/jobs', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ job_type: jobType, content_id: contentId, payload }),
    });
    setTimeout(() => void load(), 300);
  };

  const retry = async (id: string) => {
    await api(`/api/admin/jobs/${id}/retry`, { method: 'POST', headers: authHeaders() });
    await load();
  };

  return (
    <div className="admin-grid">
      {error && <div className="error-state"><div><strong>Some operational data is unavailable</strong><span>{error}</span></div></div>}

      <section className="metric-grid">
        <MetricCard value={dashboard?.total_content ?? '—'} label="Content items" icon="library" />
        <MetricCard value={dashboard?.active_jobs ?? '—'} label="Active jobs" icon="bolt" />
        <MetricCard value={dashboard?.completed_jobs ?? '—'} label="Completed jobs" icon="check" />
        <MetricCard value={dashboard?.failed_jobs ?? '—'} label="Failed jobs" icon="alert" />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div><p className="eyebrow">Ingestion</p><h2>Background jobs</h2></div>
          <div className="actions">
            <button className="ghost" onClick={() => void createJob('metadata_enrichment')}>Enrich metadata</button>
            <button className="ghost" onClick={() => void createJob('subtitle_import')}>Import subtitle</button>
            <button onClick={() => void createJob('duplicate_detection')}>Check duplicate</button>
          </div>
        </div>
        {jobs.length ? (
          <div className="table-wrap"><table><thead><tr><th>Type</th><th>Status</th><th>Progress</th><th>Latest update</th><th></th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td>{job.job_type.replaceAll('_', ' ')}</td><td><span className={`status ${job.status}`}>{job.status}</span></td><td>{job.progress}%</td><td>{job.error_message || job.log_message || '—'}</td><td>{job.status === 'failed' && <button className="ghost" onClick={() => void retry(job.id)}>Retry</button>}</td></tr>)}</tbody></table></div>
        ) : (
          <div className="empty-state"><div><strong>No jobs yet</strong><span>Start a metadata, subtitle, or duplicate-check job to populate the queue.</span><div className="empty-state-actions"><button onClick={() => void createJob('metadata_enrichment')}>Run metadata enrichment</button></div></div></div>
        )}
      </section>

      <section className="panel">
        <p className="eyebrow">Infrastructure</p><h2>Provider health</h2>
        <div className="provider-list">{providers.map(provider => <article key={provider.id}><span className={`dot ${provider.status}`}></span><div><strong>{provider.provider_name}</strong><p>{provider.message}</p></div><small>{provider.response_time_ms ? `${provider.response_time_ms} ms` : 'Unavailable'}</small></article>)}</div>
      </section>

      <section className="panel">
        <p className="eyebrow">Audit trail</p><h2>Recent system logs</h2>
        <div className="log-list">{logs.map(log => <div key={log.id}><span className={`status ${log.level}`}>{log.level}</span><strong>{log.source}</strong><p>{log.message}</p><time>{new Date(log.created_at).toLocaleString()}</time></div>)}</div>
      </section>
    </div>
  );
}
