/**
 * Error Handling Utilities
 * Centralized error handling with user-friendly messages
 */

export interface AppError {
  type: 'network' | 'validation' | 'auth' | 'server' | 'unknown';
  message: string;
  details?: string;
  retryable: boolean;
}

/**
 * Parse error from various sources into AppError
 */
export function parseError(error: any): AppError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Network error. Please check your connection.',
      retryable: true,
    };
  }

  // HTTP errors
  if (error.response) {
    const status = error.response.status;
    
    if (status === 401 || status === 403) {
      return {
        type: 'auth',
        message: 'Session expired. Please login again.',
        retryable: false,
      };
    }
    
    if (status === 429) {
      return {
        type: 'server',
        message: 'Too many requests. Please slow down.',
        retryable: true,
      };
    }
    
    if (status >= 500) {
      return {
        type: 'server',
        message: 'Server error. Please try again later.',
        details: error.response.statusText,
        retryable: true,
      };
    }
    
    return {
      type: 'server',
      message: error.response.data?.message || 'An error occurred',
      details: error.response.statusText,
      retryable: false,
    };
  }

  // WebSocket errors
  if (error.type === 'error' && error.target instanceof WebSocket) {
    return {
      type: 'network',
      message: 'Connection lost. Reconnecting...',
      retryable: true,
    };
  }

  // Validation errors
  if (error.field) {
    return {
      type: 'validation',
      message: error.message || 'Invalid input',
      retryable: false,
    };
  }

  // Default
  return {
    type: 'unknown',
    message: error.message || 'An unexpected error occurred',
    details: error.toString(),
    retryable: false,
  };
}

/**
 * Toast notification system
 */
export class ToastManager {
  private container: HTMLDivElement | null = null;
  private toasts: Map<string, HTMLDivElement> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    if (typeof document === 'undefined') return;
    
    this.container = document.createElement('div');
    this.container.id = 'toast-container';
    this.container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-width: 400px;
    `;
    document.body.appendChild(this.container);
  }

  show(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration: number = 5000) {
    if (!this.container) return;

    const id = Date.now().toString() + Math.random().toString(36);
    const toast = document.createElement('div');
    
    const colors = {
      success: { bg: '#10b981', text: '#ffffff' },
      error: { bg: '#ef4444', text: '#ffffff' },
      info: { bg: '#3b82f6', text: '#ffffff' },
      warning: { bg: '#f59e0b', text: '#ffffff' },
    };
    
    const color = colors[type];
    
    toast.style.cssText = `
      background: ${color.bg};
      color: ${color.text};
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      animation: slideIn 0.3s ease-out;
      max-width: 100%;
      word-break: break-word;
    `;
    
    const messageEl = document.createElement('span');
    messageEl.textContent = message;
    messageEl.style.flex = '1';
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: ${color.text};
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.8';
    closeBtn.onclick = () => this.remove(id);
    
    toast.appendChild(messageEl);
    toast.appendChild(closeBtn);
    
    this.container.appendChild(toast);
    this.toasts.set(id, toast);
    
    // Auto remove
    if (duration > 0) {
      setTimeout(() => this.remove(id), duration);
    }
    
    return id;
  }

  remove(id: string) {
    const toast = this.toasts.get(id);
    if (toast && this.container) {
      toast.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => {
        if (this.container?.contains(toast)) {
          this.container.removeChild(toast);
        }
        this.toasts.delete(id);
      }, 300);
    }
  }

  success(message: string, duration?: number) {
    return this.show(message, 'success', duration);
  }

  error(message: string, duration?: number) {
    return this.show(message, 'error', duration);
  }

  info(message: string, duration?: number) {
    return this.show(message, 'info', duration);
  }

  warning(message: string, duration?: number) {
    return this.show(message, 'warning', duration);
  }
}

// Add CSS animations
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

// Export singleton instance
export const toast = new ToastManager();
