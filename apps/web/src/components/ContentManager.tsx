import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api, authHeaders } from '../lib/api';

type ContentForm = {
  title: string;
  slug: string;
  description: string;
  release_year: number;
  duration_seconds: number;
  poster_url: string;
  backdrop_url: string;
  category_id: number;
  playback_source: string;
  playback_type: 'hls';
  is_active: boolean;
};

type Item = ContentForm & {
  id: number;
  category_name: string;
};

const blank: ContentForm = {
  title: '',
  slug: '',
  description: '',
  release_year: 2026,
  duration_seconds: 600,
  poster_url: '/media/posters/mountain-horizons.svg',
  backdrop_url: '/media/backdrops/mountain-horizons.svg',
  category_id: 1,
  playback_source: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  playback_type: 'hls',
  is_active: true,
};

export default function ContentManager() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<ContentForm>(blank);
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const load = () =>
    api<Item[]>('/api/admin/content', { headers: authHeaders() })
      .then(setItems)
      .catch(() => {
        location.href = '/admin/login';
      });

  useEffect(() => {
    void load();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const path = editing ? `/api/admin/content/${editing}` : '/api/admin/content';
    await api(path, {
      method: editing ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ...form, playback_type: 'hls' }),
    });
    setMessage(editing ? 'Content updated.' : 'Content created.');
    setEditing(null);
    setForm(blank);
    await load();
  };

  const edit = (item: Item) => {
    setEditing(item.id);
    const { id: _id, category_name: _categoryName, ...editable } = item;
    setForm({ ...editable, playback_type: 'hls' });
    scrollTo({ top: 0, behavior: 'smooth' });
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this content item?')) return;
    await api(`/api/admin/content/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    await load();
  };

  return (
    <div className="admin-grid">
      <form className="panel content-form" onSubmit={submit}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog editor</p>
            <h2>{editing ? 'Edit content' : 'Add content'}</h2>
          </div>
          {editing && (
            <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(blank); }}>
              Cancel
            </button>
          )}
        </div>
        {message && <p className="success">{message}</p>}

        <fieldset className="form-section editorial-section">
          <legend>Editorial metadata</legend>
          <p className="form-section-note">The viewer-facing information used across Browse, detail pages, and search.</p>
          <div className="form-grid">
            <label>Title<input value={form.title} required onChange={(event) => setForm({ ...form, title: event.target.value, slug: event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') })} /></label>
            <label>Slug<input value={form.slug} required onChange={(event) => setForm({ ...form, slug: event.target.value })} /></label>
            <label className="wide">Description<textarea value={form.description} required onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label>Category<select value={form.category_id} onChange={(event) => setForm({ ...form, category_id: Number(event.target.value) })}><option value="1">Nature</option><option value="2">Technology</option><option value="3">Education</option><option value="4">Documentary</option></select></label>
            <label>Year<input type="number" value={form.release_year} onChange={(event) => setForm({ ...form, release_year: Number(event.target.value) })} /></label>
            <label>Duration seconds<input type="number" value={form.duration_seconds} onChange={(event) => setForm({ ...form, duration_seconds: Number(event.target.value) })} /></label>
            <label>Active<select value={String(form.is_active)} onChange={(event) => setForm({ ...form, is_active: event.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          </div>
        </fieldset>

        <fieldset className="form-section technical-section">
          <legend>Playback configuration</legend>
          <p className="form-section-note">Technical delivery settings for artwork and the HLS stream source.</p>
          <div className="form-grid">
            <label>Playback type<select value="hls" disabled><option value="hls">HLS</option></select></label>
            <label>Poster URL<input value={form.poster_url} onChange={(event) => setForm({ ...form, poster_url: event.target.value })} /></label>
            <label>Backdrop URL<input value={form.backdrop_url} onChange={(event) => setForm({ ...form, backdrop_url: event.target.value })} /></label>
            <label className="wide">HLS manifest URL<input value={form.playback_source} onChange={(event) => setForm({ ...form, playback_source: event.target.value })} /></label>
          </div>
        </fieldset>

        <button type="submit">{editing ? 'Save changes' : 'Create content'}</button>
      </form>

      <section className="panel">
        <p className="eyebrow">Catalog</p><h2>All content</h2>
        <div className="table-wrap"><table><thead><tr><th>Title</th><th>Category</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead><tbody>
          {items.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><br/><small>{item.slug}</small></td><td>{item.category_name}</td><td>HLS</td><td><span className={`status ${item.is_active ? 'completed' : 'failed'}`}>{item.is_active ? 'active' : 'disabled'}</span></td><td><div className="table-actions"><button className="ghost" onClick={() => edit(item)}>Edit</button><button className="delete-action" onClick={() => void remove(item.id)}>Delete</button></div></td></tr>)}
        </tbody></table></div>
      </section>
    </div>
  );
}
