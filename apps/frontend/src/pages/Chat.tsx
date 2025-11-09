import { onCleanup, onMount, createSignal, createMemo, For, Show } from 'solid-js';
import EmojiPicker from '../components/EmojiPicker';
import CallInterface from '../components/CallInterface';
import { SmileIcon, ImageIcon, SendIcon, LinkIcon, CheckIcon, CheckDoubleIcon, ReplyIcon, TrashIcon, SearchIcon, EditIcon, PhoneIcon, VideoIcon } from '../components/Icons';
import { getDisplayName, getInitials } from '../lib/displayName';
import { webrtcService } from '../lib/webrtc';
import { playNotificationSound, showMessageNotification, ensureNotificationPermission, updateCurrentRoom } from '../lib/notifications';

function getApiBaseUrl() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8080';
  }
  return `http://${hostname}:8080`;
}

interface MessageReaction {
  emoji: string;
  user_id: string;
  user_email: string;
  created_at: string;
}

interface Message {
  id: string;
  sender_id: string;
  sender_email: string;
  sender_avatar?: string;
  content: string;
  image_url?: string;
  reply_to_id?: string;
  reply_to_content?: string;
  reply_to_sender?: string;
  created_at: string;
  read_by?: string[];
  edited_at?: string;
  reactions?: MessageReaction[];
  pinned?: boolean;
}

interface OnlineUser {
  user_id: string;
  email: string;
}

export default function Chat() {
  const roomId = (() => {
    const parts = window.location.pathname.split('/');
    return parts[2] || 'general';
  })();
  
  const [status, setStatus] = createSignal<string>('disconnected');
  const [messages, setMessages] = createSignal<Message[]>([]);
  const [input, setInput] = createSignal('');
  const [typing, setTyping] = createSignal<string>('');
  const [showCopied, setShowCopied] = createSignal(false);
  const [showEmojiPicker, setShowEmojiPicker] = createSignal(false);
  const [imagePreview, setImagePreview] = createSignal<string | null>(null);
  const [onlineUsers, setOnlineUsers] = createSignal<OnlineUser[]>([]);
  // Track read receipts: messageId -> Set of user_ids who read it
  const [readReceipts, setReadReceipts] = createSignal<Map<string, Set<string>>>(new Map());
  // Version counter to force re-render when read receipts change
  const [readReceiptsVersion, setReadReceiptsVersion] = createSignal(0);
  // Reply state
  const [replyingTo, setReplyingTo] = createSignal<Message | null>(null);
  // Edit state
  const [editingMessage, setEditingMessage] = createSignal<Message | null>(null);
  const [editInput, setEditInput] = createSignal('');
  // Reaction picker state
  const [showReactionPicker, setShowReactionPicker] = createSignal<string | null>(null);
  const [reactionPickerPos, setReactionPickerPos] = createSignal<{x: number, y: number} | null>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = createSignal<{x: number, y: number, message: Message} | null>(null);
  const [longPressTimer, setLongPressTimer] = createSignal<number | null>(null);
  // Pin message state
  const [pinnedMessages, setPinnedMessages] = createSignal<Set<string>>(new Set());
  const [showCopiedToast, setShowCopiedToast] = createSignal(false);
  // Search state
  const [searchQuery, setSearchQuery] = createSignal('');
  const [searchResults, setSearchResults] = createSignal<Message[]>([]);
  const [showSearch, setShowSearch] = createSignal(false);
  // Call user selection state
  const [showCallMenu, setShowCallMenu] = createSignal(false);
  const [callMenuType, setCallMenuType] = createSignal<'voice' | 'video'>('voice');
  
  let ws: WebSocket | null = null;
  let messagesContainer: HTMLDivElement | undefined;
  let typingTimeout: any;
  let myUserId = '';
  let myAvatar = '';
  let fileInputRef: HTMLInputElement | undefined;

  onMount(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    
    myAvatar = localStorage.getItem('avatar_url') || '';

    // Decode token to get user ID FIRST (needed for WebRTC filtering)
    try {
      const payload = JSON.parse(atob(token!.split('.')[1]));
      myUserId = payload.sub || '';
      console.log('[Chat] My User ID:', myUserId);
    } catch (e) {
      console.error('[Chat] Failed to decode token:', e);
    }

    // Load pinned messages from localStorage
    try {
      const savedPins = localStorage.getItem(`pinned_${roomId}`);
      if (savedPins) {
        const parsed: string[] = JSON.parse(savedPins);
        setPinnedMessages(new Set(parsed));
      }
    } catch (err) {
      console.error('[Pin] Failed to load pinned messages:', err);
    }

    // Request notification permission
    ensureNotificationPermission().then(granted => {
      if (granted) {
        console.log('[Chat] Notification permission granted');
      }
    });

    // Update current room for global notifications (don't show notif for this room)
    updateCurrentRoom(roomId);
    console.log('[Chat] Current room set to:', roomId);

    // Save room to localStorage for "My Rooms" list
    const saveRoomToList = () => {
      const savedRooms = localStorage.getItem('myRooms');
      let rooms = [];
      try {
        rooms = savedRooms ? JSON.parse(savedRooms) : [];
      } catch (e) {
        rooms = [];
      }
      
      const exists = rooms.find((r: any) => r.id === roomId);
      if (!exists) {
        const newRoom = {
          id: roomId,
          name: roomId === 'general' ? 'General Chat' : 
                roomId === 'team' ? 'Team Chat' :
                roomId === 'support' ? 'Support' : roomId,
          timestamp: new Date().toISOString(),
        };
        rooms = [newRoom, ...rooms];
        localStorage.setItem('myRooms', JSON.stringify(rooms));
      }
    };
    
    saveRoomToList();

    // Auto-detect API base from current hostname
    const getApiBase = () => {
      if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL as string;
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      
      // Ensure localhost stays localhost
      if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:8080';
      }
      
      return `${protocol}//${hostname}:8080`;
    };
    
    const apiBase = getApiBase();
    let wsUrl: string;
    
    try {
      const u = new URL(apiBase);
      u.protocol = u.protocol.replace('http', 'ws');
      u.pathname = '/ws/rooms/' + roomId;
      u.search = '';
      wsUrl = u.toString();
    } catch {
      wsUrl = (apiBase.startsWith('https') ? apiBase.replace('https', 'wss') : apiBase.replace('http', 'ws')) + `/ws/rooms/${roomId}`;
    }

    const fullUrl = wsUrl + `?token=${encodeURIComponent(token || '')}`;
    console.log('[Chat] Connecting to:', fullUrl);
    
    setStatus('connecting');
    ws = new WebSocket(fullUrl);

    // Keep connection alive with periodic ping
    let pingInterval: number | undefined;

    ws.onopen = () => {
      console.log('[Chat] Connected to room:', roomId);
      setStatus('connected');
      
      // Set WebSocket for WebRTC service - FIXED: Pass ws instance safely
      if (ws) {
        webrtcService.setWebSocket(ws, roomId);
        console.log('[WebRTC] Service connected to WebSocket');
      }
      
      // Mark room as read when entering
      fetch(`${apiBase}/api/rooms/${roomId}/read?token=${encodeURIComponent(token || '')}`, {
        method: 'POST',
      }).catch(err => console.error('Failed to mark room as read:', err));
      
      // Send ping every 30 seconds to keep connection alive (reduced frequency)
      pingInterval = window.setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onclose = (event) => {
      console.log('[Chat] Disconnected', event.code, event.reason);
      console.log('[Chat] Disconnect details:', {
        wasClean: event.wasClean,
        code: event.code,
        reason: event.reason,
        timestamp: new Date().toISOString()
      });
      setStatus('disconnected');
      if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = undefined;
      }
      if (event.code === 1006) {
        console.error('[Chat] Abnormal closure - might be due to large message');
      }
    };

    ws.onerror = (error) => {
      console.error('[Chat] WebSocket error:', error);
      setStatus('disconnected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        
        // Log ALL WebRTC-related messages for debugging
        if (msg.type && msg.type.startsWith('call-')) {
          console.log('[WebRTC] RAW Message received:', JSON.stringify(msg));
        }

        if (msg.type === 'history') {
          const historyMessages = msg.messages || [];
          
          // Populate read receipts from history BEFORE setting messages
          setReadReceipts((prev) => {
            const newMap = new Map(prev);
            historyMessages.forEach((histMsg: Message) => {
              if (histMsg.read_by && histMsg.read_by.length > 0) {
                newMap.set(histMsg.id, new Set(histMsg.read_by));
              }
            });
            return newMap;
          });
          
          // Now set messages AFTER read receipts are populated
          setMessages(historyMessages);
          
          setTimeout(() => {
            scrollToBottom();
            markMessagesAsRead();
          }, 100);
        } else if (msg.type === 'message') {
          // Play sound for new messages from others
          if (msg.sender_id !== myUserId) {
            playNotificationSound();
          }
          
          setMessages((prev) => [...prev, {
            id: msg.id,
            sender_id: msg.sender_id,
            sender_email: msg.sender_email,
            sender_avatar: msg.sender_avatar,
            content: msg.content,
            image_url: msg.image_url,
            reply_to_id: msg.reply_to_id,
            reply_to_content: msg.reply_to_content,
            reply_to_sender: msg.reply_to_sender,
            created_at: msg.created_at,
            read_by: msg.read_by || [],
          }]);
          setTimeout(() => {
            scrollToBottom();
            markMessagesAsRead();
          }, 50);
        } else if (msg.type === 'typing') {
          if (msg.sender_id !== myUserId) {
            if (msg.is_typing) {
              setTyping(msg.sender_email + ' is typing...');
              clearTimeout(typingTimeout);
              typingTimeout = setTimeout(() => setTyping(''), 3000);
            } else {
              setTyping('');
            }
          }
        } else if (msg.type === 'online_users') {
          console.log('[Chat] Online users received:', msg.users);
          setOnlineUsers(msg.users || []);
        } else if (msg.type === 'read_receipt') {
          setReadReceipts((prev) => {
            const newMap = new Map(prev);
            const existingReaders = newMap.get(msg.message_id);
            const readers: Set<string> = existingReaders ? new Set(existingReaders) : new Set();
            readers.add(msg.user_id);
            newMap.set(msg.message_id, readers);
            return newMap;
          });
          setReadReceiptsVersion(v => v + 1);
        } else if (msg.type === 'message_deleted') {
          setMessages((prev) => prev.filter(m => m.id !== msg.message_id));
        } else if (msg.type === 'message_edited') {
          setMessages((prev) => prev.map(m => 
            m.id === msg.message_id 
              ? { ...m, content: msg.new_content, edited_at: msg.edited_at }
              : m
          ));
          if (editingMessage()?.id === msg.message_id) {
            setEditingMessage(null);
            setEditInput('');
          }
        } else if (msg.type === 'reaction_added') {
          setMessages((prev) => prev.map(m => {
            if (m.id === msg.message_id) {
              const reactions = m.reactions || [];
              const existing = reactions.find(r => r.user_id === msg.user_id && r.emoji === msg.emoji);
              if (!existing) {
                return {
                  ...m,
                  reactions: [...reactions, {
                    emoji: msg.emoji,
                    user_id: msg.user_id,
                    user_email: msg.user_email,
                    created_at: new Date().toISOString(),
                  }]
                };
              }
            }
            return m;
          }));
        } else if (msg.type === 'reaction_removed') {
          setMessages((prev) => prev.map(m => {
            if (m.id === msg.message_id) {
              const reactions = (m.reactions || []).filter(
                r => !(r.user_id === msg.user_id && r.emoji === msg.emoji)
              );
              return { ...m, reactions: reactions.length > 0 ? reactions : undefined };
            }
            return m;
          }));
        } else if (msg.type === 'call-offer') {
          // Only handle if this message is for me
          console.log('[WebRTC] Offer received - sender:', msg.sender_id, 'target:', msg.target_user_id, 'myId:', myUserId);
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] ✅ Incoming call from', msg.callerUsername);
            (window as any).__pendingCallOffer = msg.offer;
            webrtcService.handleCallOffer(msg.offer, msg.callType, msg.sender_id, msg.callerUsername);
          } else {
            console.log('[WebRTC] ❌ Offer not for me, ignoring');
          }
        } else if (msg.type === 'call-answer') {
          // Only handle if this message is for me
          console.log('[WebRTC] Answer received - sender:', msg.sender_id, 'target:', msg.target_user_id, 'myId:', myUserId);
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] ✅ Call answered');
            webrtcService.handleCallAnswer(msg.answer);
          } else {
            console.log('[WebRTC] ❌ Answer not for me, ignoring');
          }
        } else if (msg.type === 'call-ice-candidate') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] ✅ ICE candidate received');
            webrtcService.handleIceCandidate(msg.candidate);
          }
        } else if (msg.type === 'call-rejected') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] ✅ Call rejected');
            alert('Call rejected');
            webrtcService.endCall();
          }
        } else if (msg.type === 'call-ended') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] ✅ Call ended by remote user');
            webrtcService.endCall();
          }
        }
      } catch (e) {
        console.error('[Chat] Parse error:', e);
      }
    };

    // Polling for new messages every 5 seconds as fallback (reduced frequency)
    const pollInterval = setInterval(async () => {
      if (!token || status() !== 'connected') return;
      
      try {
        const lastMessageTime = messages().length > 0 
          ? messages()[messages().length - 1].created_at 
          : new Date(0).toISOString();
        
        const response = await fetch(`${apiBase}/api/rooms/${roomId}/messages?since=${encodeURIComponent(lastMessageTime)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const newMessages = await response.json();
          if (newMessages && newMessages.length > 0) {
            // Populate read receipts from polled messages
            let hasNewReceipts = false;
            setReadReceipts((prev) => {
              const newMap = new Map(prev);
              newMessages.forEach((pollMsg: Message) => {
                if (pollMsg.read_by && pollMsg.read_by.length > 0) {
                  newMap.set(pollMsg.id, new Set(pollMsg.read_by));
                  hasNewReceipts = true;
                }
              });
              return newMap;
            });
            if (hasNewReceipts) {
              setReadReceiptsVersion(v => v + 1);
            }
            
            // Show desktop notification for messages from others
            const messagesFromOthers = newMessages.filter((msg: Message) => msg.sender_id !== myUserId);
            if (messagesFromOthers.length > 0) {
              const latestMsg = messagesFromOthers[messagesFromOthers.length - 1];
              showDesktopNotification(
                latestMsg.sender_email,
                latestMsg.content || '[Image]',
                latestMsg.id
              );
            }
            
            setMessages(prev => [...prev, ...newMessages]);
            setTimeout(() => {
              scrollToBottom();
              markMessagesAsRead();
            }, 100);
          }
        }
      } catch (err) {
        // Silently fail - WebSocket is primary method
      }
    }, 5000);

    // Close context menu on scroll
    const handleScroll = () => {
      closeContextMenu();
      setShowReactionPicker(null);
    };
    messagesContainer?.addEventListener('scroll', handleScroll);

    onCleanup(() => {
      if (ws) ws.close();
      clearTimeout(typingTimeout);
      clearInterval(pollInterval);
      messagesContainer?.removeEventListener('scroll', handleScroll);
      const timer = longPressTimer();
      if (timer) clearTimeout(timer);
      // Reset current room when leaving
      updateCurrentRoom(undefined);
    });
  });

  // Move onCleanup declaration (SolidJS requires it outside onMount)
  const _cleanupMoved = true;

  const scrollToBottom = () => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  };

  const markMessagesAsRead = async () => {
    console.log('[MarkRead] Called, WS state:', ws?.readyState, 'OPEN=', WebSocket.OPEN, 'myUserId:', myUserId?.substring(0,8));
    
    if (!ws || ws.readyState !== WebSocket.OPEN || !myUserId) {
      console.log('[MarkRead] ⚠️ WebSocket not ready, skipping');
      return;
    }

    console.log('[MarkRead] Total messages:', messages().length);
    const unreadMessages = messages().filter(msg => {
      // Only mark others' messages as read
      if (msg.sender_id === myUserId) return false;
      // Check if already read by me
      const readers = readReceipts().get(msg.id);
      return !readers || !readers.has(myUserId);
    });

    console.log('[MarkRead] Found', unreadMessages.length, 'unread messages:', unreadMessages.map(m => `${m.id.substring(0,8)} from ${m.sender_id.substring(0,8)}`));
    
    if (unreadMessages.length > 0) {
      const payload = {
        type: 'mark_read',
        message_ids: unreadMessages.map(m => m.id),
      };
      console.log('[MarkRead] Sending to server:', JSON.stringify(payload));
      ws.send(JSON.stringify(payload));
      
      // Update last_read_at in database
      const token = localStorage.getItem('token');
      const apiBase = getApiBaseUrl();
      try {
        await fetch(`${apiBase}/api/rooms/${roomId}/read?token=${encodeURIComponent(token || '')}`, {
          method: 'POST',
        });
      } catch (err) {
        console.error('Failed to update last_read:', err);
      }
    }
  };

  const sendMessage = (e: Event) => {
    e.preventDefault();
    const text = input().trim();
    const image = imagePreview();
    const reply = replyingTo();
    
    if ((!text && !image) || !ws || ws.readyState !== WebSocket.OPEN) return;

    const messageData: any = {
      type: 'message',
      content: text || '',
    };

    if (image) {
      messageData.image_url = image;
    }

    if (reply) {
      messageData.reply_to_id = reply.id;
    }

    try {
      const payload = JSON.stringify(messageData);
      console.log('[Send] Message size:', Math.round(payload.length / 1024), 'KB');
      ws.send(payload);
      
      setInput('');
      setImagePreview(null);
      setReplyingTo(null);
      
      // Stop typing indicator
      ws.send(JSON.stringify({
        type: 'typing',
        is_typing: false,
      }));
    } catch (error) {
      console.error('[Send] Failed to send message:', error);
      alert('Failed to send message. The image might be too large.');
    }
  };

  const sendEditMessage = (e: Event) => {
    e.preventDefault();
    const message = editingMessage();
    const text = editInput().trim();
    
    if (!message || !text || !ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({
        type: 'edit_message',
        message_id: message.id,
        new_content: text,
      }));
      
      setEditingMessage(null);
      setEditInput('');
    } catch (error) {
      console.error('[Send] Failed to edit message:', error);
      alert('Failed to edit message');
    }
  };

  const startEditMessage = (message: Message) => {
    setEditingMessage(message);
    setEditInput(message.content);
    // Close reaction picker if open
    setShowReactionPicker(null);
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditInput('');
  };

  const addReaction = (messageId: string, emoji: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({
        type: 'add_reaction',
        message_id: messageId,
        emoji: emoji,
      }));
      setShowReactionPicker(null);
    } catch (error) {
      console.error('[Send] Failed to add reaction:', error);
    }
  };

  const removeReaction = (messageId: string, emoji: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    try {
      ws.send(JSON.stringify({
        type: 'remove_reaction',
        message_id: messageId,
        emoji: emoji,
      }));
    } catch (error) {
      console.error('[Send] Failed to remove reaction:', error);
    }
  };

  const handleContextMenu = (e: MouseEvent, message: Message) => {
    e.preventDefault();
    
    // Calculate menu position to prevent overflow
    const menuWidth = 200; // Approximate width of context menu
    const menuHeight = 300; // Approximate height of context menu (adjust based on items)
    const padding = 10; // Padding from edges
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Adjust horizontal position if menu would overflow right
    if (x + menuWidth > window.innerWidth - padding) {
      x = window.innerWidth - menuWidth - padding;
    }
    
    // Adjust vertical position if menu would overflow bottom
    if (y + menuHeight > window.innerHeight - padding) {
      y = window.innerHeight - menuHeight - padding;
    }
    
    // Ensure menu doesn't go off top or left
    if (x < padding) x = padding;
    if (y < padding) y = padding;
    
    setContextMenu({ x, y, message });
    setShowReactionPicker(null);
  };

  const handleLongPressStart = (e: TouchEvent, message: Message) => {
    const timer = setTimeout(() => {
      const touch = e.touches[0];
      
      // Calculate menu position for touch
      const menuWidth = 200;
      const menuHeight = 300;
      const padding = 10;
      
      let x = touch.clientX;
      let y = touch.clientY;
      
      if (x + menuWidth > window.innerWidth - padding) {
        x = window.innerWidth - menuWidth - padding;
      }
      if (y + menuHeight > window.innerHeight - padding) {
        y = window.innerHeight - menuHeight - padding;
      }
      if (x < padding) x = padding;
      if (y < padding) y = padding;
      
      setContextMenu({ x, y, message });
      setShowReactionPicker(null);
    }, 500) as unknown as number;
    setLongPressTimer(timer);
  };

  const handleLongPressEnd = () => {
    const timer = longPressTimer();
    if (timer) {
      clearTimeout(timer);
      setLongPressTimer(null);
    }
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const copyMessage = (message: Message) => {
    const textToCopy = message.content || '';
    navigator.clipboard.writeText(textToCopy).then(() => {
      setShowCopiedToast(true);
      setTimeout(() => setShowCopiedToast(false), 2000);
    }).catch(err => {
      console.error('[Copy] Failed to copy message:', err);
    });
    closeContextMenu();
  };

  const togglePinMessage = (messageId: string) => {
    console.log('[Pin] Toggle pin for message:', messageId);
    setPinnedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        console.log('[Pin] Unpinning message:', messageId);
        newSet.delete(messageId);
      } else {
        console.log('[Pin] Pinning message:', messageId);
        newSet.add(messageId);
      }
      console.log('[Pin] Current pinned messages:', Array.from(newSet));
      // Save to localStorage
      localStorage.setItem(`pinned_${roomId}`, JSON.stringify(Array.from(newSet)));
      return newSet;
    });
    closeContextMenu();
  };

  const onInputChange = (val: string) => {
    setInput(val);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'typing',
        is_typing: val.length > 0,
      }));
    }
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      // Check if date is valid
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const shareRoom = () => {
    const link = `${window.location.origin}/chat/${roomId}`;
    navigator.clipboard.writeText(link);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2000);
  };

  const addEmoji = (emoji: string) => {
    setInput(input() + emoji);
  };

  const handleImageSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB untuk avoid WebSocket disconnect)
    if (file.size > 2 * 1024 * 1024) {
      alert('Image size must be less than 2MB');
      return;
    }

    // Resize and compress image
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Resize if too large (max 600px width for smaller base64)
        const maxWidth = 600;
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG with 0.6 quality for smaller size
        let compressedDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        
        // Check if result is too big (>200KB base64 for WebSocket stability)
        if (compressedDataUrl.length > 200 * 1024) {
          // Try with even lower quality
          compressedDataUrl = canvas.toDataURL('image/jpeg', 0.3);
          if (compressedDataUrl.length > 200 * 1024) {
            alert('Image is too large. Please choose a smaller image (max ~150KB after compression).');
            return;
          }
        }
        
        console.log('[Image] Compressed size:', Math.round(compressedDataUrl.length / 1024), 'KB');
        setImagePreview(compressedDataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImagePreview(null);
    if (fileInputRef) fileInputRef.value = '';
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const searchMessages = async () => {
    const query = searchQuery().trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/api/rooms/${roomId}/search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const scrollToMessage = (messageId: string) => {
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    
    // Wait for search overlay to close
    setTimeout(() => {
      const element = document.getElementById(`msg-${messageId}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.style.backgroundColor = 'rgba(52, 183, 241, 0.3)';
        setTimeout(() => {
          element.style.backgroundColor = '';
        }, 2000);
      }
    }, 100);
  };

  const showDesktopNotification = (senderEmail: string, message: string, messageId: string) => {
    // Use global notification service
    showMessageNotification(
      `💬 ${senderEmail}`,
      message,
      {
        roomId,
        messageId,
        silent: !document.hidden, // Don't play sound if tab is visible (already playing)
      }
    );
  };

  const deleteMessage = (messageId: string) => {
    if (!confirm('Delete this message?')) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'delete_message',
      message_id: messageId,
    }));
  };

  return (
    <>
      <div class="chat-topbar">
        <div class="chat-topbar-inner">
          <div class="brand">
            Chat - {roomId}
            <button 
              onClick={shareRoom} 
              class="btn btn-ghost"
              style={{ 'margin-left': '0.5rem', 'font-size': '0.9rem', 'display': 'inline-flex', 'align-items': 'center', 'gap': '0.25rem' }}
              title="Share room link"
            >
              <LinkIcon />
              {showCopied() ? 'Copied!' : 'Share'}
            </button>
          </div>
          <div class="spacer" />
          <button 
            class="btn btn-ghost icon-btn"
            onClick={() => {
              setCallMenuType('voice');
              setShowCallMenu(true);
            }}
            title="Start voice call"
          >
            <PhoneIcon />
          </button>
          <button 
            class="btn btn-ghost icon-btn"
            onClick={() => {
              setCallMenuType('video');
              setShowCallMenu(true);
            }}
            title="Start video call"
          >
            <VideoIcon />
          </button>
          <button 
            class="btn btn-ghost icon-btn"
            onClick={() => setShowSearch(true)}
            title="Search messages"
          >
            <SearchIcon />
          </button>
          <div class="online-status" title={onlineUsers().map(u => u.email).join(', ')}>
            <span class="dot ok"></span>
            {onlineUsers().length} online
          </div>
          <div class="status">
            <span class={"dot " + (status() === 'connected' ? 'ok' : '')}></span>
            {status()}
          </div>
          <a class="btn btn-ghost" href="/create-room">New Room</a>
          <a class="btn btn-ghost" href="/">Home</a>
          {myAvatar ? (
            <img src={myAvatar} alt="You" style="width: 36px; height: 36px; border-radius: 50%; border: 2px solid var(--border); margin-left: 8px;" />
          ) : (
            <div class="avatar-placeholder" style="width: 36px; height: 36px; margin-left: 8px; display: inline-flex;">{localStorage.getItem('email')?.substring(0, 2).toUpperCase()}</div>
          )}
        </div>
      </div>

      <div class="chat-container">
        {/* Pinned Messages Section */}
        <Show when={(() => {
          const pinned = messages().filter(m => pinnedMessages().has(m.id));
          return pinned.length > 0;
        })()}>
          <div style={{
            background: 'rgba(255, 166, 87, 0.1)',
            'border-bottom': '1px solid rgba(255, 166, 87, 0.3)',
            padding: '8px 16px',
            'font-size': '13px',
            color: '#ffa657',
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
            'flex-wrap': 'wrap',
          }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9.828 1.172a.5.5 0 0 1 0 .707l-1.293 1.293.707.707a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0zM9.828 8a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5h3z"/>
            </svg>
            <span style={{ 'font-weight': '600' }}>{messages().filter(m => pinnedMessages().has(m.id)).length} pinned message(s)</span>
            <For each={messages().filter(m => pinnedMessages().has(m.id))}>
              {(pinnedMsg) => (
                <button
                  onClick={() => {
                    const element = document.getElementById(`msg-${pinnedMsg.id}`);
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      // Highlight effect
                      element.style.animation = 'highlight 1s ease';
                      setTimeout(() => {
                        element.style.animation = '';
                      }, 1000);
                    }
                  }}
                  style={{
                    background: 'rgba(255, 166, 87, 0.2)',
                    border: '1px solid rgba(255, 166, 87, 0.4)',
                    'border-radius': '12px',
                    padding: '6px 12px',
                    color: '#ffa657',
                    cursor: 'pointer',
                    'font-size': '12px',
                    transition: 'all 0.2s',
                    display: 'flex',
                    'flex-direction': 'column',
                    'align-items': 'flex-start',
                    gap: '2px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 166, 87, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 166, 87, 0.2)';
                  }}
                  title={`From: ${getDisplayName(pinnedMsg.sender_email)}\nID: ${pinnedMsg.id.substring(0, 8)}`}
                >
                  <div style={{ 'font-size': '10px', opacity: 0.8 }}>
                    {getDisplayName(pinnedMsg.sender_email)} • {new Date(pinnedMsg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div>
                    {pinnedMsg.content.substring(0, 30)}{pinnedMsg.content.length > 30 ? '...' : ''}
                  </div>
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="messages-container" ref={messagesContainer}>
          <For each={messages()} fallback={<div>Loading...</div>}>
            {(msg) => {
              const isMe = msg.sender_id === myUserId;
              const initials = getInitials(msg.sender_email);
              
              return (
                <div 
                  class={"message-row " + (isMe ? 'me' : 'other')} 
                  id={`msg-${msg.id}`}
                  onContextMenu={(e) => handleContextMenu(e, msg)}
                  onTouchStart={(e) => handleLongPressStart(e, msg)}
                  onTouchEnd={handleLongPressEnd}
                  onTouchMove={handleLongPressEnd}
                >
                  {!isMe && (
                    <div class="message-avatar">
                      {msg.sender_avatar ? (
                        <img src={msg.sender_avatar} alt={msg.sender_email} />
                      ) : (
                        <div class="avatar-placeholder">{initials}</div>
                      )}
                    </div>
                  )}
                  <div class="message-bubble" style={{ 
                    'border-left': pinnedMessages().has(msg.id) ? '4px solid #ffa657' : undefined,
                    'padding-left': pinnedMessages().has(msg.id) ? '12px' : undefined,
                  }}>
                    {pinnedMessages().has(msg.id) && (
                      <div style={{ 
                        'font-size': '11px', 
                        color: '#ffa657', 
                        'font-weight': '600',
                        'margin-bottom': '4px',
                        display: 'flex',
                        'align-items': 'center',
                        gap: '4px',
                      }}>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M9.828 1.172a.5.5 0 0 1 0 .707l-1.293 1.293.707.707a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0zM9.828 8a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5h3z"/>
                        </svg>
                        <span>Pinned</span>
                        <span style={{ opacity: 0.6, 'font-size': '9px', 'font-weight': '400' }}>
                          (ID: {msg.id.substring(0, 8)})
                        </span>
                      </div>
                    )}
                    {!isMe && <div class="sender-name">{getDisplayName(msg.sender_email)}</div>}
                    
                    {msg.reply_to_content && (
                      <div class="reply-preview">
                        <div class="reply-preview-sender">{msg.reply_to_sender ? getDisplayName(msg.reply_to_sender) : 'Unknown'}</div>
                        <div class="reply-preview-content">{msg.reply_to_content.substring(0, 50)}{msg.reply_to_content.length > 50 ? '...' : ''}</div>
                      </div>
                    )}

                    {msg.image_url && (
                      <div class="message-image">
                        <img src={msg.image_url} alt="Shared image" />
                      </div>
                    )}
                    
                    <Show when={editingMessage()?.id === msg.id} fallback={
                      <>
                        {msg.content && <div class="message-content">{msg.content}</div>}
                        {msg.edited_at && <div class="edited-badge" style={{ 'font-size': '11px', color: '#8b949e', 'margin-top': '2px' }}>(edited)</div>}
                      </>
                    }>
                      <div class="edit-message-form">
                        <textarea
                          value={editInput()}
                          onInput={(e) => setEditInput(e.currentTarget.value)}
                          class="edit-textarea"
                          style={{ width: '100%', padding: '8px', 'border-radius': '6px', border: '1px solid #30363d', background: '#0d1117', color: '#c9d1d9', 'font-family': 'inherit', resize: 'vertical', 'min-height': '60px' }}
                        />
                        <div style={{ display: 'flex', gap: '8px', 'margin-top': '8px' }}>
                          <button onClick={sendEditMessage} type="button" style={{ padding: '4px 12px', 'border-radius': '6px', border: 'none', background: '#238636', color: 'white', cursor: 'pointer' }}>Save</button>
                          <button onClick={cancelEdit} type="button" style={{ padding: '4px 12px', 'border-radius': '6px', border: 'none', background: '#21262d', color: '#c9d1d9', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </div>
                    </Show>

                    {/* Reactions */}
                    <Show when={msg.reactions && msg.reactions.length > 0}>
                      <div class="message-reactions" style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px', 'margin-top': '6px' }}>
                        <For each={(() => {
                          // Group reactions by emoji
                          const grouped = new Map<string, {emoji: string, users: Array<{id: string, email: string}>}>();
                          (msg.reactions || []).forEach(r => {
                            if (!grouped.has(r.emoji)) {
                              grouped.set(r.emoji, { emoji: r.emoji, users: [] });
                            }
                            grouped.get(r.emoji)!.users.push({ id: r.user_id, email: r.user_email });
                          });
                          return Array.from(grouped.values());
                        })()}>
                          {(reactionGroup) => {
                            const hasReacted = reactionGroup.users.some(u => u.id === myUserId);
                            return (
                              <button
                                class="reaction-bubble"
                                onClick={() => hasReacted ? removeReaction(msg.id, reactionGroup.emoji) : addReaction(msg.id, reactionGroup.emoji)}
                                title={reactionGroup.users.map(u => u.email).join(', ')}
                                style={{
                                  padding: '2px 8px',
                                  'border-radius': '12px',
                                  border: hasReacted ? '1px solid #238636' : '1px solid #30363d',
                                  background: hasReacted ? '#0d4429' : '#161b22',
                                  color: '#c9d1d9',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  'align-items': 'center',
                                  gap: '4px',
                                  'font-size': '13px',
                                }}
                              >
                                <span>{reactionGroup.emoji}</span>
                                <span style={{ 'font-size': '11px', color: '#8b949e' }}>{reactionGroup.users.length}</span>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </Show>
                    
                    <div class="message-time">
                      {formatTime(msg.created_at)}
                      {isMe && (() => {
                        // Access signals directly to trigger reactivity
                        const _ = readReceiptsVersion();
                        const allReceipts = readReceipts();
                        const readers = allReceipts.get(msg.id);
                        const readersArray = readers ? Array.from(readers) : [];
                        const otherReaders = readersArray.filter(readerId => readerId !== msg.sender_id);
                        const readStatus = otherReaders.length > 0;
                        
                        console.log(`[RENDER] Msg ${msg.id.substring(0,8)}: sender=${msg.sender_id.substring(0,8)}, readers=[${readersArray.map(r => r.substring(0,8)).join(',')}], otherReaders=[${otherReaders.map(r => r.substring(0,8)).join(',')}], isRead=${readStatus}, version=${_}`);
                        return (
                          <span class="read-receipt" style={{ 'margin-left': '6px', color: readStatus ? '#34b7f1' : '#8b949e' }}>
                            {readStatus ? <CheckDoubleIcon /> : <CheckIcon />}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            }}
          </For>
          {typing() && <div class="typing-indicator">{typing()}</div>}
        </div>

        <Show when={replyingTo()}>
          <div class="reply-bar">
            <div class="reply-bar-content">
              <div class="reply-bar-icon"><ReplyIcon /></div>
              <div>
                <div class="reply-bar-sender">{replyingTo()?.sender_email ? getDisplayName(replyingTo()!.sender_email) : 'Unknown'}</div>
                <div class="reply-bar-text">{replyingTo()?.content?.substring(0, 50)}{(replyingTo()?.content?.length || 0) > 50 ? '...' : ''}</div>
              </div>
            </div>
            <button class="reply-bar-close" onClick={cancelReply} type="button">×</button>
          </div>
        </Show>

        <Show when={imagePreview()}>
          <div class="image-preview-container">
            <div class="image-preview">
              <img src={imagePreview()!} alt="Preview" />
              <button class="remove-image-btn" onClick={removeImage} type="button">×</button>
            </div>
          </div>
        </Show>

        {/* Context Menu */}
        <Show when={contextMenu()}>
          {(menu) => {
            const msg = menu().message;
            const isMe = msg.sender_id === myUserId;
            return (
              <>
                <div 
                  class="context-menu-overlay" 
                  onClick={closeContextMenu}
                  style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    'z-index': 1000,
                  }}
                />
                <div 
                  class="context-menu"
                  style={{
                    position: 'fixed',
                    top: `${menu().y}px`,
                    left: `${menu().x}px`,
                    background: '#161b22',
                    border: '1px solid #30363d',
                    'border-radius': '8px',
                    'box-shadow': '0 8px 24px rgba(0,0,0,0.5)',
                    'z-index': 1001,
                    'min-width': '180px',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    class="context-menu-item"
                    onClick={() => {
                      setReplyingTo(msg);
                      closeContextMenu();
                    }}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      'font-size': '14px',
                      'text-align': 'left',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <ReplyIcon />
                    <span>Reply</span>
                  </button>

                  <button
                    class="context-menu-item"
                    onClick={() => copyMessage(msg)}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      'font-size': '14px',
                      'text-align': 'left',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/>
                      <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/>
                    </svg>
                    <span>Copy Message</span>
                  </button>

                  <button
                    class="context-menu-item"
                    onClick={() => togglePinMessage(msg.id)}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      'font-size': '14px',
                      'text-align': 'left',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      {pinnedMessages().has(msg.id) ? (
                        <path d="M9.828 2.172a.5.5 0 0 1 0 .707L8.536 4.172l.707.707a.5.5 0 0 1 0 .707L8.536 6.293a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0z"/>
                      ) : (
                        <path d="M9.828 1.172a.5.5 0 0 1 0 .707l-1.293 1.293.707.707a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0zM9.828 8a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5h3z"/>
                      )}
                    </svg>
                    <span>{pinnedMessages().has(msg.id) ? 'Unpin Message' : 'Pin Message'}</span>
                  </button>

                  <button
                    class="context-menu-item"
                    onClick={() => {
                      setShowReactionPicker(msg.id);
                      setReactionPickerPos({ x: menu().x, y: menu().y });
                      closeContextMenu();
                    }}
                    style={{
                      display: 'flex',
                      'align-items': 'center',
                      gap: '12px',
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: '#c9d1d9',
                      cursor: 'pointer',
                      'font-size': '14px',
                      'text-align': 'left',
                      transition: 'background 0.2s',
                      'border-top': '1px solid #30363d',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <span style={{ 'font-size': '18px' }}>😊</span>
                    <span>Add Reaction</span>
                  </button>

                  <Show when={isMe}>
                    <button
                      class="context-menu-item"
                      onClick={() => {
                        startEditMessage(msg);
                        closeContextMenu();
                      }}
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#c9d1d9',
                        cursor: 'pointer',
                        'font-size': '14px',
                        'text-align': 'left',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <EditIcon />
                      <span>Edit</span>
                    </button>

                    <button
                      class="context-menu-item"
                      onClick={() => {
                        deleteMessage(msg.id);
                        closeContextMenu();
                      }}
                      style={{
                        display: 'flex',
                        'align-items': 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '10px 16px',
                        background: 'none',
                        border: 'none',
                        color: '#f85149',
                        cursor: 'pointer',
                        'font-size': '14px',
                        'text-align': 'left',
                        transition: 'background 0.2s',
                        'border-top': '1px solid #30363d',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                    >
                      <TrashIcon />
                      <span>Delete</span>
                    </button>
                  </Show>
                </div>
              </>
            );
          }}
        </Show>

        {/* Reaction Picker - Outside context menu scope */}
        <Show when={showReactionPicker() && reactionPickerPos()}>
          <>
            <div 
              class="reaction-picker-overlay"
              onClick={() => {
                setShowReactionPicker(null);
                setReactionPickerPos(null);
              }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                'z-index': 1002,
              }}
            />
            <div 
              class="reaction-picker"
              style={{
                position: 'fixed',
                top: `${reactionPickerPos()!.y + 40}px`,
                left: `${reactionPickerPos()!.x}px`,
                background: '#161b22',
                border: '1px solid #30363d',
                'border-radius': '8px',
                padding: '8px',
                display: 'flex',
                gap: '4px',
                'box-shadow': '0 8px 24px rgba(0,0,0,0.5)',
                'z-index': 1003,
              }}
            >
              <For each={['👍', '❤️', '😂', '😮', '😢', '🎉']}>
                {(emoji) => (
                  <button
                    onClick={() => {
                      const msgId = showReactionPicker();
                      if (msgId) {
                        addReaction(msgId, emoji);
                      }
                      setShowReactionPicker(null);
                      setReactionPickerPos(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      'font-size': '24px',
                      cursor: 'pointer',
                      padding: '4px',
                      'border-radius': '4px',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                  >
                    {emoji}
                  </button>
                )}
              </For>
            </div>
          </>
        </Show>

        {/* Copied Toast */}
        <Show when={showCopiedToast()}>
          <div style={{
            position: 'fixed',
            bottom: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#238636',
            color: 'white',
            padding: '10px 20px',
            'border-radius': '8px',
            'box-shadow': '0 4px 12px rgba(0,0,0,0.3)',
            'z-index': 2000,
            animation: 'fadeInOut 2s ease-in-out',
            'font-size': '14px',
            'font-weight': '500',
          }}>
            ✓ Message copied!
          </div>
        </Show>

        <form class="input-container" onSubmit={sendMessage}>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handleImageSelect}
            style="display: none;"
          />
          
          <button 
            class="btn btn-ghost icon-btn"
            type="button"
            onClick={() => fileInputRef?.click()}
            disabled={status() !== 'connected'}
            title="Upload image"
          >
            <ImageIcon />
          </button>

          <button 
            class="btn btn-ghost icon-btn"
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker())}
            disabled={status() !== 'connected'}
            title="Add emoji"
          >
            <SmileIcon />
          </button>

          <input
            class="message-input"
            type="text"
            placeholder="Type a message..."
            value={input()}
            onInput={(e) => onInputChange(e.currentTarget.value)}
            disabled={status() !== 'connected'}
          />
          
          <button 
            class="btn btn-primary send-btn" 
            type="submit"
            disabled={status() !== 'connected' || (!input().trim() && !imagePreview())}
            title="Send message"
          >
            <SendIcon />
          </button>
        </form>
      </div>

      <Show when={showEmojiPicker()}>
        <EmojiPicker 
          onSelect={addEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      </Show>

      <Show when={showSearch()}>
        <div class="search-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setShowSearch(false);
        }}>
          <div class="search-panel">
            <div class="search-header">
              <input
                class="search-input"
                type="text"
                placeholder="Search messages..."
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  searchMessages();
                }}
                autofocus
              />
              <button 
                class="btn btn-ghost"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery('');
                  setSearchResults([]);
                }}
              >
                Close
              </button>
            </div>
            <div class="search-results">
              <Show when={searchResults().length > 0}>
                <p class="search-count">{searchResults().length} result{searchResults().length !== 1 ? 's' : ''} found</p>
              </Show>
              <For each={searchResults()}>
                {(msg) => (
                  <div 
                    class="search-result-item"
                    onClick={() => scrollToMessage(msg.id)}
                  >
                    <div class="search-result-sender">{getDisplayName(msg.sender_email)}</div>
                    <div class="search-result-content">{msg.content}</div>
                    <div class="search-result-time">{formatTime(msg.created_at)}</div>
                  </div>
                )}
              </For>
              <Show when={searchQuery() && searchResults().length === 0}>
                <p class="search-empty">No messages found</p>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      {/* Call User Selection Modal */}
      <Show when={showCallMenu()}>
        <div class="modal-overlay" onClick={() => setShowCallMenu(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Select User to Call</h3>
            <div class="user-list">
              <For each={onlineUsers().filter(u => u.user_id !== myUserId)}>
                {(user) => {
                  console.log('[Call Modal] User:', user.email, 'ID:', user.user_id, 'Type:', typeof user.user_id);
                  return (
                    <button
                      class="user-item"
                      onClick={() => {
                        console.log('[Call] Calling user:', user.user_id, 'Type:', typeof user.user_id);
                        webrtcService.startCall(
                          callMenuType(),
                          user.user_id,
                          user.email.split('@')[0]
                        );
                        setShowCallMenu(false);
                      }}
                    >
                      <div class="user-avatar">{getInitials(user.email)}</div>
                      <div class="user-info">
                        <div class="user-name">{getDisplayName(user.email)}</div>
                        <div class="user-status">Online</div>
                      </div>
                    </button>
                  );
                }}
              </For>
              <Show when={onlineUsers().filter(u => u.user_id !== myUserId).length === 0}>
                <p class="no-users">No other users online in this room</p>
              </Show>
            </div>
            <button class="btn btn-secondary" onClick={() => setShowCallMenu(false)}>Cancel</button>
          </div>
        </div>
      </Show>

      {/* Call Interface Overlay */}
      <CallInterface />
    </>
  );
}
