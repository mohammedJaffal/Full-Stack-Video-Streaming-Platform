mod auth;
mod config;
mod error;
mod models;
mod routes;
mod state;

use axum::{http::{HeaderValue, Method}, routing::{get, post, put}, Router};
use config::Config;
use sqlx::mysql::MySqlPoolOptions;
use state::AppState;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::from_default_env()).init();
    let config = Config::from_env();
    let db = MySqlPoolOptions::new().max_connections(10).connect(&config.database_url).await.expect("database connection failed");
    let redis = redis::Client::open(config.redis_url.clone()).expect("invalid REDIS_URL");
    let state = AppState { db, redis, config: config.clone() };

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/api/categories", get(routes::public::categories))
        .route("/api/content", get(routes::public::list_content))
        .route("/api/content/:slug", get(routes::public::details))
        .route("/api/search", get(routes::public::search))
        .route("/api/auth/login", post(routes::auth::login))
        .route("/api/auth/me", get(routes::auth::me))
        .route("/api/auth/logout", post(routes::auth::logout))
        .route("/api/playback/session", post(routes::playback::create))
        .route("/api/playback/session/:id/status", get(routes::playback::status))
        .route("/api/admin/dashboard", get(routes::admin::dashboard))
        .route("/api/admin/content", get(routes::admin::list_content).post(routes::admin::create_content))
        .route("/api/admin/content/:id", put(routes::admin::update_content).delete(routes::admin::delete_content))
        .route("/api/admin/jobs", get(routes::admin::jobs).post(routes::admin::create_job))
        .route("/api/admin/jobs/:id/retry", post(routes::admin::retry_job))
        .route("/api/admin/jobs/:id/logs", get(routes::admin::job_logs))
        .route("/api/admin/providers", get(routes::admin::providers))
        .route("/api/admin/logs", get(routes::admin::logs))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::new().allow_origin(HeaderValue::from_static("*")).allow_methods([Method::GET,Method::POST,Method::PUT,Method::DELETE,Method::OPTIONS]).allow_headers(tower_http::cors::Any))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&config.bind).await.expect("bind failed");
    tracing::info!(address=%config.bind, "API listening");
    axum::serve(listener, app).await.expect("server failed");
}
