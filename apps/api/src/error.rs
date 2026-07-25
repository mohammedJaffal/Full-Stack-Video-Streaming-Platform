use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde_json::json;

pub struct AppError(pub StatusCode, pub String);

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!(?error, "database error");
        Self(StatusCode::INTERNAL_SERVER_ERROR, "database operation failed".into())
    }
}

impl From<redis::RedisError> for AppError {
    fn from(error: redis::RedisError) -> Self {
        tracing::error!(?error, "redis error");
        Self(StatusCode::SERVICE_UNAVAILABLE, "job queue unavailable".into())
    }
}
