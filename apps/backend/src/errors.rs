use actix_web::{HttpResponse, ResponseError};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Unauthorized")]
    Unauthorized,
    #[error("BadRequest: {0}")]
    BadRequest(String),
    #[error("NotFound")]
    NotFound,
    #[error("InternalServerError")]
    Internal,
}

#[derive(Serialize)]
struct ErrorResponse { message: String }

impl ResponseError for AppError {
    fn error_response(&self) -> HttpResponse {
        let status = match self {
            AppError::Unauthorized => actix_web::http::StatusCode::UNAUTHORIZED,
            AppError::BadRequest(_) => actix_web::http::StatusCode::BAD_REQUEST,
            AppError::NotFound => actix_web::http::StatusCode::NOT_FOUND,
            AppError::Internal => actix_web::http::StatusCode::INTERNAL_SERVER_ERROR,
        };
        HttpResponse::build(status).json(ErrorResponse { message: self.to_string() })
    }
}
