/**
 * Global Notification Service
 * Handles notifications across the entire app, even when specific pages are not open
 */

import { showNotification as showPWANotification } from './pwa';

// Preload notification sound globally
const notificationAudio = new Audio('/notification/notification.mp3');
notificationAudio.volume = 0.5;
notificationAudio.preload = 'auto';

/**
 * Play notification sound
 */
export function playNotificationSound() {
  try {
    const audio = notificationAudio.cloneNode(true) as HTMLAudioElement;
    audio.volume = 0.5;
    audio.play().catch(err => {
      console.log('[Notification] Sound play failed:', err.message);
    });
  } catch (err) {
    console.error('[Notification] Failed to play audio:', err);
  }
}

/**
 * Show notification with sound
 */
export function showMessageNotification(
  title: string, 
  body: string, 
  options?: {
    roomId?: string;
    messageId?: string;
    tag?: string;
    silent?: boolean;
  }
) {
  // Play sound unless silent
  if (!options?.silent) {
    playNotificationSound();
  }

  // Show notification via PWA (works in background)
  showPWANotification(title, {
    body: body.length > 100 ? body.substring(0, 100) + '...' : body,
    icon: '/icon-192x192.png',
    badge: '/icon-72x72.png',
    tag: options?.tag || `chat-${options?.roomId || 'general'}-${options?.messageId || Date.now()}`,
    requireInteraction: false,
    silent: true, // We handle sound ourselves
    data: {
      roomId: options?.roomId,
      messageId: options?.messageId,
      timestamp: Date.now(),
    },
  });
}

/**
 * Request notification permission if not already granted
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.log('[Notification] Not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    console.log('[Notification] Permission:', permission);
    return permission === 'granted';
  }

  return false;
}

/**
 * Setup global WebSocket for notifications (works on any page)
 */
let globalWS: WebSocket | null = null;
let reconnectTimeout: number | null = null;

function getWSUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8080/ws`;
  }
  return `${protocol}//${hostname}:8080/ws`;
}

export function initGlobalNotifications(userId: string, currentRoomId?: string) {
  if (!userId) {
    console.log('[Global Notification] No user ID, skipping');
    return;
  }

  // Close existing connection
  if (globalWS) {
    globalWS.close();
    globalWS = null;
  }

  // Clear reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }

  console.log('[Global Notification] Initializing...');

  try {
    globalWS = new WebSocket(getWSUrl());

    globalWS.onopen = () => {
      console.log('[Global Notification] Connected');
      // Join a "global" room to receive all notifications
      if (globalWS) {
        globalWS.send(JSON.stringify({
          type: 'join',
          room_id: '__notifications__', // Special room for global notifications
        }));
      }
    };

    globalWS.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Only handle messages, not from current user, not in current room
        if (msg.type === 'message' && msg.sender_id !== userId) {
          // Don't show notification if we're already in that room
          if (msg.room_id && msg.room_id !== currentRoomId) {
            showMessageNotification(
              `💬 ${msg.sender_email}`,
              msg.content || '[Image]',
              {
                roomId: msg.room_id,
                messageId: msg.id,
              }
            );
          }
        }
      } catch (err) {
        console.error('[Global Notification] Failed to parse message:', err);
      }
    };

    globalWS.onerror = (error) => {
      console.error('[Global Notification] WebSocket error:', error);
    };

    globalWS.onclose = () => {
      console.log('[Global Notification] Disconnected');
      globalWS = null;
      
      // Reconnect after 5 seconds
      reconnectTimeout = window.setTimeout(() => {
        console.log('[Global Notification] Reconnecting...');
        initGlobalNotifications(userId, currentRoomId);
      }, 5000);
    };
  } catch (err) {
    console.error('[Global Notification] Failed to create WebSocket:', err);
  }
}

/**
 * Update current room ID (to avoid duplicate notifications)
 */
export function updateCurrentRoom(roomId: string | null) {
  // This would need to be implemented with a global state management
  // For now, we'll keep it simple
  console.log('[Global Notification] Current room:', roomId);
}

/**
 * Cleanup global notifications
 */
export function cleanupGlobalNotifications() {
  if (globalWS) {
    globalWS.close();
    globalWS = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  console.log('[Global Notification] Cleaned up');
}
