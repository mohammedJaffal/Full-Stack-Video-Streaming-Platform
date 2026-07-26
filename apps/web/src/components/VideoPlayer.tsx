import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

import { MediaPlayer, MediaProvider, Poster, Track } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import { useEffect, useRef, useState } from 'react';
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

type CaptionFormat = 'vtt' | 'srt' | 'ssa' | 'ass' | 'json';

type VideoPlayerProps = {
  contentId: number;
  poster: string;
  title: string;
};

export default function VideoPlayer({ contentId, poster, title }: VideoPlayerProps) {
  const playerShellRef = useRef<HTMLElement | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const captionFormat = (format: string): CaptionFormat => {
    const normalized = format.toLowerCase();
    return ['vtt', 'srt', 'ssa', 'ass', 'json'].includes(normalized)
      ? normalized as CaptionFormat
      : 'vtt';
  };

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

  useEffect(() => {
    const playerShell = playerShellRef.current;
    if (!playerShell || !playback) return;

    let animationFrame = 0;

    const centerSelectedQuality = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        const qualityPanel = Array.from(
          playerShell.querySelectorAll<HTMLElement>('.vds-menu-items[data-submenu]'),
        ).find(panel => panel.offsetParent !== null && /quality/i.test(panel.textContent || ''));

        if (!qualityPanel) return;

        const selectedItem = qualityPanel.querySelector<HTMLElement>(
          '[role="menuitemradio"][aria-checked="true"], [role="radio"][aria-checked="true"], [data-checked]',
        );
        const scrollContainer = qualityPanel.closest<HTMLElement>('.vds-menu-items[data-root]') || qualityPanel;

        if (!selectedItem || scrollContainer.scrollHeight <= scrollContainer.clientHeight) return;

        const containerRect = scrollContainer.getBoundingClientRect();
        const selectedRect = selectedItem.getBoundingClientRect();
        const centeredTop =
          scrollContainer.scrollTop +
          selectedRect.top -
          containerRect.top -
          (scrollContainer.clientHeight - selectedRect.height) / 2;

        scrollContainer.scrollTop = Math.max(0, centeredTop);
      });
    };

    const observer = new MutationObserver(centerSelectedQuality);
    observer.observe(playerShell, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-checked', 'data-checked', 'data-open', 'hidden', 'style'],
    });
    playerShell.addEventListener('click', centerSelectedQuality);

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      playerShell.removeEventListener('click', centerSelectedQuality);
    };
  }, [playback]);

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
    <section ref={playerShellRef} className="player-shell vidstack-shell">
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
              key={String(track.id)}
              src={track.file_url}
              kind="subtitles"
              label={track.label}
              lang={track.language_code}
              type={captionFormat(track.format)}
              default={track.is_default}
            />
          ))}
        </MediaProvider>

        <div className="protected-stream-badge" aria-label="Signed protected playback session">
          <span aria-hidden="true">⌁</span>
          Protected stream
        </div>

        <DefaultVideoLayout
          colorScheme="dark"
          icons={defaultLayoutIcons}
          noAudioGain
        />
      </MediaPlayer>
    </section>
  );
}
