import { useEffect, useState } from 'react';
import { api, authHeaders } from '../lib/api';

type Dashboard = { total_content: number; active_jobs: number; completed_jobs: number; failed_jobs: number };
type Job = { id: string; job_type: string; content_id?: number; status: string; progress: number; log_message?: string; error_message?: string; created_at: string };
type Provider = { id: number; provider_name: string; status: string; response_time_ms?: number; message: string; last_checked_at: string };
type Log = { id: number; level: string; source: string; message: string; created_at: string };

export default function AdminApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const init = { headers: authHeaders() };
      const [d, j, p, l] = await Promise.all([
        api<Dashboard>('/api/admin/dashboard', init), api<Job[]>('/api/admin/jobs', init), api<Provider[]>('/api/admin/providers', init), api<Log[]>('/api/admin/logs', init)
      ]);
      setDashboard(d); setJobs(j); setProviders(p); setLogs(l); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load admin dashboard'); }
  };

  useEffect(() => {
    if (!localStorage.getItem('admin_token')) { location.href = '/admin/login'; return; }
    load();
    const timer = window.setInterval(load, 2000);
    return () => window.clearInterval(timer);
  }, []);

  const createJob = async (jobType: string) => {
    const contentId = jobType === 'duplicate_detection' ? null : 1;
    const payload = jobType === 'duplicate_detection'
      ? { title: 'Mountain Horizons', release_year: 2026 }
      : jobType === 'subtitle_import'
        ? { language_code: 'fr', label: 'Français', file_url: '/subtitles/mountain-horizons-en.vtt' }
        : { description: 'Metadata enriched by the background worker.' };
    await api('/api/admin/jobs', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ job_type: jobType, content_id: contentId, payload }) });
    setTimeout(load, 400);
  };

  const retry = async (id: string) => { await api(`/api/admin/jobs/${id}/retry`, { method: 'POST', headers: authHeaders() }); load(); };

  if (error) return <div className="panel error">{error} <a href="/admin/login">Sign in again</a></div>;
  return <div className="admin-grid">
    <section className="metric-grid">
      <article><strong>{dashboard?.total_content ?? '—'}</strong><span>Content items</span></article>
      <article><strong>{dashboard?.active_jobs ?? '—'}</strong><span>Active jobs</span></article>
      <article><strong>{dashboard?.completed_jobs ?? '—'}</strong><span>Completed jobs</span></article>
      <article><strong>{dashboard?.failed_jobs ?? '—'}</strong><span>Failed jobs</span></article>
    </section>

    <section className="panel">
      <div className="section-heading"><div><p className="eyebrow">Background jobs</p><h2>Ingestion queue</h2></div><div className="actions"><button onClick={() => createJob('metadata_enrichment')}>Enrich metadata</button><button onClick={() => createJob('subtitle_import')}>Import subtitle</button><button onClick={() => createJob('duplicate_detection')}>Check duplicate</button></div></div>
      <div className="table-wrap"><table><thead><tr><th>Type</th><th>Status</th><th>Progress</th><th>Log</th><th></th></tr></thead><tbody>{jobs.map(job => <tr key={job.id}><td>{job.job_type.replaceAll('_',' ')}</td><td><span className={`status ${job.status}`}>{job.status}</span></td><td>{job.progress}%</td><td>{job.error_message || job.log_message || '—'}</td><td>{job.status === 'failed' && <button onClick={() => retry(job.id)}>Retry</button>}</td></tr>)}</tbody></table></div>
    </section>

    <section className="panel"><p className="eyebrow">Monitoring</p><h2>Provider health</h2><div className="provider-list">{providers.map(p => <article key={p.id}><span className={`dot ${p.status}`}></span><div><strong>{p.provider_name}</strong><p>{p.message}</p></div><small>{p.response_time_ms ? `${p.response_time_ms} ms` : 'Unavailable'}</small></article>)}</div></section>
    <section className="panel"><p className="eyebrow">Operations</p><h2>Recent system logs</h2><div className="log-list">{logs.map(log => <div key={log.id}><span className={`status ${log.level}`}>{log.level}</span><strong>{log.source}</strong><p>{log.message}</p><time>{new Date(log.created_at).toLocaleString()}</time></div>)}</div></section>
  </div>;
}
