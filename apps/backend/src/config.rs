use dotenvy::dotenv;
use std::env;
use std::path::Path;

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
        // Default matches docker-compose.yml (port 5433, password "password", db "realtime_notes").
        // When running inside a container, "localhost" would refer to the container itself.
        // Prefer host.docker.internal to reach the host's forwarded port.
        let default_db_host = if Path::new("/.dockerenv").exists()
            || env::var("RUNNING_IN_DOCKER").is_ok()
        {
            "host.docker.internal"
        } else {
            "localhost"
        };

        let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| {
            format!(
                "postgres://postgres:password@{}:5433/realtime_notes",
                default_db_host
            )
        });

        // Basic sanity check to help diagnose common mistakes early
        if !(database_url.starts_with("postgres://") || database_url.starts_with("postgresql://")) {
            eprintln!(
                "Warning: DATABASE_URL does not start with postgres:// or postgresql:// -> {}",
                database_url
            );
        }
        let jwt_secret = env::var("JWT_SECRET").unwrap_or_else(|_| "change_me".to_string());
        let snapshot_interval_secs = env::var("SNAPSHOT_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(5);
        Self { bind_addr, database_url, jwt_secret, snapshot_interval_secs }
    }
}
