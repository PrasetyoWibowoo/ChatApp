use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn init_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await?;
    Ok(pool)
}

pub async fn run_migrations(pool: &PgPool) -> anyhow::Result<()> {
    // Uses the ./migrations folder at runtime
    sqlx::migrate!("./migrations").run(pool).await?;
    Ok(())
}

pub async fn init_pool_with_retry(database_url: &str, attempts: usize, delay_ms: u64) -> anyhow::Result<PgPool> {
    let mut last_err: Option<anyhow::Error> = None;
    for i in 1..=attempts {
        match init_pool(database_url).await {
            Ok(pool) => return Ok(pool),
            Err(e) => {
                last_err = Some(e);
                if i < attempts {
                    tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| anyhow::anyhow!("DB connect failed")))
}
