use axum::{extract::{Path, Query, State}, http::StatusCode, Json};
use crate::{error::AppError, models::{Category, ContentDetails, ContentQuery, ContentSummary, Subtitle}, state::AppState};

const CONTENT_SELECT: &str = r#"
SELECT c.id, c.title, c.slug, c.description, c.release_year, c.duration_seconds,
       c.poster_url, c.backdrop_url, c.category_id, cat.name AS category_name,
       c.playback_type, c.is_active, c.created_at
FROM content c JOIN categories cat ON cat.id = c.category_id
"#;

pub async fn categories(State(state): State<AppState>) -> Result<Json<Vec<Category>>, AppError> {
    Ok(Json(sqlx::query_as::<_, Category>("SELECT id, name, slug FROM categories ORDER BY name").fetch_all(&state.db).await?))
}

pub async fn list_content(State(state): State<AppState>, Query(query): Query<ContentQuery>) -> Result<Json<Vec<ContentSummary>>, AppError> {
    let q = format!("%{}%", query.q.unwrap_or_default());
    let category = query.category.unwrap_or_default();
    let order = if query.sort.as_deref() == Some("title") { "c.title ASC" } else { "c.created_at DESC" };
    let sql = format!("{CONTENT_SELECT} WHERE c.is_active = TRUE AND (? = '%%' OR c.title LIKE ? OR c.description LIKE ?) AND (? = '' OR cat.slug = ?) ORDER BY {order}");
    let rows = sqlx::query_as::<_, ContentSummary>(&sql)
        .bind(&q).bind(&q).bind(&q).bind(&category).bind(&category)
        .fetch_all(&state.db).await?;
    Ok(Json(rows))
}

pub async fn search(State(state): State<AppState>, Query(query): Query<ContentQuery>) -> Result<Json<Vec<ContentSummary>>, AppError> {
    list_content(State(state), Query(query)).await
}

pub async fn details(State(state): State<AppState>, Path(slug): Path<String>) -> Result<Json<ContentDetails>, AppError> {
    let sql = format!("{CONTENT_SELECT} WHERE c.slug = ? AND c.is_active = TRUE LIMIT 1");
    let content = sqlx::query_as::<_, ContentSummary>(&sql).bind(&slug).fetch_optional(&state.db).await?
        .ok_or_else(|| AppError(StatusCode::NOT_FOUND, "content not found".into()))?;
    let subtitles = sqlx::query_as::<_, Subtitle>("SELECT id, content_id, language_code, label, file_url, format, is_default FROM subtitles WHERE content_id = ? ORDER BY is_default DESC, label")
        .bind(content.id).fetch_all(&state.db).await?;
    let related_sql = format!("{CONTENT_SELECT} WHERE c.category_id = ? AND c.id <> ? AND c.is_active = TRUE ORDER BY c.created_at DESC LIMIT 4");
    let related = sqlx::query_as::<_, ContentSummary>(&related_sql).bind(content.category_id).bind(content.id).fetch_all(&state.db).await?;
    Ok(Json(ContentDetails { content, subtitles, related }))
}
