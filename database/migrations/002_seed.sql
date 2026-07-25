INSERT IGNORE INTO categories (id, name, slug) VALUES
(1, 'Nature', 'nature'),
(2, 'Technology', 'technology'),
(3, 'Education', 'education'),
(4, 'Documentary', 'documentary');

INSERT IGNORE INTO content
(id, title, slug, description, release_year, duration_seconds, poster_url, backdrop_url, category_id, playback_source, playback_type, is_active)
VALUES
(1, 'Mountain Horizons', 'mountain-horizons', 'A calm journey through remote mountain landscapes and changing weather.', 2026, 596, 'https://picsum.photos/seed/mountain-poster/600/900', 'https://picsum.photos/seed/mountain-backdrop/1600/900', 1, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE),
(2, 'Hidden Forests', 'hidden-forests', 'Explore dense forests, wildlife corridors, and the systems that keep them alive.', 2025, 742, 'https://picsum.photos/seed/forest-poster/600/900', 'https://picsum.photos/seed/forest-backdrop/1600/900', 1, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE),
(3, 'Ocean Stories', 'ocean-stories', 'A short visual documentary about open water, coastlines, and marine habitats.', 2026, 688, 'https://picsum.photos/seed/ocean-poster/600/900', 'https://picsum.photos/seed/ocean-backdrop/1600/900', 4, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE),
(4, 'Digital Frontiers', 'digital-frontiers', 'An accessible introduction to edge computing, resilient systems, and modern networks.', 2026, 814, 'https://picsum.photos/seed/digital-poster/600/900', 'https://picsum.photos/seed/digital-backdrop/1600/900', 2, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE),
(5, 'Future Earth', 'future-earth', 'Researchers and engineers discuss practical technology for a changing planet.', 2025, 925, 'https://picsum.photos/seed/future-poster/600/900', 'https://picsum.photos/seed/future-backdrop/1600/900', 3, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE),
(6, 'Arctic Kingdom', 'arctic-kingdom', 'A portrait of the Arctic environment across light, ice, and seasonal transitions.', 2024, 779, 'https://picsum.photos/seed/arctic-poster/600/900', 'https://picsum.photos/seed/arctic-backdrop/1600/900', 4, 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', 'hls', TRUE);

INSERT IGNORE INTO subtitles (id, content_id, language_code, label, file_url, format, is_default) VALUES
(1, 1, 'en', 'English', '/subtitles/mountain-horizons-en.vtt', 'vtt', TRUE),
(2, 1, 'ar', 'العربية', '/subtitles/mountain-horizons-ar.vtt', 'vtt', FALSE);

INSERT IGNORE INTO provider_health (id, provider_name, status, response_time_ms, message) VALUES
(1, 'Demo HLS Origin', 'online', 84, 'Manifest and segments are reachable.'),
(2, 'Metadata Fixture Service', 'warning', 310, 'Responding slowly; local fixtures are available.'),
(3, 'Subtitle Import Source', 'offline', NULL, 'External source disabled in demo mode.');

INSERT INTO system_logs (level, source, message) VALUES
('info', 'seed', 'Demo catalog initialized.'),
('info', 'playback', 'Secure playback session service ready.'),
('warning', 'provider-monitor', 'Subtitle Import Source is offline in demo mode.');
