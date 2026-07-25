use axum::{extract::{Path, Query, State}, http::StatusCode, routing::{get, post}, Json, Router};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use redis::AsyncCommands;
use serde::{Deserialize, Serialize};
use sqlx::{mysql::MySqlPoolOptions, FromRow, MySqlPool};
use std::{collections::HashMap, env, sync::Arc};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[derive(Clone)]
struct AppState { db: MySqlPool, redis: redis::Client, jwt_secret: String, relay_url: String, token_ttl: i64 }

#[derive(Serialize, FromRow)]
struct Content { id: u64, title: String, slug: String, description: String, release_year: Option<u16>, duration_seconds: u32, poster_url: Option<String>, backdrop_url: Option<String>, category: Option<String>, is_active: bool }

#[derive(Serialize)]
struct ApiError { error: String }
type ApiResult<T> = Result<Json<T>, (StatusCode, Json<ApiError>)>;
fn internal(message: impl ToString) -> (StatusCode, Json<ApiError>) { (StatusCode::INTERNAL_SERVER_ERROR, Json(ApiError { error: message.to_string() })) }

#[derive(Deserialize)]
struct PlaybackRequest { content_id: u64 }
#[derive(Serialize, Deserialize)]
struct PlaybackClaims { sub: String, content_id: u64, source: String, exp: usize }
#[derive(Serialize)]
struct PlaybackResponse { manifest_url: String, expires_at: String }

#[derive(Deserialize)]
struct JobRequest { job_type: String, content_id: Option<u64> }
#[derive(Serialize, FromRow)]
struct Job { id: u64, job_type: String, content_id: Option<u64>, status: String, progress: u8, error_message: Option<String>, created_at: chrono::NaiveDateTime }

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::from_default_env()).init();
    let db = MySqlPoolOptions::new().max_connections(10).connect(&env::var("DATABASE_URL")?).await?;
    let state = Arc::new(AppState {
        db,
        redis: redis::Client::open(env::var("REDIS_URL")?)?,
        jwt_secret: env::var("MEDIA_SIGNING_SECRET").unwrap_or_else(|_| "development-media-secret".into()),
        relay_url: env::var("MEDIA_RELAY_URL").unwrap_or_else(|_| "http://localhost:8787".into()),
        token_ttl: env::var("PLAYBACK_TOKEN_TTL_SECONDS").ok().and_then(|v| v.parse().ok()).unwrap_or(300),
    });
    let app = Router::new()
        .route("/health", get(|| async { Json(serde_json::json!({"status":"ok"})) }))
        .route("/api/content", get(list_content))
        .route("/api/content/:slug", get(content_detail))
        .route("/api/categories", get(categories))
        .route("/api/search", get(search_content))
        .route("/api/playback/session", post(create_playback_session))
        .route("/api/admin/dashboard", get(dashboard))
        .route("/api/admin/jobs", get(list_jobs).post(create_job))
        .route("/api/admin/providers", get(providers))
        .route("/api/admin/logs", get(logs))
        .layer(CorsLayer::permissive()).layer(TraceLayer::new_for_http()).with_state(state);
    let port = env::var("API_PORT").unwrap_or_else(|_| "8080".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

async fn list_content(State(s): State<Arc<AppState>>) -> ApiResult<Vec<Content>> {
    let rows = sqlx::query_as::<_, Content>("SELECT c.id,c.title,c.slug,c.description,c.release_year,c.duration_seconds,c.poster_url,c.backdrop_url,cat.name category,c.is_active FROM content c LEFT JOIN categories cat ON cat.id=c.category_id WHERE c.is_active=1 ORDER BY c.created_at DESC")
        .fetch_all(&s.db).await.map_err(internal)?;
    Ok(Json(rows))
}
async fn content_detail(State(s): State<Arc<AppState>>, Path(slug): Path<String>) -> ApiResult<Content> {
    let row = sqlx::query_as::<_, Content>("SELECT c.id,c.title,c.slug,c.description,c.release_year,c.duration_seconds,c.poster_url,c.backdrop_url,cat.name category,c.is_active FROM content c LEFT JOIN categories cat ON cat.id=c.category_id WHERE c.slug=? AND c.is_active=1")
        .bind(slug).fetch_optional(&s.db).await.map_err(internal)?;
    row.map(Json).ok_or((StatusCode::NOT_FOUND, Json(ApiError { error: "content not found".into() })))
}
async fn categories(State(s): State<Arc<AppState>>) -> ApiResult<Vec<HashMap<String, serde_json::Value>>> {
    let rows = sqlx::query!("SELECT id,name,slug FROM categories ORDER BY name").fetch_all(&s.db).await.map_err(internal)?;
    Ok(Json(rows.into_iter().map(|r| HashMap::from([("id".into(), r.id.into()),("name".into(),r.name.into()),("slug".into(),r.slug.into())])).collect()))
}
async fn search_content(State(s): State<Arc<AppState>>, Query(q): Query<HashMap<String,String>>) -> ApiResult<Vec<Content>> {
    let term = format!("%{}%", q.get("q").cloned().unwrap_or_default());
    let rows = sqlx::query_as::<_, Content>("SELECT c.id,c.title,c.slug,c.description,c.release_year,c.duration_seconds,c.poster_url,c.backdrop_url,cat.name category,c.is_active FROM content c LEFT JOIN categories cat ON cat.id=c.category_id WHERE c.is_active=1 AND c.title LIKE ? ORDER BY c.created_at DESC")
        .bind(term).fetch_all(&s.db).await.map_err(internal)?;
    Ok(Json(rows))
}
async fn create_playback_session(State(s): State<Arc<AppState>>, Json(req): Json<PlaybackRequest>) -> ApiResult<PlaybackResponse> {
    let source: Option<String> = sqlx::query_scalar("SELECT playback_source FROM content WHERE id=? AND is_active=1").bind(req.content_id).fetch_optional(&s.db).await.map_err(internal)?;
    let source = source.ok_or((StatusCode::NOT_FOUND, Json(ApiError { error: "content not found or disabled".into() })))?;
    let expires = Utc::now() + Duration::seconds(s.token_ttl);
    let claims = PlaybackClaims { sub: "demo-session".into(), content_id: req.content_id, source, exp: expires.timestamp() as usize };
    let token = encode(&Header::default(), &claims, &EncodingKey::from_secret(s.jwt_secret.as_bytes())).map_err(internal)?;
    Ok(Json(PlaybackResponse { manifest_url: format!("{}/manifest?token={}", s.relay_url.trim_end_matches('/'), token), expires_at: expires.to_rfc3339() }))
}
async fn create_job(State(s): State<Arc<AppState>>, Json(req): Json<JobRequest>) -> ApiResult<serde_json::Value> {
    if !["metadata_enrichment","subtitle_import","duplicate_detection"].contains(&req.job_type.as_str()) { return Err((StatusCode::BAD_REQUEST, Json(ApiError { error: "unsupported job type".into() }))); }
    let result = sqlx::query("INSERT INTO ingestion_jobs(job_type,content_id,status,progress) VALUES(?,?,'queued',0)").bind(&req.job_type).bind(req.content_id).execute(&s.db).await.map_err(internal)?;
    let id = result.last_insert_id();
    let mut conn = s.redis.get_multiplexed_async_connection().await.map_err(internal)?;
    let _: () = conn.rpush("streaming:jobs", id).await.map_err(internal)?;
    Ok(Json(serde_json::json!({"id":id,"status":"queued"})))
}
async fn list_jobs(State(s): State<Arc<AppState>>) -> ApiResult<Vec<Job>> { Ok(Json(sqlx::query_as::<_,Job>("SELECT id,job_type,content_id,status,progress,error_message,created_at FROM ingestion_jobs ORDER BY created_at DESC LIMIT 50").fetch_all(&s.db).await.map_err(internal)?)) }
async fn dashboard(State(s): State<Arc<AppState>>) -> ApiResult<serde_json::Value> {
    let content: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM content").fetch_one(&s.db).await.map_err(internal)?;
    let queued: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ingestion_jobs WHERE status IN ('queued','processing')").fetch_one(&s.db).await.map_err(internal)?;
    let completed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ingestion_jobs WHERE status='completed'").fetch_one(&s.db).await.map_err(internal)?;
    let failed: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ingestion_jobs WHERE status='failed'").fetch_one(&s.db).await.map_err(internal)?;
    Ok(Json(serde_json::json!({"content":content,"active_jobs":queued,"completed_jobs":completed,"failed_jobs":failed})))
}
async fn providers(State(s): State<Arc<AppState>>) -> ApiResult<serde_json::Value> { let rows = sqlx::query!("SELECT provider_name,status,response_time_ms,last_checked_at,message FROM provider_health ORDER BY id").fetch_all(&s.db).await.map_err(internal)?; Ok(Json(serde_json::to_value(rows).map_err(internal)?)) }
async fn logs(State(s): State<Arc<AppState>>) -> ApiResult<serde_json::Value> { let rows = sqlx::query!("SELECT level,source,message,created_at FROM system_logs ORDER BY created_at DESC LIMIT 50").fetch_all(&s.db).await.map_err(internal)?; Ok(Json(serde_json::to_value(rows).map_err(internal)?)) }
