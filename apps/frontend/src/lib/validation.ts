/**
 * Input Validation Utilities
 * Validates and sanitizes user input before sending to backend
 */

export const VALIDATION_RULES = {
  MESSAGE_MAX_LENGTH: 10000,
  MESSAGE_MIN_LENGTH: 1,
  FILE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  IMAGE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  RATE_LIMIT_MESSAGES_PER_MINUTE: 30,
};

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate message content
 */
export function validateMessage(content: string): ValidationError | null {
  if (!content || content.trim().length === 0) {
    return { field: 'content', message: 'Message cannot be empty' };
  }

  if (content.length > VALIDATION_RULES.MESSAGE_MAX_LENGTH) {
    return { 
      field: 'content', 
      message: `Message too long (max ${VALIDATION_RULES.MESSAGE_MAX_LENGTH} characters)` 
    };
  }

  return null;
}

/**
 * Sanitize message content
 * Removes potentially harmful content while preserving user intent
 */
export function sanitizeMessage(content: string): string {
  // Trim whitespace
  let sanitized = content.trim();
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');
  
  // Normalize line breaks (max 3 consecutive)
  sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');
  
  // Remove invisible/zero-width characters (except normal spaces and line breaks)
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  
  return sanitized;
}

/**
 * Validate image file
 */
export function validateImage(file: File): ValidationError | null {
  if (!VALIDATION_RULES.ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { 
      field: 'image', 
      message: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP' 
    };
  }

  if (file.size > VALIDATION_RULES.IMAGE_MAX_SIZE) {
    return { 
      field: 'image', 
      message: `Image too large (max ${VALIDATION_RULES.IMAGE_MAX_SIZE / 1024 / 1024}MB)` 
    };
  }

  return null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Rate limiter for client-side message throttling
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private limit: number;
  private windowMs: number;

  constructor(limit: number = VALIDATION_RULES.RATE_LIMIT_MESSAGES_PER_MINUTE, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Check if action is allowed
   */
  checkLimit(): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);
    
    if (this.timestamps.length >= this.limit) {
      const oldestTimestamp = this.timestamps[0];
      const retryAfter = Math.ceil((oldestTimestamp + this.windowMs - now) / 1000);
      return { allowed: false, retryAfter };
    }
    
    this.timestamps.push(now);
    return { allowed: true };
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.timestamps = [];
  }

  /**
   * Get remaining quota
   */
  getRemainingQuota(): number {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(ts => now - ts < this.windowMs);
    return Math.max(0, this.limit - this.timestamps.length);
  }
}

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Validate and sanitize URL
 */
export function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}
