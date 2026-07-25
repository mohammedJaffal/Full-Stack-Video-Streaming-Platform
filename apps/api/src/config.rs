use std::env;

#[derive(Clone)]
pub struct Config {
    pub bind: String,
    pub database_url: String,
    pub redis_url: String,
    pub jwt_secret: String,
    pub playback_secret: String,
    pub playback_ttl_seconds: i64,
    pub media_relay_base_url: String,
    pub admin_email: String,
    pub admin_password: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            bind: env::var("API_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into()),
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL is required"),
            redis_url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
            jwt_secret: env::var("JWT_SECRET").expect("JWT_SECRET is required"),
            playback_secret: env::var("PLAYBACK_SIGNING_SECRET").expect("PLAYBACK_SIGNING_SECRET is required"),
            playback_ttl_seconds: env::var("PLAYBACK_TOKEN_TTL_SECONDS").ok().and_then(|v| v.parse().ok()).unwrap_or(300),
            media_relay_base_url: env::var("MEDIA_RELAY_BASE_URL").unwrap_or_else(|_| "http://localhost:8787".into()),
            admin_email: env::var("ADMIN_EMAIL").expect("ADMIN_EMAIL is required"),
            admin_password: env::var("ADMIN_PASSWORD").expect("ADMIN_PASSWORD is required"),
        }
    }
}
