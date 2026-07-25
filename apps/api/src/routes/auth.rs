use axum::{extract::State, http::StatusCode, Json};
use serde_json::{json, Value};
use crate::{auth::{issue_admin_token, AuthClaims}, error::AppError, models::{DemoUser, LoginRequest, LoginResponse}, state::AppState};

pub async fn login(State(state): State<AppState>, Json(body): Json<LoginRequest>) -> Result<Json<LoginResponse>, AppError> {
    if body.email != state.config.admin_email || body.password != state.config.admin_password {
        return Err(AppError(StatusCode::UNAUTHORIZED, "invalid credentials".into()));
    }
    let user = DemoUser { id: "demo-admin".into(), name: "Demo Administrator".into(), email: body.email, role: "admin".into() };
    Ok(Json(LoginResponse { token: issue_admin_token(&state)?, user }))
}

pub async fn me(claims: AuthClaims) -> Json<DemoUser> {
    Json(DemoUser { id: claims.sub, name: "Demo Administrator".into(), email: claims.email, role: claims.role })
}

pub async fn logout(_: AuthClaims) -> Json<Value> { Json(json!({"ok": true})) }
