import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { MediaPlayer, MediaProvider, Poster, Track } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Subtitle = {
  id: number;
  label: string;
  language_code: string;
  file_url: string;
  format: string;
  is_default: boolean;
};

type Playback = {
  manifest_url: string;
  expires_at: string;
  subtitles: Subtitle[];
};

type VideoPlayerProps = {
  contentId: number;
  poster: string;
  title: string;
};

export default function VideoPlayer({ contentId, poster, title }: VideoPlayerProps) {
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');
    setPlayback(null);

    api<Playback>('/api/playback/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_id: contentId }),
    })
      .then(data => {
        if (!cancelled) setPlayback(data);
      })
      .catch(() => {
        if (!cancelled) setError('This stream is temporarily unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [contentId]);

  if (loading) {
    return (
      <section className="player-state player-loading-state" aria-live="polite">
        <span className="player-spinner" aria-hidden="true" />
        <p>Creating a secure playback session…</p>
      </section>
    );
  }

  if (error || !playback) {
    return (
      <section className="player-state player-error-state" style={{ backgroundImage: `url(${poster})` }}>
        <div className="player-error-copy">
          <p className="eyebrow">Playback unavailable</p>
          <h2>We could not start this stream.</h2>
          <p>{error || 'The playback session could not be created.'} Try again in a moment or return to the catalog.</p>
          <div className="actions">
            <button type="button" onClick={() => location.reload()}>Try again</button>
            <a className="button ghost" href="/explore">Return to catalog</a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="player-shell vidstack-shell">
      <MediaPlayer
        className="streamforge-player"
        title={title}
        src={{ src: playback.manifest_url, type: 'application/x-mpegurl' }}
        playsInline
        crossOrigin
        aspectRatio="16/9"
        controlsDelay={3500}
        hideControlsOnMouseLeave={false}
        onError={() => setError('This stream is temporarily unavailable.')}
      >
        <MediaProvider>
          <Poster className="vds-poster" src={poster} alt={`${title} poster`} />
          {playback.subtitles.map(track => (
            <Track
              key={track.id}
              src={track.file_url}
              kind="subtitles"
              label={track.label}
              lang={track.language_code}
              type={track.format || 'vtt'}
              default={track.is_default}
            />
          ))}
        </MediaProvider>

        <div className="protected-stream-badge" aria-label="Signed protected playback session">
          <span aria-hidden="true">⌁</span>
          Protected stream
        </div>

        <DefaultVideoLayout colorScheme="dark" icons={defaultLayoutIcons} />
      </MediaPlayer>
    </section>
  );
}
