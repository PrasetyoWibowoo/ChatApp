use crate::auth::{JwtKeys, extract_user_id_from_auth};
use crate::errors::AppError;
use actix_web::{put, web, HttpRequest, HttpResponse};
use serde::Deserialize;
use sqlx::PgPool;

#[derive(Deserialize)]
pub struct UpdateAvatar {
    pub avatar_url: String,
}

#[put("/api/user/avatar")]
pub async fn update_avatar(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    payload: web::Json<UpdateAvatar>,
) -> Result<HttpResponse, AppError> {
    let user_id = extract_user_id_from_auth(
        req.headers().get("authorization").and_then(|h| h.to_str().ok()),
        &keys.decoding,
    )?;

    // Validate base64 image size (optional - you can add more validation)
    if payload.avatar_url.len() > 1_000_000 {  // ~750KB base64
        return Err(AppError::BadRequest("Avatar too large".into()));
    }

    sqlx::query("UPDATE users SET avatar_url = $1 WHERE id = $2")
        .bind(&payload.avatar_url)
        .bind(user_id)
        .execute(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "avatar_url": payload.avatar_url
    })))
}
