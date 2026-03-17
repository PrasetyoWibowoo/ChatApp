use crate::auth::{extract_user_id_from_auth, JwtKeys};
use crate::errors::AppError;
use actix_web::{delete, get, post, web, HttpRequest, HttpResponse};
use rand::Rng;
use serde::Deserialize;
use sqlx::{PgPool, Row};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct SendFriendRequest {
    pub email: Option<String>,
    pub user_id: Option<String>,
    pub invite_code: Option<String>,
}

/// POST /api/friends/request
#[post("/api/friends/request")]
pub async fn send_friend_request(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    payload: web::Json<SendFriendRequest>,
) -> Result<HttpResponse, AppError> {
    let my_id = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;

    let target_id: Uuid = if let Some(email) = &payload.email {
        let row = sqlx::query("SELECT id FROM users WHERE email = $1")
            .bind(email.trim().to_lowercase())
            .fetch_optional(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or_else(|| AppError::BadRequest("User not found".into()))?;
        row.try_get("id").map_err(|_| AppError::Internal)?
    } else if let Some(uid_str) = &payload.user_id {
        Uuid::parse_str(uid_str).map_err(|_| AppError::BadRequest("Invalid user ID".into()))?
    } else if let Some(code) = &payload.invite_code {
        let row = sqlx::query("SELECT user_id FROM invite_codes WHERE code = $1")
            .bind(code.trim().to_uppercase())
            .fetch_optional(pool.get_ref())
            .await
            .map_err(|_| AppError::Internal)?
            .ok_or_else(|| AppError::BadRequest("Invalid invite code".into()))?;
        row.try_get("user_id").map_err(|_| AppError::Internal)?
    } else {
        return Err(AppError::BadRequest(
            "email, user_id, or invite_code required".into(),
        ));
    };

    if target_id == my_id {
        return Err(AppError::BadRequest("Cannot add yourself".into()));
    }

    // Check if already friends or pending
    let existing = sqlx::query(
        "SELECT id, status FROM friends \
         WHERE (requester_id = $1 AND addressee_id = $2) \
            OR (requester_id = $2 AND addressee_id = $1)",
    )
    .bind(my_id)
    .bind(target_id)
    .fetch_optional(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    if let Some(row) = existing {
        let status: String = row.try_get("status").map_err(|_| AppError::Internal)?;
        if status == "accepted" {
            return Err(AppError::BadRequest("Already friends".into()));
        }
        // If pending by other side, auto-accept
        let requester: Uuid = row.try_get("requester_id").unwrap_or(my_id);
        if requester == target_id {
            let id: Uuid = row.try_get("id").map_err(|_| AppError::Internal)?;
            sqlx::query("UPDATE friends SET status = 'accepted', updated_at = NOW() WHERE id = $1")
                .bind(id)
                .execute(pool.get_ref())
                .await
                .map_err(|_| AppError::Internal)?;
            return Ok(HttpResponse::Ok().json(serde_json::json!({
                "message": "Friend request accepted"
            })));
        }
        return Err(AppError::BadRequest("Friend request already sent".into()));
    }

    sqlx::query(
        "INSERT INTO friends (requester_id, addressee_id, status) VALUES ($1, $2, 'pending')",
    )
    .bind(my_id)
    .bind(target_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    // Look up target email for response
    let row = sqlx::query("SELECT email, avatar_url FROM users WHERE id = $1")
        .bind(target_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;
    let email: String = row.try_get("email").map_err(|_| AppError::Internal)?;
    let avatar_url: Option<String> = row.try_get("avatar_url").ok().flatten();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Friend request sent",
        "user": { "id": target_id, "email": email, "avatar_url": avatar_url }
    })))
}

/// GET /api/friends — list all friends (accepted + pending)
#[get("/api/friends")]
pub async fn list_friends(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
) -> Result<HttpResponse, AppError> {
    let my_id = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;

    let rows = sqlx::query(
        "SELECT f.id, f.status, f.requester_id, f.addressee_id, \
                u.id AS friend_user_id, u.email, u.avatar_url \
         FROM friends f \
         JOIN users u ON ( \
           CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END = u.id \
         ) \
         WHERE (f.requester_id = $1 OR f.addressee_id = $1) \
         ORDER BY f.created_at DESC",
    )
    .bind(my_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    let friends: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let id: Uuid = row.try_get("id").unwrap();
            let status: String = row.try_get("status").unwrap();
            let email: String = row.try_get("email").unwrap();
            let avatar_url: Option<String> = row.try_get("avatar_url").ok().flatten();
            let friend_user_id: Uuid = row.try_get("friend_user_id").unwrap();
            let requester_id: Uuid = row.try_get("requester_id").unwrap();
            let direction = if requester_id == my_id { "sent" } else { "received" };
            serde_json::json!({
                "id": id,
                "user_id": friend_user_id,
                "email": email,
                "avatar_url": avatar_url,
                "status": status,
                "direction": direction,
            })
        })
        .collect();

    Ok(HttpResponse::Ok().json(friends))
}

/// POST /api/friends/{id}/accept
#[post("/api/friends/{id}/accept")]
pub async fn accept_friend_request(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let my_id = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;
    let friend_row_id = path.into_inner();

    let result = sqlx::query(
        "UPDATE friends SET status = 'accepted', updated_at = NOW() \
         WHERE id = $1 AND addressee_id = $2 AND status = 'pending'",
    )
    .bind(friend_row_id)
    .bind(my_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({"message": "Friend request accepted"})))
}

/// DELETE /api/friends/{id}
#[delete("/api/friends/{id}")]
pub async fn remove_friend(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let my_id = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;
    let friend_row_id = path.into_inner();

    sqlx::query(
        "DELETE FROM friends WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)",
    )
    .bind(friend_row_id)
    .bind(my_id)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"message": "Removed"})))
}

/// GET /api/users/invite-code — get or create my invite code
#[get("/api/users/invite-code")]
pub async fn get_invite_code(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
) -> Result<HttpResponse, AppError> {
    let my_id = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;

    // Return existing code if present
    let existing = sqlx::query("SELECT code FROM invite_codes WHERE user_id = $1")
        .bind(my_id)
        .fetch_optional(pool.get_ref())
        .await
        .map_err(|_| AppError::Internal)?;

    if let Some(row) = existing {
        let code: String = row.try_get("code").map_err(|_| AppError::Internal)?;
        return Ok(HttpResponse::Ok().json(serde_json::json!({"code": code})));
    }

    // Generate new 8-char alphanumeric code
    let code: String = {
        let mut rng = rand::thread_rng();
        (0..8)
            .map(|_| {
                let idx = rng.gen_range(0usize..36);
                if idx < 10 {
                    (b'0' + idx as u8) as char
                } else {
                    (b'A' + (idx as u8 - 10)) as char
                }
            })
            .collect()
    };

    sqlx::query(
        "INSERT INTO invite_codes (user_id, code) VALUES ($1, $2) \
         ON CONFLICT (user_id) DO UPDATE SET code = EXCLUDED.code",
    )
    .bind(my_id)
    .bind(&code)
    .execute(pool.get_ref())
    .await
    .map_err(|_| AppError::Internal)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({"code": code})))
}

/// GET /api/users/by-invite/{code} — look up user profile by invite code
#[get("/api/users/by-invite/{code}")]
pub async fn lookup_by_invite_code(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let _caller = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;
    let code = path.into_inner().to_uppercase();

    let row_opt = sqlx::query(
        "SELECT u.id, u.email, u.avatar_url \
         FROM invite_codes ic \
         JOIN users u ON ic.user_id = u.id \
         WHERE ic.code = $1",
    )
    .bind(&code)
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
        None => Err(AppError::BadRequest("Invalid invite code".into())),
    }
}

/// GET /api/users/{user_id}/profile — get user profile by ID
#[get("/api/users/{user_id}/profile")]
pub async fn get_user_profile(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    keys: web::Data<JwtKeys>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let _caller = extract_user_id_from_auth(
        req.headers().get("Authorization").and_then(|v| v.to_str().ok()),
        &keys.decoding,
    )?;
    let user_id = Uuid::parse_str(&path.into_inner())
        .map_err(|_| AppError::BadRequest("Invalid user ID".into()))?;

    let row_opt = sqlx::query("SELECT id, email, avatar_url FROM users WHERE id = $1")
        .bind(user_id)
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
        None => Err(AppError::NotFound),
    }
}
