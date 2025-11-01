// Rate limiting middleware untuk Actix Web
use actix_web::Error;
use actix_web::error::ErrorTooManyRequests;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct RateLimiter {
    // user_id -> (request_count, window_start)
    requests: Arc<DashMap<String, (u32, Instant)>>,
    max_requests: u32,
    window_duration: Duration,
}

impl RateLimiter {
    pub fn new(max_requests: u32, window_seconds: u64) -> Self {
        Self {
            requests: Arc::new(DashMap::new()),
            max_requests,
            window_duration: Duration::from_secs(window_seconds),
        }
    }

    pub fn check_rate_limit(&self, user_id: &str) -> Result<(), Error> {
        let now = Instant::now();
        
        let mut entry = self.requests.entry(user_id.to_string()).or_insert((0, now));
        let (count, window_start) = entry.value_mut();

        // Reset window if expired
        if now.duration_since(*window_start) > self.window_duration {
            *count = 0;
            *window_start = now;
        }

        // Check limit
        if *count >= self.max_requests {
            let retry_after = self.window_duration.as_secs() - now.duration_since(*window_start).as_secs();
            return Err(ErrorTooManyRequests(format!(
                "Rate limit exceeded. Try again in {} seconds",
                retry_after
            )));
        }

        *count += 1;
        Ok(())
    }

    // Cleanup old entries periodically
    pub fn cleanup(&self) {
        let now = Instant::now();
        self.requests.retain(|_, v| {
            now.duration_since(v.1) <= self.window_duration
        });
    }
}

// Per-user message rate limiter (WebSocket messages)
pub struct MessageRateLimiter {
    limiter: RateLimiter,
}

impl MessageRateLimiter {
    pub fn new() -> Self {
        // 30 messages per minute per user
        Self {
            limiter: RateLimiter::new(30, 60),
        }
    }

    pub fn check(&self, user_id: &str) -> Result<(), String> {
        self.limiter.check_rate_limit(user_id).map_err(|e| e.to_string())
    }

    pub fn cleanup(&self) {
        self.limiter.cleanup();
    }
}
