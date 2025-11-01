/**
 * WebSocket Manager with Auto-Reconnection
 * Production-ready WebSocket handler with automatic reconnection logic
 */

export interface WebSocketManagerOptions {
  url: string;
  maxReconnectAttempts?: number;
  reconnectInterval?: number;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Event) => void;
  onMessage?: (data: any) => void;
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
  onMaxReconnectAttemptsReached?: () => void;
}

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private maxReconnectAttempts: number;
  private reconnectInterval: number;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | undefined;
  private pingInterval: number | undefined;
  private intentionalClose = false;
  private options: WebSocketManagerOptions;

  constructor(options: WebSocketManagerOptions) {
    this.options = options;
    this.url = options.url;
    this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
    this.reconnectInterval = options.reconnectInterval || 3000;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WS] Already connected or connecting');
      return;
    }

    console.log('[WS] Connecting to:', this.url);
    this.intentionalClose = false;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[WS] Connected successfully');
      this.reconnectAttempts = 0; // Reset on successful connection
      this.options.onOpen?.();
      this.startPing();
      
      if (this.reconnectAttempts > 0) {
        this.options.onReconnected?.();
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WS] Disconnected:', event.code, event.reason);
      this.stopPing();
      this.options.onClose?.(event);

      // Only reconnect if not intentionally closed
      if (!this.intentionalClose) {
        this.attemptReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WS] Error:', error);
      this.options.onError?.(error);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.options.onMessage?.(data);
      } catch (err) {
        console.error('[WS] Failed to parse message:', err);
      }
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS] Max reconnection attempts reached');
      this.options.onMaxReconnectAttemptsReached?.();
      return;
    }

    this.reconnectAttempts++;
    console.log(`[WS] Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    this.options.onReconnecting?.(this.reconnectAttempts);

    // Exponential backoff: wait longer after each failed attempt
    const delay = Math.min(this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
    
    this.reconnectTimeout = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
    }, 3000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    console.warn('[WS] Cannot send - not connected');
    return false;
  }

  close() {
    console.log('[WS] Closing connection intentionally');
    this.intentionalClose = true;
    this.stopPing();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
