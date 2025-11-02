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
        // Railway and most cloud providers set PORT env var
        let bind_addr = if let Ok(port) = env::var("PORT") {
            format!("0.0.0.0:{}", port)
        } else {
            env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string())
        };
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

        // Build a sane default URL (for local dev via docker-compose)
        let default_database_url = format!(
            "postgres://postgres:password@{}:5433/realtime_notes",
            default_db_host
        );

        // Load DATABASE_URL from env if present and non-empty
        let env_database_url = env::var("DATABASE_URL").ok().map(|s| s.trim().to_string());

        // If DATABASE_URL is missing/empty or malformed, try to assemble from individual PG vars
        let mut database_url = match env_database_url.as_deref() {
            Some(s) if !s.is_empty() => s.to_string(),
            _ => {
                // Try common env var names used by providers (PG* or POSTGRES_*)
                let host = env::var("PGHOST")
                    .ok()
                    .or_else(|| env::var("POSTGRES_HOST").ok());
                let port = env::var("PGPORT")
                    .ok()
                    .or_else(|| env::var("POSTGRES_PORT").ok())
                    .unwrap_or_else(|| "5432".to_string());
                let user = env::var("PGUSER")
                    .ok()
                    .or_else(|| env::var("POSTGRES_USER").ok());
                let password = env::var("PGPASSWORD")
                    .ok()
                    .or_else(|| env::var("POSTGRES_PASSWORD").ok());
                let database = env::var("PGDATABASE")
                    .ok()
                    .or_else(|| env::var("POSTGRES_DB").ok())
                    .or_else(|| env::var("POSTGRES_DATABASE").ok());

                if let (Some(h), Some(u), Some(pw), Some(db)) = (host, user, password, database) {
                    format!("postgresql://{}:{}@{}:{}/{}", u, pw, h, port, db)
                } else {
                    // Fall back to a known-good local default
                    default_database_url.clone()
                }
            }
        };

        // If inside a container and DATABASE_URL points at localhost/127.0.0.1,
        // rewrite host to host.docker.internal to reach services on the host.
        if default_db_host == "host.docker.internal" {
            if database_url.contains("@localhost:") {
                database_url = database_url.replace("@localhost:", "@host.docker.internal:");
            } else if database_url.contains("@127.0.0.1:") {
                database_url = database_url.replace("@127.0.0.1:", "@host.docker.internal:");
            }
        }

        // Basic sanity check to help diagnose common mistakes early (also catches empty string)
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
