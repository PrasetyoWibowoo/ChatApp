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
  console.log('[showMessageNotification] Called with:', { title, body, options });
  
  // Play sound unless silent
  if (!options?.silent) {
    console.log('[showMessageNotification] Playing sound...');
    playNotificationSound();
  } else {
    console.log('[showMessageNotification] Sound skipped (silent mode)');
  }

  // Check permission first
  if (Notification.permission !== 'granted') {
    console.warn('[showMessageNotification] Permission not granted:', Notification.permission);
    return;
  }

  console.log('[showMessageNotification] Showing notification via PWA...');
  
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
  
  console.log('[showMessageNotification] Notification request sent');
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
 * Listens to multiple rooms for cross-room notifications
 */
let globalWS: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let currentUserId: string = '';
let currentRoomId: string | undefined = undefined;

function getWSUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8080/ws`;
  }
  return `${protocol}//${hostname}:8080/ws`;
}

export function initGlobalNotifications(userId: string, activeRoomId?: string) {
  if (!userId) {
    console.log('[Global Notification] No user ID, skipping');
    return;
  }

  currentUserId = userId;
  currentRoomId = activeRoomId;

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

  console.log('[Global Notification] Initializing for user:', userId);

  // Get user's rooms from localStorage
  const savedRooms = localStorage.getItem('myRooms');
  let userRooms: string[] = ['general']; // Default to general room
  
  if (savedRooms) {
    try {
      const rooms = JSON.parse(savedRooms);
      userRooms = rooms.map((r: any) => r.id);
      if (userRooms.length === 0) {
        userRooms = ['general'];
      }
    } catch (e) {
      console.error('[Global Notification] Failed to parse rooms:', e);
    }
  }

  console.log('[Global Notification] Monitoring rooms:', userRooms);

  // Connect to each room to listen for messages
  // We'll use general room as primary listener since backend broadcasts to all rooms
  connectToRoom('general');
}

function connectToRoom(roomId: string) {
  try {
    const ws = new WebSocket(getWSUrl());

    ws.onopen = () => {
      console.log('[Global Notification] Connected to room:', roomId);
      ws.send(JSON.stringify({
        type: 'join',
        room_id: roomId,
      }));
      globalWS = ws;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[Global Notification] Received message:', {
          type: msg.type,
          room: roomId,
          sender_id: msg.sender_id?.substring(0, 8),
          content_preview: msg.content?.substring(0, 30),
          currentUserId: currentUserId?.substring(0, 8),
          currentRoomId: currentRoomId
        });
        
        // Only handle new messages from other users
        if (msg.type === 'message' && msg.sender_id && msg.sender_id !== currentUserId) {
          console.log('[Global Notification] Message from other user detected');
          
          // Don't show notification if we're in that room
          const msgRoomId = msg.room_id || roomId;
          console.log('[Global Notification] Comparing rooms:', { msgRoomId, currentRoomId });
          
          if (msgRoomId !== currentRoomId) {
            console.log('[Global Notification] ✅ Different room - Showing notification');
            showMessageNotification(
              `💬 ${msg.sender_email || 'New Message'}`,
              msg.content || '[Image]',
              {
                roomId: msgRoomId,
                messageId: msg.id,
              }
            );
          } else {
            console.log('[Global Notification] ❌ Same room - Skipping notification');
          }
        } else if (msg.type === 'message') {
          console.log('[Global Notification] Message skipped:', {
            reason: msg.sender_id === currentUserId ? 'own message' : 'no sender_id',
            sender_id: msg.sender_id?.substring(0, 8)
          });
        }
      } catch (err) {
        console.error('[Global Notification] Failed to parse message:', err);
      }
    };

    ws.onerror = (error) => {
      console.error('[Global Notification] WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('[Global Notification] Disconnected from room:', roomId);
      globalWS = null;
      
      // Reconnect after 5 seconds
      reconnectTimeout = window.setTimeout(() => {
        console.log('[Global Notification] Reconnecting to room:', roomId);
        initGlobalNotifications(currentUserId, currentRoomId);
      }, 5000);
    };
  } catch (err) {
    console.error('[Global Notification] Failed to create WebSocket:', err);
  }
}

/**
 * Update current room ID (to avoid duplicate notifications)
 */
export function updateCurrentRoom(roomId: string | undefined) {
  currentRoomId = roomId;
  console.log('[Global Notification] Current room updated to:', roomId);
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

/**
 * Test notification from console
 * Usage: window.testNotification()
 */
export function testNotification() {
  console.log('[Test] Permission:', Notification.permission);
  
  if (Notification.permission !== 'granted') {
    console.error('[Test] Please grant notification permission first');
    Notification.requestPermission().then(permission => {
      console.log('[Test] Permission result:', permission);
    });
    return;
  }
  
  console.log('[Test] Showing test notification...');
  showMessageNotification(
    '🧪 Test Notification',
    'This is a test message from console',
    {
      roomId: 'test',
      messageId: 'test-' + Date.now(),
    }
  );
  console.log('[Test] Test notification triggered');
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).testNotification = testNotification;
  (window as any).checkNotificationPermission = () => {
    console.log('Notification.permission:', Notification.permission);
    console.log('Service Worker:', 'serviceWorker' in navigator ? 'supported' : 'not supported');
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      console.log('Service Worker controller:', navigator.serviceWorker.controller.state);
    }
  };
}
