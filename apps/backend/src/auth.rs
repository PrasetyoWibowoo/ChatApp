use crate::email::EmailService;
use crate::errors::AppError;
use actix_web::{get, post, web, HttpRequest, HttpResponse};
use argon2::{password_hash::SaltString, Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, Algorithm, DecodingKey, EncodingKey, Header};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Clone)]
pub struct JwtKeys {
    pub encoding: EncodingKey,
    pub decoding: DecodingKey,
}

#[derive(Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub exp: usize,
}

#[derive(Deserialize)]
pub struct Signup { 
    pub email: String, 
    pub password: String,
    pub avatar_url: Option<String>,
}
#[derive(Deserialize)]
pub struct Login { pub email: String, pub password: String }

#[derive(Deserialize)]
pub struct SendVerificationRequest { pub email: String }

#[derive(Deserialize)]
pub struct VerifyEmailRequest { 
    pub email: String, 
    pub code: String 
}

#[post("/api/auth/signup")]
pub async fn signup(pool: web::Data<PgPool>, keys: web::Data<JwtKeys>, payload: web::Json<Signup>) -> Result<HttpResponse, AppError> {
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() || payload.password.len() < 6 { return Err(AppError::BadRequest("Invalid email or password".into())); }
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(payload.password.as_bytes(), &salt).map_err(|_| AppError::Internal)?.to_string();

    let id = Uuid::new_v4();
    let _rec = sqlx::query("INSERT INTO users (id,email,password_hash,avatar_url,created_at) VALUES ($1,$2,$3,$4,now()) RETURNING id")
        .bind(id)
        .bind(&email)
        .bind(&hash)
        .bind(&payload.avatar_url)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::BadRequest("Email already used?".into()))?;

    let exp = (Utc::now() + Duration::days(7)).timestamp() as usize;
    let token = encode(&Header::new(Algorithm::HS256), &Claims { sub: id.to_string(), exp }, &keys.encoding).map_err(|_| AppError::Internal)?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"token": token, "user_id": id})))
}

#[post("/api/auth/login")]
pub async fn login(pool: web::Data<PgPool>, keys: web::Data<JwtKeys>, payload: web::Json<Login>) -> Result<HttpResponse, AppError> {
    let email = payload.email.trim().to_lowercase();
    let row_opt = sqlx::query("SELECT id, password_hash, avatar_url, email_verified FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;
    let Some(row) = row_opt else { return Err(AppError::Unauthorized) };
    
    let email_verified: bool = row.try_get("email_verified").unwrap_or(false);
    if !email_verified {
        return Err(AppError::BadRequest("Email not verified. Please verify your email first.".into()));
    }
    
    let password_hash: String = row.try_get("password_hash").map_err(|_| AppError::Internal)?;
    let parsed = PasswordHash::new(&password_hash).map_err(|_| AppError::Internal)?;
    Argon2::default().verify_password(payload.password.as_bytes(), &parsed).map_err(|_| AppError::Unauthorized)?;

    let exp = (Utc::now() + Duration::days(7)).timestamp() as usize;
    let uid: Uuid = row.try_get("id").map_err(|_| AppError::Internal)?;
    let avatar_url: Option<String> = row.try_get("avatar_url").ok();
    let token = encode(&Header::new(Algorithm::HS256), &Claims { sub: uid.to_string(), exp }, &keys.encoding).map_err(|_| AppError::Internal)?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"token": token, "user_id": uid, "avatar_url": avatar_url})))
}

#[post("/api/auth/send-verification")]
pub async fn send_verification(
    pool: web::Data<PgPool>, 
    email_service: web::Data<EmailService>,
    payload: web::Json<SendVerificationRequest>
) -> Result<HttpResponse, AppError> {
    let email = payload.email.trim().to_lowercase();
    
    log::info!("Sending verification code to: {}", email);
    
    // Check if user exists
    let user_exists = sqlx::query("SELECT id FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|e| {
            log::error!("Database error checking user exists: {}", e);
            AppError::Internal
        })?
        .is_some();
    
    if !user_exists {
        log::warn!("Verification code requested for unregistered email: {}", email);
        return Err(AppError::BadRequest("Email not registered".into()));
    }
    
    // Generate 6-digit code
    let code = EmailService::generate_code();
    let expires_at = Utc::now() + Duration::minutes(10);
    
    // Delete old verification codes for this email
    sqlx::query("DELETE FROM email_verifications WHERE email = $1")
        .bind(&email)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;
    
    // Save new verification code
    sqlx::query("INSERT INTO email_verifications (email, code, expires_at) VALUES ($1, $2, $3)")
        .bind(&email)
        .bind(&code)
        .bind(expires_at)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;
    
    // Send email
    email_service.send_verification_code(&email, &code)
        .await
        .map_err(|e| {
            log::error!("Failed to send verification email: {}", e);
            AppError::Internal
        })?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Verification code sent to email"
    })))
}

#[post("/api/auth/verify-email")]
pub async fn verify_email(
    pool: web::Data<PgPool>,
    payload: web::Json<VerifyEmailRequest>
) -> Result<HttpResponse, AppError> {
    let email = payload.email.trim().to_lowercase();
    let code = payload.code.trim().to_uppercase();
    
    log::info!("Verifying email: {} with code: {}", email, code);
    
    // Find verification record
    let row_opt = sqlx::query(
        "SELECT id, expires_at, verified, attempts FROM email_verifications 
         WHERE email = $1 AND code = $2 
         ORDER BY created_at DESC 
         LIMIT 1"
    )
        .bind(&email)
        .bind(&code)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|e| {
            log::error!("Database error finding verification code: {}", e);
            AppError::Internal
        })?;
    
    let Some(row) = row_opt else {
        log::warn!("Invalid verification code for email: {}", email);
        return Err(AppError::BadRequest("Invalid verification code".into()));
    };
    
    let verification_id: Uuid = row.try_get("id").map_err(|e| {
        log::error!("Failed to get verification id: {}", e);
        AppError::Internal
    })?;
    let expires_at: chrono::DateTime<Utc> = row.try_get("expires_at").map_err(|e| {
        log::error!("Failed to get expires_at: {}", e);
        AppError::Internal
    })?;
    let verified: bool = row.try_get("verified").map_err(|e| {
        log::error!("Failed to get verified flag: {}", e);
        AppError::Internal
    })?;
    let attempts: i32 = row.try_get("attempts").map_err(|e| {
        log::error!("Failed to get attempts: {}", e);
        AppError::Internal
    })?;
    
    // Check if already verified
    if verified {
        return Err(AppError::BadRequest("Code already used".into()));
    }
    
    // Check if expired
    if Utc::now() > expires_at {
        return Err(AppError::BadRequest("Verification code expired".into()));
    }
    
    // Check attempts (max 5)
    if attempts >= 5 {
        return Err(AppError::BadRequest("Too many attempts. Please request a new code.".into()));
    }
    
    // Update verification record
    sqlx::query("UPDATE email_verifications SET verified = true, attempts = attempts + 1 WHERE id = $1")
        .bind(verification_id)
        .execute(pool.get_ref())
        .await
        .map_err(|e| {
            log::error!("Database error updating verification record: {}", e);
            AppError::Internal
        })?;
    
    // Update user's email_verified status
    sqlx::query("UPDATE users SET email_verified = true WHERE email = $1")
        .bind(&email)
        .execute(pool.get_ref())
        .await
        .map_err(|e| {
            log::error!("Database error updating user email_verified: {}", e);
            AppError::Internal
        })?;
    
    log::info!("Email verified successfully for: {}", email);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Email verified successfully"
    })))
}

pub fn extract_user_id_from_auth(header: Option<&str>, decoding: &DecodingKey) -> Result<Uuid, AppError> {
    let auth = header.ok_or(AppError::Unauthorized)?;
    let token = auth.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
    let data = jsonwebtoken::decode::<Claims>(token, decoding, &jsonwebtoken::Validation::new(Algorithm::HS256)).map_err(|_| AppError::Unauthorized)?;
    Uuid::parse_str(&data.claims.sub).map_err(|_| AppError::Unauthorized)
}

#[derive(Deserialize)]
pub struct UserLookupQuery {
    pub email: Option<String>,
}

#[get("/api/users/lookup")]
pub async fn lookup_user(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    query: web::Query<UserLookupQuery>,
) -> Result<HttpResponse, AppError> {
    // Require authentication
    let auth_header = req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok());
    extract_user_id_from_auth(auth_header, &keys.decoding)?;

    let email_param = query.email.as_deref().unwrap_or("").trim().to_lowercase();
    if email_param.is_empty() {
        return Err(AppError::BadRequest("email query parameter is required".into()));
    }

    let row_opt = sqlx::query("SELECT id, email, avatar_url FROM users WHERE email = $1")
        .bind(&email_param)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    match row_opt {
        Some(row) => {
            let id: Uuid = row.try_get("id").map_err(|_| AppError::Internal)?;
            let email: String = row.try_get("email").map_err(|_| AppError::Internal)?;
            let avatar_url: Option<String> = row.try_get("avatar_url").ok().flatten();
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "id": id,
                "email": email,
                "avatar_url": avatar_url,
            })))
        }
        None => Err(AppError::BadRequest("User not found".into())),
    }
}

pub fn extract_user_id_from_token(token: &str, decoding: &DecodingKey) -> Result<Uuid, AppError> {
    let data = jsonwebtoken::decode::<Claims>(token, decoding, &jsonwebtoken::Validation::new(Algorithm::HS256))
        .map_err(|_| AppError::Unauthorized)?;
    Uuid::parse_str(&data.claims.sub).map_err(|_| AppError::Unauthorized)
}
