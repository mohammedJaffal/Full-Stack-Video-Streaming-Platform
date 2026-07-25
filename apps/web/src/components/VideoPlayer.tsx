import Hls from 'hls.js';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

type Subtitle = { id: number; label: string; language_code: string; file_url: string; is_default: boolean };
type Playback = { manifest_url: string; expires_at: string; subtitles: Subtitle[] };

export default function VideoPlayer({ contentId, poster }: { contentId: number; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [levels, setLevels] = useState<{ index: number; label: string }[]>([]);
  const [quality, setQuality] = useState(-1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api<Playback>('/api/playback/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content_id: contentId })
    }).then(data => { if (!cancelled) setPlayback(data); }).catch(e => setError(e.message)).finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [contentId]);

  useEffect(() => {
    if (!playback || !videoRef.current) return;
    const video = videoRef.current;
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(playback.manifest_url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        setLevels(data.levels.map((level, index) => ({ index, label: level.height ? `${level.height}p` : `Level ${index + 1}` })));
      });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(`Playback error: ${data.details}`); });
      return () => hls.destroy();
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = playback.manifest_url;
    else setError('This browser does not support HLS playback.');
  }, [playback]);

  const changeQuality = (value: number) => {
    setQuality(value);
    if (hlsRef.current) hlsRef.current.currentLevel = value;
  };

  if (loading) return <div className="player-state">Creating a secure playback session…</div>;
  if (error) return <div className="player-state error">{error}</div>;

  return <section className="player-shell">
    <video ref={videoRef} controls poster={poster} crossOrigin="anonymous">
      {playback?.subtitles.map(track => <track key={track.id} kind="subtitles" src={track.file_url} srcLang={track.language_code} label={track.label} default={track.is_default} />)}
    </video>
    <div className="player-toolbar">
      <label>Quality
        <select value={quality} onChange={e => changeQuality(Number(e.target.value))}>
          <option value={-1}>Auto</option>
          {levels.map(level => <option key={level.index} value={level.index}>{level.label}</option>)}
        </select>
      </label>
      <label>Speed
        <select defaultValue="1" onChange={e => { if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value); }}>
          <option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
        </select>
      </label>
      <span className="secure-badge">Protected session · expires {playback ? new Date(playback.expires_at).toLocaleTimeString() : ''}</span>
    </div>
  </section>;
}
