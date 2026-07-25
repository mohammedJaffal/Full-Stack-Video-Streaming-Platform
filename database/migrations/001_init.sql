CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS content (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  release_year SMALLINT UNSIGNED NOT NULL,
  duration_seconds INT UNSIGNED NOT NULL,
  poster_url VARCHAR(500) NOT NULL,
  backdrop_url VARCHAR(500) NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  playback_source VARCHAR(1000) NOT NULL,
  playback_type ENUM('hls','mp4') NOT NULL DEFAULT 'hls',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_content_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS subtitles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  content_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(12) NOT NULL,
  label VARCHAR(80) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  format ENUM('vtt','srt') NOT NULL DEFAULT 'vtt',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_subtitle_content FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS playback_sessions (
  id CHAR(36) PRIMARY KEY,
  content_id BIGINT UNSIGNED NOT NULL,
  user_id VARCHAR(100) NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_playback_content FOREIGN KEY (content_id) REFERENCES content(id) ON DELETE CASCADE,
  INDEX idx_playback_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id CHAR(36) PRIMARY KEY,
  job_type ENUM('metadata_enrichment','subtitle_import','duplicate_detection') NOT NULL,
  content_id BIGINT UNSIGNED NULL,
  payload JSON NOT NULL,
  status ENUM('queued','processing','completed','failed') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  log_message TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_status_created (status, created_at)
);

CREATE TABLE IF NOT EXISTS provider_health (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_name VARCHAR(120) NOT NULL UNIQUE,
  status ENUM('online','warning','offline') NOT NULL,
  response_time_ms INT UNSIGNED NULL,
  last_checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  message VARCHAR(500) NOT NULL
);

CREATE TABLE IF NOT EXISTS system_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  level ENUM('info','warning','error') NOT NULL,
  source VARCHAR(120) NOT NULL,
  message VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_created (created_at)
);
