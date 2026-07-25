use redis::Client;
use sqlx::MySqlPool;
use crate::config::Config;

#[derive(Clone)]
pub struct AppState { pub db: MySqlPool, pub redis: Client, pub config: Config }
