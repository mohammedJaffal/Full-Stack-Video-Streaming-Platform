use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use sqlx::{MySql, QueryBuilder};

use crate::{
    error::AppError,
    models::{Category, ContentDetails, ContentQuery, ContentSummary, Subtitle},
    state::AppState,
};

const CONTENT_SELECT: &str = r#"
SELECT c.id, c.title, c.slug, c.description, c.release_year, c.duration_seconds,
       c.poster_url, c.backdrop_url, c.category_id, cat.name AS category_name,
       c.playback_type, c.is_active, c.created_at
FROM content c JOIN categories cat ON cat.id = c.category_id
"#;

pub async fn categories(
    State(state): State<AppState>,
) -> Result<Json<Vec<Category>>, AppError> {
    Ok(Json(
        sqlx::query_as::<_, Category>("SELECT id, name, slug FROM categories ORDER BY name")
            .fetch_all(&state.db)
            .await?,
    ))
}

pub async fn list_content(
    State(state): State<AppState>,
    Query(query): Query<ContentQuery>,
) -> Result<Json<Vec<ContentSummary>>, AppError> {
    let mut builder = QueryBuilder::<MySql>::new(CONTENT_SELECT);
    builder.push(" WHERE c.is_active = TRUE");

    if let Some(search) = query.q.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let pattern = format!("%{search}%");
        builder
            .push(" AND (c.title LIKE ")
            .push_bind(pattern.clone())
            .push(" OR c.description LIKE ")
            .push_bind(pattern)
            .push(")");
    }

    if let Some(category) = query
        .category
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        builder.push(" AND cat.slug = ").push_bind(category.to_owned());
    }

    builder.push(" ORDER BY ");
    if query.sort.as_deref() == Some("title") {
        builder.push("c.title ASC");
    } else {
        builder.push("c.created_at DESC");
    }

    let rows = builder
        .build_query_as::<ContentSummary>()
        .fetch_all(&state.db)
        .await?;

    Ok(Json(rows))
}

pub async fn search(
    State(state): State<AppState>,
    Query(query): Query<ContentQuery>,
) -> Result<Json<Vec<ContentSummary>>, AppError> {
    list_content(State(state), Query(query)).await
}

pub async fn details(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<ContentDetails>, AppError> {
    let sql = format!("{CONTENT_SELECT} WHERE c.slug = ? AND c.is_active = TRUE LIMIT 1");
    let content = sqlx::query_as::<_, ContentSummary>(&sql)
        .bind(&slug)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError(StatusCode::NOT_FOUND, "content not found".into()))?;

    let subtitles = sqlx::query_as::<_, Subtitle>(
        "SELECT id, content_id, language_code, label, file_url, format, is_default FROM subtitles WHERE content_id = ? ORDER BY is_default DESC, label",
    )
    .bind(content.id)
    .fetch_all(&state.db)
    .await?;

    let related_sql = format!(
        "{CONTENT_SELECT} WHERE c.id <> ? AND c.is_active = TRUE ORDER BY (c.category_id = ?) DESC, c.created_at DESC LIMIT 4"
    );
    let related = sqlx::query_as::<_, ContentSummary>(&related_sql)
        .bind(content.id)
        .bind(content.category_id)
        .fetch_all(&state.db)
        .await?;

    Ok(Json(ContentDetails {
        content,
        subtitles,
        related,
    }))
}
