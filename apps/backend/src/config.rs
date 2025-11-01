use dotenvy::dotenv;
use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub bind_addr: String,
    pub database_url: String,
    pub jwt_secret: String,
    pub snapshot_interval_secs: u64,
}

impl Config {
    pub fn from_env() -> Self {
        dotenv().ok();
        let bind_addr = env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
        // Default matches docker-compose.yml (port 5433, password "password", db "realtime_notes")
        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:password@localhost:5433/realtime_notes".to_string()
        });
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "change_me".to_string());
        let snapshot_interval_secs = env::var("SNAPSHOT_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(5);
        Self { bind_addr, database_url, jwt_secret, snapshot_interval_secs }
    }
}
