use axum::{extract::FromRequestParts, http::{request::Parts, HeaderMap, StatusCode}};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, state::AppState};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuthClaims { pub sub: String, pub email: String, pub role: String, pub exp: usize }

pub fn issue_admin_token(state: &AppState) -> Result<String, AppError> {
    let claims = AuthClaims {
        sub: "demo-admin".into(), email: state.config.admin_email.clone(), role: "admin".into(),
        exp: (Utc::now() + Duration::hours(8)).timestamp() as usize,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()))
        .map_err(|_| AppError(StatusCode::INTERNAL_SERVER_ERROR, "could not issue token".into()))
}

fn bearer_token(headers: &HeaderMap) -> Result<&str, AppError> {
    let header = headers.get("authorization").and_then(|v| v.to_str().ok()).ok_or_else(|| AppError(StatusCode::UNAUTHORIZED, "missing authorization header".into()))?;
    header.strip_prefix("Bearer ").ok_or_else(|| AppError(StatusCode::UNAUTHORIZED, "invalid authorization header".into()))
}

#[axum::async_trait]
impl FromRequestParts<AppState> for AuthClaims {
    type Rejection = AppError;
    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = bearer_token(&parts.headers)?;
        let data = decode::<AuthClaims>(token, &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()), &Validation::default())
            .map_err(|_| AppError(StatusCode::UNAUTHORIZED, "invalid or expired token".into()))?;
        if data.claims.role != "admin" { return Err(AppError(StatusCode::FORBIDDEN, "admin access required".into())); }
        Ok(data.claims)
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaybackClaims { pub sub: String, pub source: String, pub exp: usize }

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn admin_endpoint_rejects_missing_authorization() {
        let error = bearer_token(&HeaderMap::new()).unwrap_err();
        assert_eq!(error.0, StatusCode::UNAUTHORIZED);
    }
}
