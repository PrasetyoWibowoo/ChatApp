use std::sync::Arc;
use std::time::{Duration, Instant};
use actix::{Actor, ActorContext, ActorFutureExt, AsyncContext, StreamHandler, WrapFuture};
use actix_web::{web, Error, HttpRequest, HttpResponse};
use actix_web_actors::ws;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use futures_util::{StreamExt, future::ready};
use sqlx::PgPool;
use uuid::Uuid;

use crate::auth::{extract_user_id_from_token, JwtKeys};
use crate::ratelimit::MessageRateLimiter;
use crate::validation::validate_message_content;

#[derive(Clone)]
pub struct WsState {
    pub txs: DashMap<String, Arc<broadcast::Sender<String>>>,
    // Track online users per room: room_id -> Vec<(user_id, email)>
    pub online_users: DashMap<String, Vec<(Uuid, String)>>,
    // Track active session IDs per room: room_id -> Set<session_id>
    pub active_sessions: DashMap<String, std::collections::HashSet<usize>>,
    // Rate limiter for messages
    pub rate_limiter: Arc<MessageRateLimiter>,
}

impl WsState {
    pub fn new() -> Self {
        Self { 
            txs: DashMap::new(),
            online_users: DashMap::new(),
            active_sessions: DashMap::new(),
            rate_limiter: Arc::new(MessageRateLimiter::new()),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum ClientMsg {
    #[serde(rename = "message")]
    Message { 
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        image_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to_id: Option<Uuid>,
    },
    #[serde(rename = "typing")]
    Typing { is_typing: bool },
    #[serde(rename = "mark_read")]
    MarkRead { message_ids: Vec<Uuid> },
    #[serde(rename = "delete_message")]
    DeleteMessage { message_id: Uuid },
    #[serde(rename = "edit_message")]
    EditMessage { 
        message_id: Uuid,
        new_content: String,
    },
    #[serde(rename = "add_reaction")]
    AddReaction {
        message_id: Uuid,
        emoji: String,
    },
    #[serde(rename = "remove_reaction")]
    RemoveReaction {
        message_id: Uuid,
        emoji: String,
    },
    #[serde(rename = "ping")]
    Ping,
    // WebRTC signaling messages
    #[serde(rename = "call-offer")]
    CallOffer {
        call_type: String,
        offer: serde_json::Value,
        target_user_id: Uuid,
        caller_username: String,
    },
    #[serde(rename = "call-answer")]
    CallAnswer {
        answer: serde_json::Value,
        target_user_id: Uuid,
    },
    #[serde(rename = "call-ice-candidate")]
    CallIceCandidate {
        candidate: serde_json::Value,
        target_user_id: Uuid,
    },
    #[serde(rename = "call-rejected")]
    CallRejected {
        target_user_id: Uuid,
    },
    #[serde(rename = "call-ended")]
    CallEnded {
        target_user_id: Uuid,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum ServerMsg {
    #[serde(rename = "message")]
    Message {
        id: Uuid,
        sender_id: Uuid,
        sender_email: String,
        content: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        image_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to_id: Option<Uuid>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to_content: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        reply_to_sender: Option<String>,
        created_at: String,
    },
    #[serde(rename = "typing")]
    Typing {
        user_id: Uuid,
        user_email: String,
        is_typing: bool,
    },
    #[serde(rename = "history")]
    History { messages: Vec<MessageHistory> },
    #[serde(rename = "online_users")]
    OnlineUsers { users: Vec<OnlineUser> },
    #[serde(rename = "read_receipt")]
    ReadReceipt { 
        message_id: Uuid,
        user_id: Uuid,
        user_email: String,
    },
    #[serde(rename = "message_deleted")]
    MessageDeleted { message_id: Uuid },
    #[serde(rename = "message_edited")]
    MessageEdited {
        message_id: Uuid,
        new_content: String,
        edited_at: String,
    },
    #[serde(rename = "reaction_added")]
    ReactionAdded {
        message_id: Uuid,
        user_id: Uuid,
        user_email: String,
        emoji: String,
    },
    #[serde(rename = "reaction_removed")]
    ReactionRemoved {
        message_id: Uuid,
        user_id: Uuid,
        emoji: String,
    },
    // WebRTC signaling messages
    #[serde(rename = "call-offer")]
    CallOffer {
        sender_id: Uuid,
        target_user_id: Uuid,
        call_type: String,
        offer: serde_json::Value,
        caller_username: String,
    },
    #[serde(rename = "call-answer")]
    CallAnswer {
        sender_id: Uuid,
        target_user_id: Uuid,
        answer: serde_json::Value,
    },
    #[serde(rename = "call-ice-candidate")]
    CallIceCandidate {
        sender_id: Uuid,
        target_user_id: Uuid,
        candidate: serde_json::Value,
    },
    #[serde(rename = "call-rejected")]
    CallRejected {
        sender_id: Uuid,
        target_user_id: Uuid,
    },
    #[serde(rename = "call-ended")]
    CallEnded {
        sender_id: Uuid,
        target_user_id: Uuid,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct OnlineUser {
    pub user_id: Uuid,
    pub email: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageHistory {
    pub id: Uuid,
    pub sender_id: Uuid,
    pub sender_email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sender_avatar: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_to_sender: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_by: Option<Vec<Uuid>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reactions: Option<Vec<MessageReaction>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MessageReaction {
    pub emoji: String,
    pub user_id: Uuid,
    pub user_email: String,
    pub created_at: String,
}

pub async fn ws_index(
    req: HttpRequest,
    stream: web::Payload,
    path: web::Path<String>,
    ws_state: web::Data<WsState>,
    pool: web::Data<PgPool>,
    jwt_keys: web::Data<JwtKeys>,
) -> Result<HttpResponse, Error> {
    let room_id = path.into_inner();
    
    let query = req.query_string();
    let token = query
        .split('&')
        .find(|param| param.starts_with("token="))
        .and_then(|param| param.strip_prefix("token="))
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing token"))?;

    let user_id = extract_user_id_from_token(token, &jwt_keys.decoding)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token"))?;

    let user_email = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool.get_ref())
        .await
        .map_err(|_| actix_web::error::ErrorUnauthorized("User not found"))?;

    if !ws_state.txs.contains_key(&room_id) {
        let (tx, _) = broadcast::channel(100);
        ws_state.txs.insert(room_id.clone(), Arc::new(tx));
    }

    let session = WsSession {
        id: 0,
        hb: Instant::now(),
        room_id: room_id.clone(),
        user_id,
        user_email,
        pool: pool.get_ref().clone(),
        ws_state: ws_state.clone(),
    };

    ws::start(session, &req, stream)
}

pub struct WsSession {
    id: usize,
    hb: Instant,
    room_id: String,
    user_id: Uuid,
    user_email: String,
    pool: PgPool,
    ws_state: web::Data<WsState>,
}

impl WsSession {
    fn hb(&self, ctx: &mut <Self as Actor>::Context) {
        ctx.run_interval(Duration::from_secs(5), |act, ctx| {
            if Instant::now().duration_since(act.hb) > Duration::from_secs(60) {
                log::warn!("[WS] Client {} heartbeat timeout, disconnecting", act.user_email);
                ctx.stop();
                return;
            }
            ctx.ping(b"");
        });
    }
}

impl Actor for WsSession {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        self.hb(ctx);

        log::info!("[WS] Client {} (session {}) connected to room {}", self.user_email, self.id, self.room_id);

        // Add session ID to active sessions
        {
            let mut sessions = self.ws_state.active_sessions.entry(self.room_id.clone()).or_insert_with(std::collections::HashSet::new);
            sessions.insert(self.id);
            log::info!("[WS] Session count for room {} is now: {}", self.room_id, sessions.len());
        }

        // Subscribe to broadcast channel FIRST before any async operations
        // Use Arc to ensure all subscriptions to the SAME sender
        if let Some(tx_arc) = self.ws_state.txs.get(&self.room_id) {
            println!("[WS] {} starting subscription to room {}", self.user_email, self.room_id);
            println!("[WS] Broadcast sender receiver_count BEFORE subscribe: {}", tx_arc.receiver_count());
            log::info!("[WS] {} attempting to subscribe to room {}", 
                self.user_email, self.room_id);
            let rx = tx_arc.subscribe();
            println!("[WS] Broadcast sender receiver_count AFTER subscribe: {}", tx_arc.receiver_count());
            let stream = BroadcastStream::new(rx);
            ctx.add_stream(stream.filter_map(|msg| {
                ready(msg.ok())
            }));
            println!("[WS] {} subscribed successfully, stream added to context", self.user_email);
            log::info!("[WS] {} subscribed successfully", self.user_email);
        } else {
            println!("[WS] {} FAILED to find tx for room {}", self.user_email, self.room_id);
            log::error!("[WS] {} FAILED to find tx for room {}", self.user_email, self.room_id);
        }

        // Add user to online users
        {
            let mut entry = self.ws_state.online_users
                .entry(self.room_id.clone())
                .or_insert_with(Vec::new);
            entry.push((self.user_id, self.user_email.clone()));
        }

        // Broadcast updated online users list
        let online_users: Vec<OnlineUser> = self.ws_state.online_users
            .get(&self.room_id)
            .map(|users| users.iter().map(|(id, email)| OnlineUser {
                user_id: *id,
                email: email.clone(),
            }).collect())
            .unwrap_or_default();
        
        let online_msg = ServerMsg::OnlineUsers { users: online_users };
        if let Ok(json) = serde_json::to_string(&online_msg) {
            if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                let _ = tx.send(json);
            }
        }

        // Load message history
        let pool = self.pool.clone();
        let room_id = self.room_id.clone();
        
        ctx.wait(
            Box::pin(async move {
                load_message_history(&pool, &room_id).await
            })
            .into_actor(self)
            .map(|history, _act, ctx| {
                if let Ok(messages) = history {
                    let history_msg = ServerMsg::History { messages };
                    if let Ok(json) = serde_json::to_string(&history_msg) {
                        ctx.text(json);
                    }
                }
            }),
        );
    }

    fn stopped(&mut self, _: &mut Self::Context) {
        log::info!("[WS] Client {} (session {}) disconnected from room {}", self.user_email, self.id, self.room_id);

        // Remove session ID from active sessions
        {
            if let Some(mut sessions) = self.ws_state.active_sessions.get_mut(&self.room_id) {
                sessions.remove(&self.id);
                log::info!("[WS] Session count for room {} is now: {}", self.room_id, sessions.len());
            }
        }

        // Remove user from online users
        if let Some(mut users) = self.ws_state.online_users.get_mut(&self.room_id) {
            users.retain(|(id, _)| *id != self.user_id);
        }

        // Broadcast updated online users list
        let online_users: Vec<OnlineUser> = self.ws_state.online_users
            .get(&self.room_id)
            .map(|users| users.iter().map(|(id, email)| OnlineUser {
                user_id: *id,
                email: email.clone(),
            }).collect())
            .unwrap_or_default();
        
        let online_msg = ServerMsg::OnlineUsers { users: online_users };
        if let Ok(json) = serde_json::to_string(&online_msg) {
            if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                let _ = tx.send(json);
            }
        }
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsSession {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                self.hb = Instant::now();
                ctx.pong(&msg);
            }
            Ok(ws::Message::Pong(_)) => {
                self.hb = Instant::now();
            }
            Ok(ws::Message::Text(text)) => {
                log::info!("[WS] Received text message from {}: {}", self.user_email, text);
                if let Ok(client_msg) = serde_json::from_str::<ClientMsg>(&text) {
                    match client_msg {
                        ClientMsg::Message { content, image_url, reply_to_id } => {
                            log::info!("[WS] Processing message from {} in room {}", self.user_email, self.room_id);
                            
                            // Check rate limit
                            if let Err(e) = self.ws_state.rate_limiter.check(&self.user_id.to_string()) {
                                log::warn!("[WS] Rate limit exceeded for {}: {}", self.user_email, e);
                                let error_msg = serde_json::json!({
                                    "type": "error",
                                    "message": "Too many messages. Please slow down."
                                });
                                ctx.text(error_msg.to_string());
                                return;
                            }
                            
                            // Validate and sanitize message content
                            let validated_content = match validate_message_content(&content) {
                                Ok(sanitized) => sanitized,
                                Err(e) => {
                                    log::warn!("[WS] Validation failed for {}: {}", self.user_email, e);
                                    let error_msg = serde_json::json!({
                                        "type": "error",
                                        "message": e.to_string()
                                    });
                                    ctx.text(error_msg.to_string());
                                    return;
                                }
                            };
                            
                            // Generate message ID and timestamp NOW (synchronously)
                            let msg_id = Uuid::new_v4();
                            let now = chrono::Utc::now();
                            
                            // Fetch reply info if needed (for broadcast with complete data)
                            let pool_for_reply = self.pool.clone();
                            let reply_to_id_for_fetch = reply_to_id;
                            
                            // Then do async operations (fetch reply + DB insert)
                            let pool = self.pool.clone();
                            let room_id = self.room_id.clone();
                            let user_id = self.user_id;
                            let user_email = self.user_email.clone();
                            let sender_id = self.user_id;
                            let ws_state = self.ws_state.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    // Fetch reply info first if reply_to_id exists
                                    let (reply_content, reply_sender) = if let Some(reply_id) = reply_to_id_for_fetch {
                                        let reply_info: Option<(String, String)> = sqlx::query_as(
                                            "SELECT m.content, u.email FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1"
                                        )
                                        .bind(reply_id)
                                        .fetch_optional(&pool_for_reply)
                                        .await
                                        .unwrap_or(None);
                                        
                                        if let Some((content, sender)) = reply_info {
                                            (Some(content), Some(sender))
                                        } else {
                                            (None, None)
                                        }
                                    } else {
                                        (None, None)
                                    };
                                    
                                    // NOW broadcast with complete reply info
                                    let complete_msg = ServerMsg::Message {
                                        id: msg_id,
                                        sender_id,
                                        sender_email: user_email.clone(),
                                        content: validated_content.clone(),
                                        image_url: image_url.clone(),
                                        reply_to_id: reply_to_id_for_fetch,
                                        reply_to_content: reply_content,
                                        reply_to_sender: reply_sender,
                                        created_at: now.to_rfc3339(),
                                    };
                                    
                                    if let Ok(json) = serde_json::to_string(&complete_msg) {
                                        if let Some(tx) = ws_state.txs.get(&room_id) {
                                            let session_count = ws_state.active_sessions.get(&room_id).map(|s| s.len()).unwrap_or(0);
                                            match tx.send(json) {
                                                Ok(n) => log::info!("[WS] Message broadcast sent to {} receivers (expected: {} active sessions)", n, session_count),
                                                Err(e) => log::error!("[WS] Message broadcast failed: {:?}", e),
                                            }
                                        }
                                    }
                                    
                                    // Then insert to DB
                                    let result = sqlx::query(
                                        "INSERT INTO messages (id, room_id, sender_id, content, image_url, reply_to_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)"
                                    )
                                    .bind(msg_id)
                                    .bind(&room_id)
                                    .bind(user_id)
                                    .bind(&validated_content)
                                    .bind(&image_url)
                                    .bind(reply_to_id_for_fetch)
                                    .bind(now)
                                    .execute(&pool)
                                    .await;
                                    
                                    if let Err(e) = result {
                                        log::error!("[WS] Failed to insert message to DB: {:?}", e);
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::Typing { is_typing } => {
                            let typing_msg = ServerMsg::Typing {
                                user_id: self.user_id,
                                user_email: self.user_email.clone(),
                                is_typing,
                            };
                            
                            if let Ok(json) = serde_json::to_string(&typing_msg) {
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    let _ = tx.send(json);
                                }
                            }
                        }
                        ClientMsg::MarkRead { message_ids } => {
                            log::info!("[WS] Processing MarkRead from {} in room {}", self.user_email, self.room_id);
                            
                            // BROADCAST IMMEDIATELY (seperti saat mengirim pesan)
                            // Kirim read receipt ke semua user SEBELUM DB insert
                            for msg_id in &message_ids {
                                let receipt_msg = ServerMsg::ReadReceipt {
                                    message_id: *msg_id,
                                    user_id: self.user_id,
                                    user_email: self.user_email.clone(),
                                };
                                
                                if let Ok(json) = serde_json::to_string(&receipt_msg) {
                                    if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                        let session_count = self.ws_state.active_sessions.get(&self.room_id).map(|s| s.len()).unwrap_or(0);
                                        match tx.send(json) {
                                            Ok(n) => {
                                                println!("[ReadReceipt] Broadcast sent to {} receivers (expected: {} active sessions)", n, session_count);
                                                log::info!("[ReadReceipt] Read receipt for {} broadcast to {} receivers", msg_id, n);
                                            }
                                            Err(e) => log::error!("[ReadReceipt] Broadcast failed: {:?}", e),
                                        }
                                    }
                                }
                            }
                            
                            // KEMUDIAN insert ke database secara async (tidak blokir broadcast)
                            let pool = self.pool.clone();
                            let user_id = self.user_id;
                            let message_ids_clone = message_ids.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    for msg_id in message_ids_clone {
                                        let result = sqlx::query(
                                            "INSERT INTO message_reads (message_id, user_id, read_at) VALUES ($1, $2, NOW()) ON CONFLICT (message_id, user_id) DO NOTHING"
                                        )
                                        .bind(msg_id)
                                        .bind(user_id)
                                        .execute(&pool)
                                        .await;
                                        
                                        if result.is_err() {
                                            log::error!("[ReadReceipt] Failed to insert read receipt for {}: {:?}", msg_id, result.err());
                                        }
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::DeleteMessage { message_id } => {
                            let pool = self.pool.clone();
                            let user_id = self.user_id;
                            let room_id = self.room_id.clone();
                            let ws_state = self.ws_state.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    // Only allow sender to delete their own message
                                    let result = sqlx::query(
                                        "UPDATE messages SET deleted_at = NOW() WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL"
                                    )
                                    .bind(message_id)
                                    .bind(user_id)
                                    .execute(&pool)
                                    .await;

                                    if result.is_ok() && result.unwrap().rows_affected() > 0 {
                                        let delete_msg = ServerMsg::MessageDeleted { message_id };
                                        if let Ok(json) = serde_json::to_string(&delete_msg) {
                                            if let Some(tx) = ws_state.txs.get(&room_id) {
                                                let _ = tx.send(json);
                                            }
                                        }
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::EditMessage { message_id, new_content } => {
                            log::info!("[WS] Processing EditMessage from {} for message {}", self.user_email, message_id);
                            
                            // Validate new content
                            let validated_content = match validate_message_content(&new_content) {
                                Ok(sanitized) => sanitized,
                                Err(e) => {
                                    log::warn!("[WS] Edit validation failed: {}", e);
                                    let error_msg = serde_json::json!({
                                        "type": "error",
                                        "message": e.to_string()
                                    });
                                    ctx.text(error_msg.to_string());
                                    return;
                                }
                            };
                            
                            let pool = self.pool.clone();
                            let user_id = self.user_id;
                            let room_id = self.room_id.clone();
                            let ws_state = self.ws_state.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    let now = chrono::Utc::now();
                                    
                                    // Only allow sender to edit their own message
                                    let result = sqlx::query(
                                        "UPDATE messages SET content = $1, edited_at = $2 WHERE id = $3 AND sender_id = $4 AND deleted_at IS NULL"
                                    )
                                    .bind(&validated_content)
                                    .bind(now)
                                    .bind(message_id)
                                    .bind(user_id)
                                    .execute(&pool)
                                    .await;

                                    if result.is_ok() && result.unwrap().rows_affected() > 0 {
                                        let edit_msg = ServerMsg::MessageEdited { 
                                            message_id,
                                            new_content: validated_content,
                                            edited_at: now.to_rfc3339(),
                                        };
                                        if let Ok(json) = serde_json::to_string(&edit_msg) {
                                            if let Some(tx) = ws_state.txs.get(&room_id) {
                                                let _ = tx.send(json);
                                            }
                                        }
                                    } else {
                                        log::warn!("[WS] Edit failed - message not found or not owned by user");
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::AddReaction { message_id, emoji } => {
                            log::info!("[WS] Adding reaction {} to message {}", emoji, message_id);
                            
                            let pool = self.pool.clone();
                            let user_id = self.user_id;
                            let user_email = self.user_email.clone();
                            let room_id = self.room_id.clone();
                            let ws_state = self.ws_state.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    let result = sqlx::query(
                                        "INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT (message_id, user_id, emoji) DO NOTHING"
                                    )
                                    .bind(message_id)
                                    .bind(user_id)
                                    .bind(&emoji)
                                    .execute(&pool)
                                    .await;

                                    if result.is_ok() && result.unwrap().rows_affected() > 0 {
                                        let reaction_msg = ServerMsg::ReactionAdded { 
                                            message_id,
                                            user_id,
                                            user_email,
                                            emoji,
                                        };
                                        if let Ok(json) = serde_json::to_string(&reaction_msg) {
                                            if let Some(tx) = ws_state.txs.get(&room_id) {
                                                let _ = tx.send(json);
                                            }
                                        }
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::RemoveReaction { message_id, emoji } => {
                            log::info!("[WS] Removing reaction {} from message {}", emoji, message_id);
                            
                            let pool = self.pool.clone();
                            let user_id = self.user_id;
                            let room_id = self.room_id.clone();
                            let ws_state = self.ws_state.clone();

                            ctx.wait(
                                Box::pin(async move {
                                    let result = sqlx::query(
                                        "DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3"
                                    )
                                    .bind(message_id)
                                    .bind(user_id)
                                    .bind(&emoji)
                                    .execute(&pool)
                                    .await;

                                    if result.is_ok() && result.unwrap().rows_affected() > 0 {
                                        let reaction_msg = ServerMsg::ReactionRemoved { 
                                            message_id,
                                            user_id,
                                            emoji,
                                        };
                                        if let Ok(json) = serde_json::to_string(&reaction_msg) {
                                            if let Some(tx) = ws_state.txs.get(&room_id) {
                                                let _ = tx.send(json);
                                            }
                                        }
                                    }
                                })
                                .into_actor(self)
                                .map(|_, _, _| {}),
                            );
                        }
                        ClientMsg::Ping => {
                            // Update heartbeat on ping from client
                            self.hb = Instant::now();
                            log::info!("[WS] Keepalive ping from {}", self.user_email);
                        }
                        // WebRTC Call Signaling
                        ClientMsg::CallOffer { call_type, offer, target_user_id, caller_username } => {
                            log::info!("[WebRTC] Call offer from {} (ID: {}) to {} in room {}", 
                                self.user_email, self.user_id, target_user_id, self.room_id);
                            let msg = ServerMsg::CallOffer {
                                sender_id: self.user_id,
                                target_user_id,
                                call_type: call_type.clone(),
                                offer,
                                caller_username,
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                log::info!("[WebRTC] Broadcasting offer to room {}: {}", self.room_id, &json[..json.len().min(200)]);
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    match tx.send(json) {
                                        Ok(receiver_count) => {
                                            log::info!("[WebRTC] Offer broadcasted to {} receivers", receiver_count);
                                        }
                                        Err(e) => {
                                            log::error!("[WebRTC] Failed to broadcast offer: {}", e);
                                        }
                                    }
                                } else {
                                    log::error!("[WebRTC] No broadcast channel found for room {}", self.room_id);
                                }
                            } else {
                                log::error!("[WebRTC] Failed to serialize call offer");
                            }
                        }
                        ClientMsg::CallAnswer { answer, target_user_id } => {
                            log::info!("[WebRTC] Call answer from {} to {}", self.user_email, target_user_id);
                            let msg = ServerMsg::CallAnswer { 
                                sender_id: self.user_id,
                                target_user_id,
                                answer 
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    let _ = tx.send(json);
                                }
                            }
                        }
                        ClientMsg::CallIceCandidate { candidate, target_user_id } => {
                            log::info!("[WebRTC] ICE candidate from {} to {}", self.user_email, target_user_id);
                            let msg = ServerMsg::CallIceCandidate { 
                                sender_id: self.user_id,
                                target_user_id,
                                candidate 
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    let _ = tx.send(json);
                                }
                            }
                        }
                        ClientMsg::CallRejected { target_user_id } => {
                            log::info!("[WebRTC] Call rejected by {}", self.user_email);
                            let msg = ServerMsg::CallRejected {
                                sender_id: self.user_id,
                                target_user_id,
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    let _ = tx.send(json);
                                }
                            }
                        }
                        ClientMsg::CallEnded { target_user_id } => {
                            log::info!("[WebRTC] Call ended by {}", self.user_email);
                            let msg = ServerMsg::CallEnded {
                                sender_id: self.user_id,
                                target_user_id,
                            };
                            if let Ok(json) = serde_json::to_string(&msg) {
                                if let Some(tx) = self.ws_state.txs.get(&self.room_id) {
                                    let _ = tx.send(json);
                                }
                            }
                        }
                    }
                }
            }
            Ok(ws::Message::Binary(_)) => {}
            Ok(ws::Message::Close(reason)) => {
                ctx.close(reason);
                ctx.stop();
            }
            _ => ctx.stop(),
        }
    }
}

impl StreamHandler<String> for WsSession {
    fn handle(&mut self, msg: String, ctx: &mut Self::Context) {
        println!("[WS] {} (session {}) received broadcast from channel", self.user_email, self.id);
        println!("[WS] Broadcast content preview: {}", &msg[..msg.len().min(100)]);
        log::info!("[WS] Forwarding broadcast to {}: {}", self.user_email, &msg[..msg.len().min(100)]);
        ctx.text(msg);
        println!("[WS] {} broadcast forwarded to WebSocket client", self.user_email);
    }
}

async fn load_message_history(pool: &PgPool, room_id: &str) -> Result<Vec<MessageHistory>, sqlx::Error> {
    let messages = sqlx::query_as::<_, (Uuid, Uuid, String, Option<String>, String, Option<String>, Option<Uuid>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>, Option<chrono::DateTime<chrono::Utc>>)>(
        "SELECT m.id, m.sender_id, u.email, u.avatar_url, m.content, m.image_url, m.reply_to_id, 
                replied.content AS reply_to_content, replied_user.email AS reply_to_sender, m.created_at, m.edited_at 
         FROM messages m 
         JOIN users u ON m.sender_id = u.id 
         LEFT JOIN messages replied ON m.reply_to_id = replied.id
         LEFT JOIN users replied_user ON replied.sender_id = replied_user.id
         WHERE m.room_id = $1 AND m.deleted_at IS NULL
         ORDER BY m.created_at DESC 
         LIMIT 100"
    )
    .bind(room_id)
    .fetch_all(pool)
    .await?;

    let mut result = Vec::new();
    
    for (id, sender_id, sender_email, sender_avatar, content, image_url, reply_to_id, reply_to_content, reply_to_sender, created_at, edited_at) in messages.into_iter().rev() {
        // Fetch read receipts for this message
        let read_by_ids = sqlx::query_scalar::<_, Uuid>(
            "SELECT user_id FROM message_reads WHERE message_id = $1"
        )
        .bind(id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        
        let read_by = if read_by_ids.is_empty() {
            None
        } else {
            Some(read_by_ids)
        };

        // Fetch reactions for this message
        let reactions_data = sqlx::query_as::<_, (String, Uuid, String, chrono::DateTime<chrono::Utc>)>(
            "SELECT r.emoji, r.user_id, u.email, r.created_at 
             FROM message_reactions r
             JOIN users u ON r.user_id = u.id
             WHERE r.message_id = $1
             ORDER BY r.created_at ASC"
        )
        .bind(id)
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let reactions = if reactions_data.is_empty() {
            None
        } else {
            Some(reactions_data.into_iter().map(|(emoji, user_id, user_email, created_at)| {
                MessageReaction {
                    emoji,
                    user_id,
                    user_email,
                    created_at: created_at.to_rfc3339(),
                }
            }).collect())
        };
        
        result.push(MessageHistory {
            id,
            sender_id,
            sender_email,
            sender_avatar,
            content,
            image_url,
            reply_to_id,
            reply_to_content,
            reply_to_sender,
            created_at: created_at.to_rfc3339(),
            read_by,
            edited_at: edited_at.map(|t| t.to_rfc3339()),
            reactions,
        });
    }
    
    Ok(result)
}

pub async fn get_messages(
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, actix_web::Error> {
    let room_id = path.into_inner();
    
    // Check if 'since' parameter is provided
    let messages = if let Some(since) = query.get("since") {
        // Fetch only messages created after 'since' timestamp
        let since_parsed = chrono::DateTime::parse_from_rfc3339(since)
            .unwrap_or(chrono::DateTime::<chrono::Utc>::from(std::time::SystemTime::UNIX_EPOCH).into());
        
        let rows = sqlx::query_as::<_, (Uuid, Uuid, String, Option<String>, String, Option<String>, Option<Uuid>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)>(
            "SELECT m.id, m.sender_id, u.email, u.avatar_url, m.content, m.image_url, m.reply_to_id, 
                    replied.content AS reply_to_content, replied_user.email AS reply_to_sender, m.created_at 
             FROM messages m 
             JOIN users u ON m.sender_id = u.id 
             LEFT JOIN messages replied ON m.reply_to_id = replied.id
             LEFT JOIN users replied_user ON replied.sender_id = replied_user.id
             WHERE m.room_id = $1 AND m.deleted_at IS NULL AND m.created_at > $2
             ORDER BY m.created_at ASC"
        )
        .bind(&room_id)
        .bind(since_parsed.naive_utc())
        .fetch_all(pool.get_ref())
        .await
        .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
        
        let mut result = Vec::new();
        for (id, sender_id, sender_email, sender_avatar, content, image_url, reply_to_id, reply_to_content, reply_to_sender, created_at) in rows {
            // Fetch read receipts for this message
            let read_by_ids = sqlx::query_scalar::<_, Uuid>(
                "SELECT user_id FROM message_reads WHERE message_id = $1"
            )
            .bind(id)
            .fetch_all(pool.get_ref())
            .await
            .unwrap_or_default();
            
            let read_by = if read_by_ids.is_empty() {
                None
            } else {
                Some(read_by_ids)
            };
            
            result.push(MessageHistory {
                id,
                sender_id,
                sender_email,
                sender_avatar,
                content,
                image_url,
                reply_to_id,
                reply_to_content,
                reply_to_sender,
                created_at: created_at.to_rfc3339(),
                read_by,
                edited_at: None,
                reactions: None,
            });
        }
        result
    } else {
        // Fetch all messages (default behavior)
        load_message_history(pool.get_ref(), &room_id)
            .await
            .map_err(|e| actix_web::error::ErrorInternalServerError(e))?
    };

    Ok(HttpResponse::Ok().json(messages))
}

pub async fn update_last_read(
    req: HttpRequest,
    path: web::Path<String>,
    pool: web::Data<PgPool>,
    jwt_keys: web::Data<JwtKeys>,
) -> Result<HttpResponse, actix_web::Error> {
    let room_id = path.into_inner();
    
    let token = req
        .query_string()
        .split('&')
        .find_map(|s| s.strip_prefix("token="))
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing token"))?;
    
    let user_id = crate::auth::extract_user_id_from_token(token, &jwt_keys.decoding)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token"))?;
    
    sqlx::query(
        "INSERT INTO room_users (user_id, room_id, last_read_at) 
         VALUES ($1, $2, now())
         ON CONFLICT (user_id, room_id) 
         DO UPDATE SET last_read_at = now()"
    )
    .bind(user_id)
    .bind(&room_id)
    .execute(pool.get_ref())
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({"success": true})))
}

pub async fn get_unread_counts(
    req: HttpRequest,
    pool: web::Data<PgPool>,
    jwt_keys: web::Data<JwtKeys>,
) -> Result<HttpResponse, actix_web::Error> {
    let token = req
        .headers()
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
        .ok_or_else(|| actix_web::error::ErrorUnauthorized("Missing token"))?;
    
    let user_id = crate::auth::extract_user_id_from_token(token, &jwt_keys.decoding)
        .map_err(|_| actix_web::error::ErrorUnauthorized("Invalid token"))?;
    
        // Return unread counts for previously visited rooms and direct messages that already target this user.
        let rows = sqlx::query_as::<_, (String, i64)>(
                "SELECT m.room_id, COUNT(m.id) as unread_count
                 FROM messages m
                 LEFT JOIN room_users ru
                     ON ru.room_id = m.room_id
                    AND ru.user_id = $1
                 WHERE m.sender_id != $1
                     AND m.deleted_at IS NULL
                     AND m.created_at > COALESCE(ru.last_read_at, to_timestamp(0))
                     AND (
                         ru.user_id IS NOT NULL
                         OR (m.room_id LIKE 'dm_%' AND m.room_id LIKE '%' || $1::text || '%')
                     )
                 GROUP BY m.room_id"
        )
    .bind(user_id)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;
    
    let mut unread_map = std::collections::HashMap::new();
    for (room_id, count) in rows {
        unread_map.insert(room_id, count);
    }
    
    Ok(HttpResponse::Ok().json(unread_map))
}

pub async fn search_messages(
    path: web::Path<String>,
    query: web::Query<std::collections::HashMap<String, String>>,
    pool: web::Data<PgPool>,
) -> Result<HttpResponse, actix_web::Error> {
    let room_id = path.into_inner();
    
    let search_query = query.get("q")
        .ok_or_else(|| actix_web::error::ErrorBadRequest("Missing 'q' parameter"))?;
    
    if search_query.trim().is_empty() {
        return Ok(HttpResponse::Ok().json(Vec::<MessageHistory>::new()));
    }

    let rows = sqlx::query_as::<_, (Uuid, Uuid, String, Option<String>, String, Option<String>, Option<Uuid>, Option<String>, Option<String>, chrono::DateTime<chrono::Utc>)>(
        "SELECT m.id, m.sender_id, u.email, u.avatar_url, m.content, m.image_url, m.reply_to_id, 
                replied.content AS reply_to_content, replied_user.email AS reply_to_sender, m.created_at 
         FROM messages m 
         JOIN users u ON m.sender_id = u.id 
         LEFT JOIN messages replied ON m.reply_to_id = replied.id
         LEFT JOIN users replied_user ON replied.sender_id = replied_user.id
         WHERE m.room_id = $1 
           AND m.deleted_at IS NULL 
           AND to_tsvector('english', m.content) @@ plainto_tsquery('english', $2)
         ORDER BY m.created_at DESC 
         LIMIT 50"
    )
    .bind(&room_id)
    .bind(search_query)
    .fetch_all(pool.get_ref())
    .await
    .map_err(|e| actix_web::error::ErrorInternalServerError(e))?;

    let mut messages: Vec<MessageHistory> = Vec::new();
    
    for (id, sender_id, sender_email, sender_avatar, content, image_url, reply_to_id, reply_to_content, reply_to_sender, created_at) in rows {
        // Fetch read receipts for this message
        let read_by_ids = sqlx::query_scalar::<_, Uuid>(
            "SELECT user_id FROM message_reads WHERE message_id = $1"
        )
        .bind(id)
        .fetch_all(pool.get_ref())
        .await
        .unwrap_or_default();
        
        let read_by = if read_by_ids.is_empty() {
            None
        } else {
            Some(read_by_ids)
        };
        
        messages.push(MessageHistory {
            id,
            sender_id,
            sender_email,
            sender_avatar,
            content,
            image_url,
            reply_to_id,
            reply_to_content,
            reply_to_sender,
            created_at: created_at.to_rfc3339(),
            read_by,
            edited_at: None,
            reactions: None,
        });
    }

    Ok(HttpResponse::Ok().json(messages))
}
