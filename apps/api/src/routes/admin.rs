use axum::{extract::{Path, State}, http::StatusCode, Json};
use redis::AsyncCommands;
use serde_json::{json, Value};
use uuid::Uuid;
use crate::{auth::AuthClaims, error::AppError, models::{AdminContentInput, AdminContentItem, Job, JobInput, ProviderHealth, SystemLog}, state::AppState};

const ADMIN_CONTENT_SELECT: &str = r#"SELECT c.id, c.title, c.slug, c.description, c.release_year, c.duration_seconds,
c.poster_url, c.backdrop_url, c.category_id, cat.name AS category_name, c.playback_source,
c.playback_type, c.is_active, c.created_at FROM content c JOIN categories cat ON cat.id = c.category_id"#;

pub async fn dashboard(_: AuthClaims, State(state): State<AppState>) -> Result<Json<Value>, AppError> {
    let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM content").fetch_one(&state.db).await?;
    let (queued,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM ingestion_jobs WHERE status IN ('queued','processing')").fetch_one(&state.db).await?;
    let (completed,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM ingestion_jobs WHERE status = 'completed'").fetch_one(&state.db).await?;
    let (failed,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM ingestion_jobs WHERE status = 'failed'").fetch_one(&state.db).await?;
    Ok(Json(json!({"total_content": total, "active_jobs": queued, "completed_jobs": completed, "failed_jobs": failed})))
}

pub async fn list_content(_: AuthClaims, State(state): State<AppState>) -> Result<Json<Vec<AdminContentItem>>, AppError> {
    Ok(Json(sqlx::query_as::<_, AdminContentItem>(&format!("{ADMIN_CONTENT_SELECT} ORDER BY c.created_at DESC")).fetch_all(&state.db).await?))
}

pub async fn create_content(_: AuthClaims, State(state): State<AppState>, Json(i): Json<AdminContentInput>) -> Result<(StatusCode, Json<Value>), AppError> {
    let r = sqlx::query("INSERT INTO content (title,slug,description,release_year,duration_seconds,poster_url,backdrop_url,category_id,playback_source,playback_type,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(i.title).bind(i.slug).bind(i.description).bind(i.release_year).bind(i.duration_seconds).bind(i.poster_url).bind(i.backdrop_url).bind(i.category_id).bind(i.playback_source).bind(i.playback_type).bind(i.is_active)
        .execute(&state.db).await?;
    log(&state, "info", "admin", "Content item created.").await?;
    Ok((StatusCode::CREATED, Json(json!({"id": r.last_insert_id()}))))
}

pub async fn update_content(_: AuthClaims, State(state): State<AppState>, Path(id): Path<u64>, Json(i): Json<AdminContentInput>) -> Result<Json<Value>, AppError> {
    let r = sqlx::query("UPDATE content SET title=?,slug=?,description=?,release_year=?,duration_seconds=?,poster_url=?,backdrop_url=?,category_id=?,playback_source=?,playback_type=?,is_active=? WHERE id=?")
        .bind(i.title).bind(i.slug).bind(i.description).bind(i.release_year).bind(i.duration_seconds).bind(i.poster_url).bind(i.backdrop_url).bind(i.category_id).bind(i.playback_source).bind(i.playback_type).bind(i.is_active).bind(id)
        .execute(&state.db).await?;
    if r.rows_affected() == 0 { return Err(AppError(StatusCode::NOT_FOUND, "content not found".into())); }
    log(&state, "info", "admin", "Content item updated.").await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn delete_content(_: AuthClaims, State(state): State<AppState>, Path(id): Path<u64>) -> Result<Json<Value>, AppError> {
    sqlx::query("DELETE FROM content WHERE id = ?").bind(id).execute(&state.db).await?;
    log(&state, "warning", "admin", "Content item deleted.").await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn jobs(_: AuthClaims, State(state): State<AppState>) -> Result<Json<Vec<Job>>, AppError> {
    Ok(Json(sqlx::query_as::<_, Job>("SELECT id,job_type,content_id,payload,status,progress,error_message,log_message,started_at,completed_at,created_at FROM ingestion_jobs ORDER BY created_at DESC LIMIT 100").fetch_all(&state.db).await?))
}

pub async fn create_job(_: AuthClaims, State(state): State<AppState>, Json(i): Json<JobInput>) -> Result<(StatusCode, Json<Value>), AppError> {
    if !matches!(i.job_type.as_str(), "metadata_enrichment" | "subtitle_import" | "duplicate_detection") { return Err(AppError(StatusCode::BAD_REQUEST, "unsupported job type".into())); }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO ingestion_jobs (id,job_type,content_id,payload,status,progress,log_message) VALUES (?,?,?,?, 'queued',0,'Waiting for worker')")
        .bind(&id).bind(&i.job_type).bind(i.content_id).bind(i.payload).execute(&state.db).await?;
    let mut conn = state.redis.get_multiplexed_async_connection().await?;
    let _: usize = conn.lpush("ingestion:queue", &id).await?;
    log(&state, "info", "jobs", &format!("Queued {} job {}", i.job_type, id)).await?;
    Ok((StatusCode::CREATED, Json(json!({"id": id, "status": "queued"}))))
}

pub async fn retry_job(_: AuthClaims, State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Value>, AppError> {
    let r = sqlx::query("UPDATE ingestion_jobs SET status='queued',progress=0,error_message=NULL,log_message='Queued for retry',started_at=NULL,completed_at=NULL WHERE id=? AND status='failed'").bind(&id).execute(&state.db).await?;
    if r.rows_affected() == 0 { return Err(AppError(StatusCode::CONFLICT, "only failed jobs can be retried".into())); }
    let mut conn = state.redis.get_multiplexed_async_connection().await?;
    let _: usize = conn.lpush("ingestion:queue", &id).await?;
    Ok(Json(json!({"ok": true})))
}

pub async fn job_logs(_: AuthClaims, State(state): State<AppState>, Path(id): Path<String>) -> Result<Json<Value>, AppError> {
    let row: Option<(String, Option<String>, Option<String>)> = sqlx::query_as("SELECT status,log_message,error_message FROM ingestion_jobs WHERE id=?").bind(id).fetch_optional(&state.db).await?;
    let (status, log_message, error_message) = row.ok_or_else(|| AppError(StatusCode::NOT_FOUND, "job not found".into()))?;
    Ok(Json(json!({"status":status,"log":log_message,"error":error_message})))
}

pub async fn providers(_: AuthClaims, State(state): State<AppState>) -> Result<Json<Vec<ProviderHealth>>, AppError> {
    Ok(Json(sqlx::query_as::<_, ProviderHealth>("SELECT id,provider_name,status,response_time_ms,last_checked_at,message FROM provider_health ORDER BY id").fetch_all(&state.db).await?))
}

pub async fn logs(_: AuthClaims, State(state): State<AppState>) -> Result<Json<Vec<SystemLog>>, AppError> {
    Ok(Json(sqlx::query_as::<_, SystemLog>("SELECT id,level,source,message,created_at FROM system_logs ORDER BY created_at DESC LIMIT 100").fetch_all(&state.db).await?))
}

async fn log(state: &AppState, level: &str, source: &str, message: &str) -> Result<(), AppError> {
    sqlx::query("INSERT INTO system_logs (level,source,message) VALUES (?,?,?)").bind(level).bind(source).bind(message).execute(&state.db).await?;
    Ok(())
}
