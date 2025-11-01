use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(FromRow, Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub avatar_url: Option<String>,
}

#[derive(FromRow, Serialize, Deserialize, Debug, Clone)]
pub struct Document {
    pub id: Uuid,
    pub title: String,
    pub owner_id: Uuid,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(FromRow, Serialize, Deserialize, Debug, Clone)]
pub struct DocumentSnapshot {
    pub id: Uuid,
    pub document_id: Uuid,
    pub version: i32,
    pub snapshot: Vec<u8>,
    pub created_at: DateTime<Utc>,
    pub summary: Option<String>,
}

#[derive(FromRow, Serialize, Deserialize, Debug, Clone)]
pub struct Message {
    pub id: Uuid,
    pub room_id: String,
    pub sender_id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
}
