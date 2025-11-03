mod auth;
mod avatar;
mod config;
mod db;
mod email;
mod errors;
mod models;
mod ws;
mod ratelimit;
mod validation;

use actix_cors::Cors;
use actix_web::{get, web, App, HttpResponse, HttpServer, dev::Service as _, dev::ServiceRequest, dev::ServiceResponse, Error};
use actix_web::http::header;
use config::Config;
use env_logger::Env;
use futures_util::future::FutureExt;
use jsonwebtoken::{DecodingKey, EncodingKey};
use sqlx::PgPool;
use ws::WsState;

#[get("/health")]
async fn health() -> HttpResponse { 
    HttpResponse::Ok().body("OK") 
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    dotenvy::dotenv().ok();
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();
    
    log::info!("ChatApp Backend v1.0.1 starting with RAILWAY_CORS_DISABLED support...");

    let cfg = Config::from_env();

    // Helpful log for database target (credentials redacted)
    let redacted_db_url = {
        let url = &cfg.database_url;
        match (url.find("://"), url.find('@')) {
            (Some(s_idx), Some(a_idx)) if a_idx > s_idx + 3 => {
                let mut redacted = url.to_string();
                redacted.replace_range(s_idx + 3..a_idx, "****:****");
                redacted
            }
            _ => url.clone(),
        }
    };
    log::info!("connecting to database at {}", redacted_db_url);

    let pool: PgPool = db::init_pool_with_retry(&cfg.database_url, 20, 500)
        .await
        .map_err(|e| {
            log::error!("database connection failed: {}", e);
            std::io::Error::new(std::io::ErrorKind::Other, format!("DB connect: {}", e))
        })?;

    db::run_migrations(&pool).await.map_err(|e| {
        log::error!("database migrations failed: {}", e);
        std::io::Error::new(std::io::ErrorKind::Other, format!("migrations: {}", e))
    })?;

    let ws_state = web::Data::new(WsState::new());

    let keys = auth::JwtKeys {
        encoding: EncodingKey::from_secret(cfg.jwt_secret.as_bytes()),
        decoding: DecodingKey::from_secret(cfg.jwt_secret.as_bytes()),
    };

    let email_service = web::Data::new(
        match email::EmailService::new() {
            Ok(service) => {
                log::info!("✅ Email service initialized successfully");
                service
            }
            Err(e) => {
                log::error!("❌ Failed to initialize email service: {}", e);
                log::error!("⚠️  Email verification will not work!");
                log::error!("💡 Set RESEND_API_KEY environment variable to enable email");
                panic!("Email service required. Get free API key from https://resend.com");
            }
        }
    );

    log::info!("starting chat server on {}", &cfg.bind_addr);

    HttpServer::new(move || {
        // Use permissive CORS to bypass Railway proxy limitations
        let cors = Cors::permissive();
        
        App::new()
            .app_data(web::Data::new(pool.clone()))
            .app_data(ws_state.clone())
            .app_data(web::Data::new(keys.clone()))
            .app_data(email_service.clone())
            .wrap(actix_web::middleware::Logger::default())
            .wrap(cors)
            // Custom middleware to force CORS headers after Railway proxy
            .wrap_fn(|req, srv| {
                let origin = req.headers()
                    .get(header::ORIGIN)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                
                srv.call(req).map(move |res| {
                    res.map(|mut response| {
                        if let Some(origin_value) = origin {
                            // Force set CORS headers to override Railway proxy
                            response.headers_mut().insert(
                                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                                origin_value.parse().unwrap(),
                            );
                            response.headers_mut().insert(
                                header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
                                "true".parse().unwrap(),
                            );
                            response.headers_mut().insert(
                                header::ACCESS_CONTROL_ALLOW_METHODS,
                                "GET,POST,PUT,DELETE,OPTIONS,PATCH".parse().unwrap(),
                            );
                            response.headers_mut().insert(
                                header::ACCESS_CONTROL_ALLOW_HEADERS,
                                "*".parse().unwrap(),
                            );
                        }
                        response
                    })
                })
            })
            .service(health)
            .service(auth::signup)
            .service(auth::login)
            .service(auth::send_verification)
            .service(auth::verify_email)
            .service(avatar::update_avatar)
            .route("/ws/rooms/{id}", web::get().to(ws::ws_index))
            .route("/api/rooms/{id}/messages", web::get().to(ws::get_messages))
            .route("/api/rooms/{id}/search", web::get().to(ws::search_messages))
            .route("/api/rooms/{id}/read", web::post().to(ws::update_last_read))
            .route("/api/rooms/unread-counts", web::get().to(ws::get_unread_counts))
    })
    .bind(cfg.bind_addr)?
    .run()
    .await
}