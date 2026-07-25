use axum::{extract::{Path, State}, http::StatusCode, Json};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use crate::{auth::PlaybackClaims, error::AppError, models::{PlaybackRequest, PlaybackResponse, Subtitle}, state::AppState};

pub async fn create(State(state): State<AppState>, Json(body): Json<PlaybackRequest>) -> Result<Json<PlaybackResponse>, AppError> {
    let row: Option<(String, bool)> = sqlx::query_as("SELECT playback_source, is_active FROM content WHERE id = ? LIMIT 1")
        .bind(body.content_id).fetch_optional(&state.db).await?;
    let (source, active) = row.ok_or_else(|| AppError(StatusCode::NOT_FOUND, "content not found".into()))?;
    if !active { return Err(AppError(StatusCode::FORBIDDEN, "content is inactive".into())); }

    let now = Utc::now();
    let expires = now + Duration::seconds(state.config.playback_ttl_seconds);
    let session_id = Uuid::new_v4().to_string();
    let claims = PlaybackClaims { sub: session_id.clone(), source, exp: expires.timestamp() as usize };
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(state.config.playback_secret.as_bytes()))
        .map_err(|_| AppError(StatusCode::INTERNAL_SERVER_ERROR, "could not create playback token".into()))?;
    let token_hash = hex::encode(Sha256::digest(token.as_bytes()));
    sqlx::query("INSERT INTO playback_sessions (id, content_id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&session_id).bind(body.content_id).bind("demo-user").bind(token_hash).bind(expires.naive_utc()).execute(&state.db).await?;
    let subtitles = sqlx::query_as::<_, Subtitle>("SELECT id, content_id, language_code, label, file_url, format, is_default FROM subtitles WHERE content_id = ? ORDER BY is_default DESC, label")
        .bind(body.content_id).fetch_all(&state.db).await?;
    Ok(Json(PlaybackResponse {
        session_id,
        manifest_url: format!("{}/manifest?token={}", state.config.media_relay_base_url.trim_end_matches('/'), token),
        expires_at: expires.to_rfc3339(),
        subtitles,
    }))
}

pub async fn status(State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Value>, AppError> {
    let row: Option<(chrono::NaiveDateTime,)> = sqlx::query_as("SELECT expires_at FROM playback_sessions WHERE id = ? LIMIT 1").bind(&id).fetch_optional(&state.db).await?;
    let (expires_at,) = row.ok_or_else(|| AppError(StatusCode::NOT_FOUND, "session not found".into()))?;
    let valid = expires_at > Utc::now().naive_utc();
    Ok(Json(json!({ "id": id, "valid": valid, "expires_at": expires_at })))
}
