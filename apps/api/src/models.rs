use chrono::NaiveDateTime;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow)]
pub struct Category { pub id: u64, pub name: String, pub slug: String }

#[derive(Debug, Serialize, FromRow)]
pub struct Subtitle { pub id: u64, pub content_id: u64, pub language_code: String, pub label: String, pub file_url: String, pub format: String, pub is_default: bool }

#[derive(Debug, Serialize, FromRow)]
pub struct ContentSummary {
    pub id: u64, pub title: String, pub slug: String, pub description: String,
    pub release_year: u16, pub duration_seconds: u32, pub poster_url: String,
    pub backdrop_url: String, pub category_id: u64, pub category_name: String,
    pub playback_type: String, pub is_active: bool, pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize)]
pub struct ContentDetails { #[serde(flatten)] pub content: ContentSummary, pub subtitles: Vec<Subtitle>, pub related: Vec<ContentSummary> }

#[derive(Debug, Deserialize)]
pub struct ContentQuery { pub q: Option<String>, pub category: Option<String>, pub sort: Option<String> }

#[derive(Debug, Deserialize)]
pub struct LoginRequest { pub email: String, pub password: String }
#[derive(Debug, Serialize)]
pub struct LoginResponse { pub token: String, pub user: DemoUser }
#[derive(Debug, Serialize, Clone)]
pub struct DemoUser { pub id: String, pub name: String, pub email: String, pub role: String }

#[derive(Debug, Deserialize)]
pub struct PlaybackRequest { pub content_id: u64 }
#[derive(Debug, Serialize)]
pub struct PlaybackResponse { pub session_id: String, pub manifest_url: String, pub expires_at: String, pub subtitles: Vec<Subtitle> }

#[derive(Debug, Deserialize)]
pub struct AdminContentInput {
    pub title: String, pub slug: String, pub description: String, pub release_year: u16,
    pub duration_seconds: u32, pub poster_url: String, pub backdrop_url: String,
    pub category_id: u64, pub playback_source: String, pub playback_type: String,
    pub is_active: bool,
}

#[derive(Debug, Deserialize)]
pub struct JobInput { pub job_type: String, pub content_id: Option<u64>, pub payload: serde_json::Value }

#[derive(Debug, Serialize, FromRow)]
pub struct Job {
    pub id: String, pub job_type: String, pub content_id: Option<u64>, pub payload: serde_json::Value,
    pub status: String, pub progress: u8, pub error_message: Option<String>, pub log_message: Option<String>,
    pub started_at: Option<NaiveDateTime>, pub completed_at: Option<NaiveDateTime>, pub created_at: NaiveDateTime,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ProviderHealth { pub id: u64, pub provider_name: String, pub status: String, pub response_time_ms: Option<u32>, pub last_checked_at: NaiveDateTime, pub message: String }
#[derive(Debug, Serialize, FromRow)]
pub struct SystemLog { pub id: u64, pub level: String, pub source: String, pub message: String, pub created_at: NaiveDateTime }
