// Input validation untuk backend

pub const MESSAGE_MAX_LENGTH: usize = 10_000;
pub const MESSAGE_MIN_LENGTH: usize = 1;

#[derive(Debug)]
pub enum ValidationError {
    MessageTooLong,
    MessageTooShort,
    MessageEmpty,
    InvalidCharacters,
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationError::MessageTooLong => write!(f, "Message too long (max {} characters)", MESSAGE_MAX_LENGTH),
            ValidationError::MessageTooShort => write!(f, "Message too short (min {} characters)", MESSAGE_MIN_LENGTH),
            ValidationError::MessageEmpty => write!(f, "Message cannot be empty"),
            ValidationError::InvalidCharacters => write!(f, "Message contains invalid characters"),
        }
    }
}

pub fn validate_message_content(content: &str) -> Result<String, ValidationError> {
    // Check if empty or only whitespace
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err(ValidationError::MessageEmpty);
    }

    // Check length
    if content.len() > MESSAGE_MAX_LENGTH {
        return Err(ValidationError::MessageTooLong);
    }

    if trimmed.len() < MESSAGE_MIN_LENGTH {
        return Err(ValidationError::MessageTooShort);
    }

    // Remove null bytes and other control characters
    let sanitized = sanitize_message(content);

    // Check for invalid characters (null bytes should be gone now)
    if sanitized.contains('\0') {
        return Err(ValidationError::InvalidCharacters);
    }

    Ok(sanitized)
}

pub fn sanitize_message(content: &str) -> String {
    let mut sanitized = content.to_string();
    
    // Remove null bytes
    sanitized = sanitized.replace('\0', "");
    
    // Normalize excessive newlines (max 3 consecutive)
    while sanitized.contains("\n\n\n\n") {
        sanitized = sanitized.replace("\n\n\n\n", "\n\n\n");
    }
    
    // Remove zero-width characters
    sanitized = sanitized.replace('\u{200B}', ""); // Zero-width space
    sanitized = sanitized.replace('\u{200C}', ""); // Zero-width non-joiner
    sanitized = sanitized.replace('\u{200D}', ""); // Zero-width joiner
    sanitized = sanitized.replace('\u{FEFF}', ""); // Zero-width no-break space
    
    // Trim but preserve internal whitespace
    sanitized.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_message() {
        let result = validate_message_content("Hello, world!");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "Hello, world!");
    }

    #[test]
    fn test_empty_message() {
        let result = validate_message_content("");
        assert!(result.is_err());
    }

    #[test]
    fn test_whitespace_only() {
        let result = validate_message_content("   \n  \t  ");
        assert!(result.is_err());
    }

    #[test]
    fn test_too_long_message() {
        let long_message = "a".repeat(MESSAGE_MAX_LENGTH + 1);
        let result = validate_message_content(&long_message);
        assert!(result.is_err());
    }

    #[test]
    fn test_sanitize_null_bytes() {
        let result = sanitize_message("Hello\0World");
        assert_eq!(result, "HelloWorld");
    }

    #[test]
    fn test_sanitize_excessive_newlines() {
        let result = sanitize_message("Hello\n\n\n\n\n\nWorld");
        assert_eq!(result, "Hello\n\n\nWorld");
    }
}
