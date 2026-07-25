use redis::AsyncCommands;
use serde_json::Value;
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};
use std::{env, time::Duration};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let db = MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&env::var("DATABASE_URL").expect("DATABASE_URL is required"))
        .await
        .expect("database connection failed");
    let client = redis::Client::open(
        env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".into()),
    )
    .expect("invalid REDIS_URL");
    let mut redis = client
        .get_multiplexed_async_connection()
        .await
        .expect("redis connection failed");

    tracing::info!("worker ready");
    loop {
        let result: redis::RedisResult<Option<[String; 2]>> =
            redis.brpop("ingestion:queue", 5.0).await;
        match result {
            Ok(Some([_, id])) => {
                if let Err(error) = process(&db, &id).await {
                    fail(&db, &id, &error.to_string()).await;
                }
            }
            Ok(None) => {}
            Err(error) => {
                tracing::error!(?error, "queue read failed");
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        }
    }
}

async fn process(db: &MySqlPool, id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let row: Option<(String, Option<u64>, Value)> = sqlx::query_as(
        "SELECT job_type,content_id,payload FROM ingestion_jobs WHERE id=?",
    )
    .bind(id)
    .fetch_optional(db)
    .await?;
    let Some((job_type, content_id, payload)) = row else {
        return Ok(());
    };

    sqlx::query("UPDATE ingestion_jobs SET status='processing',progress=20,started_at=NOW(),log_message='Worker started' WHERE id=?")
        .bind(id)
        .execute(db)
        .await?;
    tokio::time::sleep(Duration::from_millis(1200)).await;

    sqlx::query(
        "UPDATE ingestion_jobs SET progress=70,log_message='Processing job payload' WHERE id=?",
    )
    .bind(id)
    .execute(db)
    .await?;
    tokio::time::sleep(Duration::from_millis(1300)).await;

    let completion_message = match job_type.as_str() {
        "metadata_enrichment" => {
            if let Some(content_id) = content_id {
                let description = payload
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or("Metadata enriched from local demo fixtures.");
                sqlx::query("UPDATE content SET description=? WHERE id=?")
                    .bind(description)
                    .bind(content_id)
                    .execute(db)
                    .await?;
            }
            "Metadata enrichment completed".to_string()
        }
        "subtitle_import" => {
            let content_id = content_id.ok_or("content_id is required")?;
            let language = payload
                .get("language_code")
                .and_then(Value::as_str)
                .unwrap_or("en");
            let label = payload
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or("Imported subtitle");
            let url = payload
                .get("file_url")
                .and_then(Value::as_str)
                .ok_or("file_url is required")?;
            sqlx::query("INSERT INTO subtitles (content_id,language_code,label,file_url,format,is_default) VALUES (?,?,?,?, 'vtt', FALSE)")
                .bind(content_id)
                .bind(language)
                .bind(label)
                .bind(url)
                .execute(db)
                .await?;
            "Subtitle import completed".to_string()
        }
        "duplicate_detection" => {
            let title = payload
                .get("title")
                .and_then(Value::as_str)
                .ok_or("title is required")?;
            let year = payload
                .get("release_year")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            let (count,): (i64,) = sqlx::query_as(
                "SELECT COUNT(*) FROM content WHERE LOWER(title)=LOWER(?) AND release_year=?",
            )
            .bind(title)
            .bind(year)
            .fetch_one(db)
            .await?;
            if count > 0 {
                "Possible duplicate found".to_string()
            } else {
                "No duplicate found".to_string()
            }
        }
        _ => return Err("unsupported job type".into()),
    };

    sqlx::query("UPDATE ingestion_jobs SET status='completed',progress=100,completed_at=NOW(),log_message=? WHERE id=?")
        .bind(&completion_message)
        .bind(id)
        .execute(db)
        .await?;
    sqlx::query("INSERT INTO system_logs (level,source,message) VALUES ('info','worker',?)")
        .bind(format!("Completed {job_type} job {id}: {completion_message}"))
        .execute(db)
        .await?;
    Ok(())
}

async fn fail(db: &MySqlPool, id: &str, error: &str) {
    let _ = sqlx::query("UPDATE ingestion_jobs SET status='failed',error_message=?,completed_at=NOW(),log_message='Job failed' WHERE id=?")
        .bind(error)
        .bind(id)
        .execute(db)
        .await;
    let _ = sqlx::query(
        "INSERT INTO system_logs (level,source,message) VALUES ('error','worker',?)",
    )
    .bind(format!("Job {id} failed: {error}"))
    .execute(db)
    .await;
}
