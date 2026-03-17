import { onCleanup, onMount, createSignal, createMemo, For, Show } from 'solid-js';
import { Portal } from 'solid-js/web';
import EmojiPicker from '../components/EmojiPicker';
import CallInterface from '../components/CallInterface';
import { SmileIcon, ImageIcon, SendIcon, LinkIcon, CheckIcon, CheckDoubleIcon, ReplyIcon, TrashIcon, SearchIcon, EditIcon, PhoneIcon, VideoIcon } from '../components/Icons';
import { getDisplayName, getInitials } from '../lib/displayName';
import { webrtcService } from '../lib/webrtc';
import { playNotificationSound, showMessageNotification, ensureNotificationPermission, updateCurrentRoom } from '../lib/notifications';
import { getDefaultRoomName, getDmRoomId, readStoredRooms, subscribeToStoredRooms, upsertStoredRoom, extractDmOtherUserId } from '../lib/rooms';

function getApiBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  return apiUrl || 'http://localhost:8080';
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

  const isDmRoom = roomId.startsWith('dm_');

  const dmPartnerName = () => sidebarRooms().find(r => r.id === roomId)?.name || 'Direct Message';
  const dmPartnerOnline = () => {
    const otherId = extractDmOtherUserId(roomId, myUserId);
    return otherId ? onlineUsers().some(u => u.user_id === otherId) : false;
  };
  const dmPartnerEmail = () => {
    const otherId = extractDmOtherUserId(roomId, myUserId);
    return onlineUsers().find(u => u.user_id === otherId)?.email || '';
  };
  
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
  const [showAvatarMenu, setShowAvatarMenu] = createSignal(false);
  const [popoverPos, setPopoverPos] = createSignal({ bottom: 72, left: 76 });

  const [myAvatar, setMyAvatar] = createSignal(localStorage.getItem('avatar_url') || '');

  let avatarBtnRef: HTMLButtonElement | undefined;
  // Direct message
  const [showNewDmModal, setShowNewDmModal] = createSignal(false);
  const [dmModalTab, setDmModalTab] = createSignal<'search' | 'friends' | 'online'>('friends');
  const [dmSearchEmail, setDmSearchEmail] = createSignal('');
  const [dmSearchCode, setDmSearchCode] = createSignal('');
  const [dmSearchResult, setDmSearchResult] = createSignal<{id: string, email: string, avatar_url?: string} | null>(null);
  const [dmSearchError, setDmSearchError] = createSignal('');
  const [dmSearchLoading, setDmSearchLoading] = createSignal(false);
  const [dmInviteCopied, setDmInviteCopied] = createSignal(false);
  const [dmLinkCopied, setDmLinkCopied] = createSignal(false);
  const [friendsList, setFriendsList] = createSignal<Array<{id:string,user_id:string,email:string,avatar_url?:string,status:string,direction:string}>>([]);
  const [friendsLoading, setFriendsLoading] = createSignal(false);
  const [myInviteCode, setMyInviteCode] = createSignal('');
  // UI layout state
  const [showRightPanel, setShowRightPanel] = createSignal(true);
  const [rightPanelMode, setRightPanelMode] = createSignal<'room' | 'contact'>('room');
  const [selectedContact, setSelectedContact] = createSignal<{email: string, avatar?: string, userId?: string} | null>(null);
  const [sidebarRooms, setSidebarRooms] = createSignal<Array<{id: string, name: string, lastMessage?: string}>>([]);
  const [sidebarSearch, setSidebarSearch] = createSignal('');
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  let ws: WebSocket | null = null;
  let messagesContainer: HTMLDivElement | undefined;
  let typingTimeout: any;
  let myUserId = '';
  let fileInputRef: HTMLInputElement | undefined;

  const refreshMyProfileFromStorage = () => {
    setMyAvatar(localStorage.getItem('avatar_url') || '');

    const sc = selectedContact();
    const myEmail = localStorage.getItem('email') || '';
    if (sc?.email && sc.email === myEmail) {
      setSelectedContact({ ...sc, avatar: localStorage.getItem('avatar_url') || sc.avatar });
    }
  };

  const selectedContactAvatarUrl = () => {
    const sc = selectedContact();
    if (!sc) return undefined;
    const myEmail = localStorage.getItem('email') || '';
    if (sc.email && sc.email === myEmail) {
      return myAvatar() || sc.avatar;
    }
    return sc.avatar;
  };

  const getStoredRoomName = (fallbackEmail?: string) => {
    const existingRoom = readStoredRooms().find((room) => room.id === roomId);
    if (existingRoom?.name && existingRoom.name !== 'Direct Message') {
      return existingRoom.name;
    }
    if (fallbackEmail) {
      return getDisplayName(fallbackEmail);
    }
    return getDefaultRoomName(roomId);
  };

  const rememberCurrentRoom = (details?: { name?: string; lastMessage?: string; timestamp?: string; bumpTimestamp?: boolean }) => {
    upsertStoredRoom({
      id: roomId,
      name: details?.name || getStoredRoomName(),
      lastMessage: details?.lastMessage,
      timestamp: details?.timestamp,
    }, { bumpTimestamp: details?.bumpTimestamp });
  };

  const startCallFlow = (callType: 'voice' | 'video') => {
    const unsupportedReason = webrtcService.getUnsupportedReason();
    if (unsupportedReason) {
      alert(unsupportedReason);
      return;
    }

    setCallMenuType(callType);
    setShowCallMenu(true);
  };

  onMount(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    
    refreshMyProfileFromStorage();

    const onProfileUpdated = () => refreshMyProfileFromStorage();
    window.addEventListener('profile:updated', onProfileUpdated as EventListener);
    onCleanup(() => window.removeEventListener('profile:updated', onProfileUpdated as EventListener));

    const onAppVisible = () => refreshMyProfileFromStorage();
    window.addEventListener('focus', onAppVisible);
    window.addEventListener('pageshow', onAppVisible);
    onCleanup(() => {
      window.removeEventListener('focus', onAppVisible);
      window.removeEventListener('pageshow', onAppVisible);
    });

    rememberCurrentRoom({ bumpTimestamp: false });
    setSidebarRooms(readStoredRooms());

    const unsubscribeRooms = subscribeToStoredRooms((rooms) => setSidebarRooms(rooms));
    onCleanup(unsubscribeRooms);

    // Close avatar menu on click outside
    const handleDocClick = (e: MouseEvent) => {
      if (avatarBtnRef && !avatarBtnRef.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    onCleanup(() => document.removeEventListener('mousedown', handleDocClick));

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
    rememberCurrentRoom({ bumpTimestamp: false });

    // Use Railway backend URL from environment variable
    const getApiBase = () => {
      const apiUrl = import.meta.env.VITE_API_URL as string;
      return apiUrl || 'http://localhost:8080';
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

          rememberCurrentRoom({
            name: getStoredRoomName(msg.sender_email),
            lastMessage: msg.content || '[Image]',
            timestamp: msg.created_at,
          });
          
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
            console.log('[WebRTC] âœ… Incoming call from', msg.callerUsername);
            (window as any).__pendingCallOffer = msg.offer;
            webrtcService.handleCallOffer(msg.offer, msg.callType, msg.sender_id, msg.callerUsername);
          } else {
            console.log('[WebRTC] âŒ Offer not for me, ignoring');
          }
        } else if (msg.type === 'call-answer') {
          // Only handle if this message is for me
          console.log('[WebRTC] Answer received - sender:', msg.sender_id, 'target:', msg.target_user_id, 'myId:', myUserId);
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] âœ… Call answered');
            webrtcService.handleCallAnswer(msg.answer);
          } else {
            console.log('[WebRTC] âŒ Answer not for me, ignoring');
          }
        } else if (msg.type === 'call-ice-candidate') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] âœ… ICE candidate received');
            webrtcService.handleIceCandidate(msg.candidate);
          }
        } else if (msg.type === 'call-rejected') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] âœ… Call rejected');
            alert('Call rejected');
            webrtcService.endCall();
          }
        } else if (msg.type === 'call-ended') {
          // Only handle if this message is for me
          if (msg.target_user_id === myUserId) {
            console.log('[WebRTC] âœ… Call ended by remote user');
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
            const latestMessage = newMessages[newMessages.length - 1] as Message;

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

            rememberCurrentRoom({
              name: getStoredRoomName(latestMessage.sender_email),
              lastMessage: latestMessage.content || '[Image]',
              timestamp: latestMessage.created_at,
            });
            
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
      console.log('[MarkRead] âš ï¸ WebSocket not ready, skipping');
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

  const navigateToDm = (otherUserId: string, otherEmail: string) => {
    if (!myUserId || !otherUserId) return;
    const dmRoomId = getDmRoomId(myUserId, otherUserId);
    upsertStoredRoom({ id: dmRoomId, name: getDisplayName(otherEmail) });
    window.location.href = `/chat/${dmRoomId}`;
  };

  const lookupUserByEmail = async () => {
    const email = dmSearchEmail().trim();
    const code = dmSearchCode().trim().toUpperCase();
    if (!email && !code) return;
    setDmSearchLoading(true);
    setDmSearchError('');
    setDmSearchResult(null);
    try {
      const token = localStorage.getItem('token');
      const api = getApiBaseUrl();
      let res: Response;
      if (email) {
        res = await fetch(`${api}/api/users/lookup?email=${encodeURIComponent(email)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } else {
        res = await fetch(`${api}/api/users/by-invite/${encodeURIComponent(code)}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
      if (!res.ok) throw new Error('not found');
      const data = await res.json();
      setDmSearchResult(data);
    } catch {
      setDmSearchError('Pengguna tidak ditemukan.');
    } finally {
      setDmSearchLoading(false);
    }
  };

  const loadFriendsForDm = async () => {
    setFriendsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/friends`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const all = await res.json();
        setFriendsList(all.filter((f: any) => f.status === 'accepted'));
      }
    } catch (_) {}
    finally { setFriendsLoading(false); }
  };

  const loadMyInviteCode = async () => {
    if (myInviteCode()) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${getApiBaseUrl()}/api/users/invite-code`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyInviteCode(data.code || '');
      }
    } catch (_) {}
  };

  const addFriendFromSearch = async () => {
    const result = dmSearchResult();
    if (!result) return;
    try {
      const token = localStorage.getItem('token');
      await fetch(`${getApiBaseUrl()}/api/friends/request`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: result.id }),
      });
      loadFriendsForDm();
    } catch (_) {}
  };

  const getMyInviteLink = () => {
    if (!myUserId) return '';
    return `${window.location.origin}/invite/${myUserId}`;
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(getMyInviteLink());
      setDmInviteCopied(true);
      setTimeout(() => setDmInviteCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(myInviteCode());
      setDmLinkCopied(true);
      setTimeout(() => setDmLinkCopied(false), 2000);
    } catch {}
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
      <div class="app-layout">

        {/* Mobile sidebar overlay */}
        <div class={"sidebar-overlay" + (sidebarOpen() ? " drawer-open" : "")} onClick={() => setSidebarOpen(false)} />

        {/* Drawer: nav-strip + sidebar slide together on mobile */}
        <div class={"drawer" + (sidebarOpen() ? " drawer-open" : "")}>

        {/* â”€â”€ Left Navigation Strip â”€â”€ */}
        <nav class="nav-strip">
          <a href="/" class="nav-brand-icon" title="Home">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </a>
          <div class="nav-icons-group">
            <a href="/" class="nav-icon-btn" title="Home">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
              </svg>
            </a>
            <a href="#" class="nav-icon-btn active" title="Chats">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </a>
            <a href="/create-room" class="nav-icon-btn" title="Create Room">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </a>
            <a href="/contacts" class="nav-icon-btn" title="Kontak">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </a>
            <button class="nav-icon-btn" onClick={() => setShowSearch(true)} title="Search">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
            </button>
          </div>
          <div class="nav-bottom-group">
            <div class="nav-avatar-wrap">
              <button
                ref={avatarBtnRef}
                class="nav-icon-btn nav-avatar-btn"
                title="My Profile"
                onClick={(e) => {
                  e.stopPropagation();
                  if (avatarBtnRef) {
                    const rect = avatarBtnRef.getBoundingClientRect();
                    setPopoverPos({ bottom: window.innerHeight - rect.top + 8, left: rect.right + 8 });
                  }
                  setShowAvatarMenu(m => !m);
                }}
              >
                {myAvatar ? (
                  <img src={myAvatar()} alt="You" class="nav-avatar-img" />
                ) : (
                  <div class="nav-avatar-placeholder">
                    {(localStorage.getItem('email') || 'U')[0].toUpperCase()}
                  </div>
                )}
              </button>
            </div>

            <button
              class="nav-icon-btn"
              title="Logout"
              onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('myRooms'); window.location.href = '/login'; }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>

          {/* Avatar popover — rendered via Portal to escape nav-strip stacking context */}
          <Show when={showAvatarMenu()}>
            <Portal>
              <div
                class="avatar-popover"
                style={`position:fixed;bottom:${popoverPos().bottom}px;left:${popoverPos().left}px;`}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div class="avatar-popover-email">{localStorage.getItem('email') || ''}</div>
                <a href="/profile" class="avatar-popover-item" onClick={() => setShowAvatarMenu(false)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  Edit Profile
                </a>
                <button class="avatar-popover-item avatar-popover-logout" onClick={() => { localStorage.clear(); window.location.href = '/login'; }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Logout
                </button>
              </div>
            </Portal>
          </Show>
        </nav>

        {/* â”€â”€ Sidebar Chat List â”€â”€ */}
        <aside class="sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">Chatting</span>
            <Show when={messages().length > 0}>
              <span class="sidebar-count">({messages().length})</span>
            </Show>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-left:auto;opacity:0.45;cursor:pointer;">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="sidebar-search-bar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted);flex-shrink:0">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              class="sidebar-search-input"
              type="text"
              placeholder="Search chat / people"
              value={sidebarSearch()}
              onInput={(e) => setSidebarSearch(e.currentTarget.value)}
            />
          </div>
          <div class="sidebar-shortcuts">
            <a href="/contacts" class="sidebar-contacts-shortcut">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Tambah / Kelola Kontak
            </a>
          </div>
          <div class="sidebar-list" style="flex:1;overflow-y:auto;">
            {/* Direct Messages Section */}
            <div class="sidebar-section-label">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.7"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Pesan Langsung
              <button class="sidebar-section-more" onClick={() => { setSidebarOpen(false); setShowNewDmModal(true); loadFriendsForDm(); loadMyInviteCode(); }} title="Mulai DM baru">+</button>
            </div>
            <For each={sidebarRooms().filter(r => r.id.startsWith('dm_') && (() => { const q = sidebarSearch().toLowerCase(); return !q || r.name.toLowerCase().includes(q); })())}>
              {(room) => {
                const isActive = room.id === roomId;
                const lastMsg = isActive && messages().length > 0 ? messages()[messages().length - 1] : null;
                return (
                  <a href={`/chat/${room.id}`} class={'sidebar-room-item' + (isActive ? ' active' : '')}>
                    <div class="sidebar-room-avatar">
                      <div class="sidebar-room-avatar-inner" style="background:linear-gradient(135deg,#34b7f1,#1a9c8a)">{room.name[0]?.toUpperCase() || 'D'}</div>
                      <Show when={isActive}><span class="sidebar-avatar-online-dot"></span></Show>
                    </div>
                    <div class="sidebar-room-info">
                      <div class="sidebar-room-name">{room.name}</div>
                      <div class="sidebar-room-preview">
                        {lastMsg?.image_url && !lastMsg.content && (<span class="preview-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Photo</span>)}
                        {lastMsg ? (lastMsg.content || '').substring(0, 28) : 'Mulai percakapan'}
                      </div>
                    </div>
                    <div class="sidebar-room-meta">
                      {lastMsg && <div class="sidebar-room-time">{formatTime(lastMsg.created_at)}</div>}
                    </div>
                  </a>
                );
              }}
            </For>
            <Show when={sidebarRooms().filter(r => r.id.startsWith('dm_')).length === 0}>
              <button class="sidebar-dm-empty" onClick={() => { setSidebarOpen(false); setShowNewDmModal(true); loadFriendsForDm(); loadMyInviteCode(); }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Mulai chat langsung
              </button>
            </Show>

            {/* Group / Room Channels Section */}
            <div class="sidebar-section-label" style="margin-top:10px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:0.7"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Grup & Channel
              <button class="sidebar-section-more">···</button>
            </div>
            <For each={sidebarRooms().filter(r => !r.id.startsWith('dm_') && (() => { const q = sidebarSearch().toLowerCase(); return !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q); })())}>
              {(room) => {
                const isActive = room.id === roomId;
                const lastMsg = isActive && messages().length > 0 ? messages()[messages().length - 1] : null;
                return (
                  <a href={`/chat/${room.id}`} class={'sidebar-room-item' + (isActive ? ' active' : '')}>
                    <div class="sidebar-room-avatar">
                      <div class="sidebar-room-avatar-inner">{room.name[0]?.toUpperCase()}</div>
                      <Show when={isActive}><span class="sidebar-avatar-online-dot"></span></Show>
                    </div>
                    <div class="sidebar-room-info">
                      <div class="sidebar-room-name">{room.name}</div>
                      <div class="sidebar-room-preview">
                        {lastMsg?.image_url && !lastMsg.content && (<span class="preview-icon"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Photo</span>)}
                        {lastMsg ? (lastMsg.content || '').substring(0, 28) : 'Open room'}
                      </div>
                    </div>
                    <div class="sidebar-room-meta">
                      {lastMsg && <div class="sidebar-room-time">{formatTime(lastMsg.created_at)}</div>}
                    </div>
                  </a>
                );
              }}
            </For>
          </div>
          <div class="sidebar-footer">
            <a href="/profile" class="sidebar-footer-user" title="Edit Profile">
              {myAvatar() ? (
                <img src={myAvatar()} class="sidebar-footer-avatar-img" alt="" />
              ) : (
                <div class="sidebar-footer-avatar-placeholder">{(localStorage.getItem('email') || 'U')[0].toUpperCase()}</div>
              )}
              <div class="sidebar-footer-info">
                <div class="sidebar-footer-name">{getDisplayName(localStorage.getItem('email') || '')}</div>
                <div class="sidebar-footer-email">{localStorage.getItem('email') || ''}</div>
              </div>
            </a>
            <button class="sidebar-footer-logout-btn" onClick={() => { localStorage.clear(); window.location.href = '/login'; }} title="Logout">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </aside>

        {/* â”€â”€ Main Chat Area â”€â”€ */}
        </div>{/* end drawer */}

        {/* ── Main Chat Area ── */}
        <main class="chat-main">

          {/* Chat Header */}
          <div class="chat-header-new">
            <div class="chat-header-left">
              {/* Hamburger — mobile only */}
              <button class="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="Menu" aria-label="Open sidebar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                </svg>
              </button>
              <div class="chat-header-avatar">
                <div class="chat-header-avatar-inner">{roomId[0].toUpperCase()}</div>
              </div>
              <div class="chat-header-info">
                <div class="chat-header-name">{isDmRoom ? (sidebarRooms().find(r => r.id === roomId)?.name || 'Direct Message') : ('#' + roomId)}</div>
                <div class="chat-header-meta">
                  {isDmRoom ? (
                    <span class="chat-header-online">
                      <span class="dot" style={`width:6px;height:6px;animation:none;background:${dmPartnerOnline() ? 'var(--success)' : 'var(--muted)'}`}></span>
                      {dmPartnerOnline() ? 'Online' : 'Offline'}
                    </span>
                  ) : (
                    <>
                      <span>{onlineUsers().length} member{onlineUsers().length !== 1 ? 's' : ''}</span>
                      <span class="chat-header-online">
                        <span class="dot ok" style="width:6px;height:6px;animation:none;"></span>
                        {onlineUsers().length} online
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div class="chat-header-actions">
              <button class="header-action-btn" onClick={shareRoom} title={showCopied() ? 'Copied!' : 'Copy link'}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              </button>
              <button class="header-action-btn" onClick={() => startCallFlow('voice')} title="Voice call">
                <PhoneIcon />
              </button>
              <button class="header-action-btn" onClick={() => startCallFlow('video')} title="Video call">
                <VideoIcon />
              </button>
              <button class="header-action-btn" onClick={() => setShowSearch(true)} title="Search">
                <SearchIcon />
              </button>
              <button
                class={'header-action-btn' + (showRightPanel() ? ' active' : '')}
                onClick={() => { setRightPanelMode('room'); setShowRightPanel(p => !p); }}
                title={isDmRoom ? 'Contact Info' : 'Room Info'}
              >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Connection status bar */}
          <Show when={status() !== 'connected'}>
            <div class={'connection-status-bar' + (status() === 'disconnected' ? ' error' : '')}>
              <span class="dot" style={status() === 'connecting' ? 'background:#ffa657;' : ''}></span>
              {status() === 'connecting' ? 'Connecting...' : 'Disconnected â€” messages won\'t update'}
            </div>
          </Show>

          {/* â”€â”€ chat-container (pinned + messages + input) â”€â”€ */}
          <div class="chat-container">

          {/* Pinned Messages Section */}
          <Show when={(() => { const pinned = messages().filter(m => pinnedMessages().has(m.id)); return pinned.length > 0; })()}>
            <div style={{ background: 'rgba(255,166,87,0.1)', 'border-bottom': '1px solid rgba(255,166,87,0.3)', padding: '8px 16px', 'font-size': '13px', color: '#ffa657', display: 'flex', 'align-items': 'center', gap: '8px', 'flex-wrap': 'wrap' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.828 1.172a.5.5 0 0 1 0 .707l-1.293 1.293.707.707a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0zM9.828 8a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-5a.5.5 0 0 1 .5-.5h3z"/>
              </svg>
              <span style={{ 'font-weight': '600' }}>{messages().filter(m => pinnedMessages().has(m.id)).length} pinned</span>
              <For each={messages().filter(m => pinnedMessages().has(m.id))}>
                {(pinnedMsg) => (
                  <button
                    onClick={() => { const el = document.getElementById(`msg-${pinnedMsg.id}`); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.animation = 'highlight 1s ease'; setTimeout(() => { el.style.animation = ''; }, 1000); } }}
                    style={{ background: 'rgba(255,166,87,0.2)', border: '1px solid rgba(255,166,87,0.4)', 'border-radius': '12px', padding: '4px 10px', color: '#ffa657', cursor: 'pointer', 'font-size': '12px' }}
                  >
                    {pinnedMsg.content.substring(0, 30)}{pinnedMsg.content.length > 30 ? '...' : ''}
                  </button>
                )}
              </For>
            </div>
          </Show>

          <div class="messages-container" ref={messagesContainer}>
            <For each={messages()} fallback={<div style="text-align:center;padding:60px 20px;color:var(--muted);font-size:14px;">No messages yet. Say hello! 👋</div>}>
              {(msg) => {
                const isMe = msg.sender_id === myUserId;
                const initials = getInitials(msg.sender_email);
                return (
                  <div
                    class={'message-row ' + (isMe ? 'me' : 'other')}
                    id={`msg-${msg.id}`}
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    onTouchStart={(e) => handleLongPressStart(e, msg)}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleLongPressEnd}
                  >
                    {!isMe && (
                      <div class="message-avatar">
                        <button
                          style="background:none;border:none;padding:0;cursor:pointer;width:100%;height:100%;border-radius:50%;"
                          onClick={() => {
                            setSelectedContact({ email: msg.sender_email, avatar: msg.sender_avatar, userId: msg.sender_id });
                            setRightPanelMode('contact');
                            setShowRightPanel(true);
                          }}
                          title={`View ${getDisplayName(msg.sender_email)}'s profile`}
                        >
                          {msg.sender_avatar ? (
                            <img src={msg.sender_avatar} alt={msg.sender_email} style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />
                          ) : (
                            <div class="avatar-placeholder">{initials}</div>
                          )}
                        </button>
                      </div>
                    )}
                    <div class="message-bubble" style={{ 'border-left': pinnedMessages().has(msg.id) ? '4px solid #ffa657' : undefined, 'padding-left': pinnedMessages().has(msg.id) ? '12px' : undefined }}>
                      {pinnedMessages().has(msg.id) && (
                        <div style={{ 'font-size': '11px', color: '#ffa657', 'font-weight': '600', 'margin-bottom': '4px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
                          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828 1.172a.5.5 0 0 1 0 .707l-1.293 1.293.707.707a.5.5 0 0 1 0 .707l-.707.707a.5.5 0 0 1-.707 0l-.707-.707-5.657 5.657a.5.5 0 0 1-.707 0l-.707-.707a.5.5 0 0 1 0-.707l5.657-5.657-.707-.707a.5.5 0 0 1 0-.707l.707-.707a.5.5 0 0 1 .707 0l.707.707 1.293-1.293a.5.5 0 0 1 .707 0z"/></svg>
                          <span>Pinned</span>
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
                        <div class="message-image"><img src={msg.image_url} alt="Shared image" /></div>
                      )}
                      <Show when={editingMessage()?.id === msg.id} fallback={
                        <>
                          {msg.content && <div class="message-content">{msg.content}</div>}
                          {msg.edited_at && <div style={{ 'font-size': '11px', color: '#8b949e', 'margin-top': '2px' }}>(edited)</div>}
                        </>
                      }>
                        <div class="edit-message-form">
                          <textarea value={editInput()} onInput={(e) => setEditInput(e.currentTarget.value)} style={{ width: '100%', padding: '8px', 'border-radius': '6px', border: '1px solid #30363d', background: '#0d1117', color: '#c9d1d9', 'font-family': 'inherit', resize: 'vertical', 'min-height': '60px' }} />
                          <div style={{ display: 'flex', gap: '8px', 'margin-top': '8px' }}>
                            <button onClick={sendEditMessage} type="button" style={{ padding: '4px 12px', 'border-radius': '6px', border: 'none', background: '#238636', color: 'white', cursor: 'pointer' }}>Save</button>
                            <button onClick={cancelEdit} type="button" style={{ padding: '4px 12px', 'border-radius': '6px', border: 'none', background: '#21262d', color: '#c9d1d9', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </div>
                      </Show>
                      <Show when={msg.reactions && msg.reactions.length > 0}>
                        <div style={{ display: 'flex', 'flex-wrap': 'wrap', gap: '4px', 'margin-top': '6px' }}>
                          <For each={(() => { const grouped = new Map<string, {emoji: string, users: Array<{id: string, email: string}>}>(); (msg.reactions || []).forEach(r => { if (!grouped.has(r.emoji)) grouped.set(r.emoji, { emoji: r.emoji, users: [] }); grouped.get(r.emoji)!.users.push({ id: r.user_id, email: r.user_email }); }); return Array.from(grouped.values()); })()}>
                            {(rg) => {
                              const hasReacted = rg.users.some(u => u.id === myUserId);
                              return (
                                <button onClick={() => hasReacted ? removeReaction(msg.id, rg.emoji) : addReaction(msg.id, rg.emoji)} title={rg.users.map(u => u.email).join(', ')}
                                  style={{ padding: '2px 8px', 'border-radius': '12px', border: hasReacted ? '1px solid #238636' : '1px solid #30363d', background: hasReacted ? '#0d4429' : '#161b22', color: '#c9d1d9', cursor: 'pointer', display: 'flex', 'align-items': 'center', gap: '4px', 'font-size': '13px' }}>
                                  <span>{rg.emoji}</span><span style={{ 'font-size': '11px', color: '#8b949e' }}>{rg.users.length}</span>
                                </button>
                              );
                            }}
                          </For>
                        </div>
                      </Show>
                      <div class="message-time">
                        {formatTime(msg.created_at)}
                        {isMe && (() => {
                          const _ = readReceiptsVersion();
                          const readers = readReceipts().get(msg.id);
                          const otherReaders = (readers ? Array.from(readers) : []).filter(r => r !== msg.sender_id);
                          const readStatus = otherReaders.length > 0;
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
            <div>
              <div class="context-menu-overlay" onClick={closeContextMenu} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 'z-index': 1000 }} />
              <div class="context-menu" style={{ position: 'fixed', top: `${contextMenu()!.y}px`, left: `${contextMenu()!.x}px`, background: '#161b22', border: '1px solid #30363d', 'border-radius': '8px', 'box-shadow': '0 8px 24px rgba(0,0,0,0.5)', 'z-index': 1001, 'min-width': '180px', overflow: 'hidden' }}>
                <button class="context-menu-item" onClick={() => { setReplyingTo(contextMenu()!.message); closeContextMenu(); }} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><ReplyIcon /><span>Reply</span></button>
                <button class="context-menu-item" onClick={() => copyMessage(contextMenu()!.message)} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" /><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" /></svg>
                  <span>Copy Message</span>
                </button>
                <button class="context-menu-item" onClick={() => togglePinMessage(contextMenu()!.message.id)} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>
                  <span style={{ 'font-size': '14px' }}>{'📌'}</span>
                  <span>{pinnedMessages().has(contextMenu()!.message.id) ? 'Unpin' : 'Pin Message'}</span>
                </button>
                <button class="context-menu-item" onClick={() => { setShowReactionPicker(contextMenu()!.message.id); setReactionPickerPos({ x: contextMenu()!.x, y: contextMenu()!.y }); closeContextMenu(); }} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left', 'border-top': '1px solid #30363d' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><span>{'😊'}</span><span>Add Reaction</span></button>
                <Show when={contextMenu()!.message.sender_id === myUserId}>
                  <div>
                    <button class="context-menu-item" onClick={() => { startEditMessage(contextMenu()!.message); closeContextMenu(); }} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#c9d1d9', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><EditIcon /><span>Edit</span></button>
                    <button class="context-menu-item" onClick={() => { deleteMessage(contextMenu()!.message.id); closeContextMenu(); }} style={{ display: 'flex', 'align-items': 'center', gap: '12px', width: '100%', padding: '10px 16px', background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', 'font-size': '14px', 'text-align': 'left', 'border-top': '1px solid #30363d' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}><TrashIcon /><span>Delete</span></button>
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          {/* Reaction Picker */}
          <Show when={showReactionPicker() && reactionPickerPos()}>
            <div>
              <div class="reaction-picker-overlay" onClick={() => { setShowReactionPicker(null); setReactionPickerPos(null); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 'z-index': 1002 }} />
              <div class="reaction-picker" style={{ position: 'fixed', top: `${reactionPickerPos()!.y + 40}px`, left: `${reactionPickerPos()!.x}px`, background: '#161b22', border: '1px solid #30363d', 'border-radius': '8px', padding: '8px', display: 'flex', gap: '4px', 'box-shadow': '0 8px 24px rgba(0,0,0,0.5)', 'z-index': 1003 }}>
                <For each={['👍', '❤️', '😂', '😮', '😢', '🎉']}>
                  {(emoji) => (
                    <button onClick={() => { const msgId = showReactionPicker(); if (msgId) addReaction(msgId, emoji); setShowReactionPicker(null); setReactionPickerPos(null); }} style={{ background: 'none', border: 'none', 'font-size': '24px', cursor: 'pointer', padding: '4px', 'border-radius': '4px' }} onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'} onMouseLeave={(e) => e.currentTarget.style.background = 'none'}>{emoji}</button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Copied Toast */}
          <Show when={showCopiedToast()}>
            <div style={{ position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)', background: '#238636', color: 'white', padding: '10px 20px', 'border-radius': '8px', 'box-shadow': '0 4px 12px rgba(0,0,0,0.3)', 'z-index': 2000, animation: 'fadeInOut 2s ease-in-out', 'font-size': '14px', 'font-weight': '500' }}>
              Message copied!
            </div>
          </Show>

          {/* Message Input */}
          <form class="input-container" onSubmit={sendMessage}>
            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleImageSelect} style="display:none;" />
            <button class="btn btn-ghost icon-btn" type="button" onClick={() => fileInputRef?.click()} disabled={status() !== 'connected'} title="Upload image"><ImageIcon /></button>
            <button class="btn btn-ghost icon-btn" type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker())} disabled={status() !== 'connected'} title="Add emoji"><SmileIcon /></button>
            <input class="message-input" type="text" placeholder="Let's talk about something..." value={input()} onInput={(e) => onInputChange(e.currentTarget.value)} disabled={status() !== 'connected'} />
            <button class="btn btn-primary send-btn" type="submit" disabled={status() !== 'connected' || (!input().trim() && !imagePreview())} title="Send message"><SendIcon /></button>
          </form>

          </div>{/* end chat-container */}
        </main>

        {/* Right Info Panel */}
        <Show when={showRightPanel()}>
          <aside class="right-panel">
            <div class="right-panel-header">
              <span class="right-panel-title">{rightPanelMode() === 'contact' ? 'Contact Info' : isDmRoom ? 'Contact Information' : 'Room Information'}</span>
              <button class="right-panel-close" onClick={() => setShowRightPanel(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* DM Room Panel */}
            <Show when={isDmRoom && rightPanelMode() === 'room'}>
              <div class="right-panel-body">
                <div class="contact-avatar-wrap">
                  <div class="contact-avatar-placeholder">{dmPartnerName()[0]?.toUpperCase() || '?'}</div>
                  <div class="contact-online-dot" style={`background:${dmPartnerOnline() ? 'var(--success)' : 'var(--muted)'};`}></div>
                </div>
                <h3 class="contact-name">{dmPartnerName()}</h3>
                <p class="contact-email-text">{dmPartnerEmail()}</p>
                <div class="dm-status-badge" style={dmPartnerOnline() ? 'color:var(--success);border-color:rgba(52,211,153,0.25);background:rgba(52,211,153,0.08);' : ''}>
                  <span class="dot" style={`width:8px;height:8px;animation:none;background:${dmPartnerOnline() ? 'var(--success)' : 'var(--muted)'}`}></span>
                  {dmPartnerOnline() ? 'Online sekarang' : 'Sedang offline'}
                </div>
                <div class="contact-call-actions" style="margin-top:16px;">
                  <button class="contact-action-btn" onClick={() => startCallFlow('voice')} title="Voice Call">
                    <PhoneIcon /><span>Voice</span>
                  </button>
                  <button class="contact-action-btn" onClick={() => startCallFlow('video')} title="Video Call">
                    <VideoIcon /><span>Video</span>
                  </button>
                </div>
              </div>
            </Show>

            {/* Group Room Panel */}
            <Show when={!isDmRoom && rightPanelMode() === 'room'}>
              <div class="right-panel-body">
                <div class="right-panel-avatar-wrap">
                  <div class="right-panel-avatar"><div class="right-panel-avatar-inner">{roomId[0].toUpperCase()}</div></div>
                </div>
                <h3 class="right-panel-room-name">#{roomId}</h3>
                <p class="right-panel-room-count">{onlineUsers().length} member{onlineUsers().length !== 1 ? 's' : ''}</p>

                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <span>About This Room</span>
                    <button class="section-more-btn">···</button>
                  </div>
                  <p class="right-panel-section-text">A place for conversations, sharing ideas, and staying connected with your team.</p>
                </div>

                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    <span>Members Online ({onlineUsers().length})</span>
                  </div>
                  <div class="member-list">
                    <For each={onlineUsers()} fallback={<p style="font-size:13px;color:var(--muted);text-align:center;padding:12px 0;">No one online yet</p>}>
                      {(user) => (
                        <button class="member-item" onClick={() => { setSelectedContact({ email: user.email, userId: user.user_id }); setRightPanelMode('contact'); }}>
                          <div class="member-avatar">{user.email[0].toUpperCase()}</div>
                          <div class="member-info">
                            <div class="member-name">{getDisplayName(user.email)}</div>
                            <div class="member-status"><span class="dot ok" style="width:6px;height:6px;display:inline-block;"></span> Online</div>
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </div>

                {/* Media Section */}
                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                    <span>Media</span>
                    <button class="section-more-btn">···</button>
                  </div>
                  {(() => {
                    const mediaMessages = messages().filter(m => m.image_url);
                    const visible = mediaMessages.slice(-4);
                    const extra = Math.max(0, mediaMessages.length - 4);
                    return (
                      <div class="media-grid">
                        <For each={visible}>
                          {(m) => (
                            <div class="media-thumb">
                              <img src={m.image_url!} alt="media" />
                            </div>
                          )}
                        </For>
                        <Show when={extra > 0}>
                          <div class="media-thumb media-thumb-more">
                            <span>+{extra}<br />More<br />Media</span>
                          </div>
                        </Show>
                        <Show when={mediaMessages.length === 0}>
                          <p style="font-size:12px;color:var(--muted);margin:0;padding:4px 0;">No shared media yet</p>
                        </Show>
                      </div>
                    );
                  })()}
                </div>

                {/* Files Section */}
                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span>Files</span>
                    <button class="section-more-btn">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </button>
                    <button class="section-more-btn">···</button>
                  </div>
                  {(() => {
                    const fileMessages = messages().filter(m => m.image_url).slice(-3);
                    return fileMessages.length > 0 ? (
                      <div class="file-list">
                        <For each={fileMessages}>
                          {(m) => (
                            <div class="file-item">
                              <div class="file-icon file-icon-img">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                              </div>
                              <div class="file-info">
                                <div class="file-name">image_{m.id.substring(0, 6)}.jpg</div>
                                <div class="file-meta">{formatTime(m.created_at)} · {getDisplayName(m.sender_email)}</div>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    ) : (
                      <p style="font-size:12px;color:var(--muted);margin:0;padding:4px 0;">No files shared yet</p>
                    );
                  })()}
                </div>

                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></svg>
                    <span>Quick Actions</span>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
                    <button class="btn btn-ghost" style="justify-content:flex-start;gap:10px;font-size:13px;" onClick={shareRoom}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                      {showCopied() ? 'Copied!' : 'Copy Room Link'}
                    </button>
                    <a href="/create-room" class="btn btn-ghost" style="justify-content:flex-start;gap:10px;font-size:13px;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Create New Room
                    </a>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={rightPanelMode() === 'contact'}>
              <div class="right-panel-body">
                <button class="back-btn" onClick={() => setRightPanelMode('room')}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6" /></svg>
                  {isDmRoom ? 'Back to Contact Info' : 'Back to Room Info'}
                </button>
                <div class="contact-avatar-wrap">
                  <Show when={selectedContactAvatarUrl()} fallback={<div class="contact-avatar-placeholder">{(selectedContact()?.email || 'U')[0].toUpperCase()}</div>}>
                    <img src={selectedContactAvatarUrl()!} alt="Avatar" class="contact-avatar-img" />
                  </Show>
                  <div class="contact-online-dot"></div>
                </div>
                <h3 class="contact-name">{selectedContact()?.email ? getDisplayName(selectedContact()!.email) : 'Unknown User'}</h3>
                <p class="contact-email-text">{selectedContact()?.email || ''}</p>

                <div class="contact-call-actions">
                  <Show when={selectedContact()?.userId && selectedContact()!.userId !== myUserId}>
                    <button class="contact-action-btn contact-dm-btn" onClick={() => navigateToDm(selectedContact()!.userId!, selectedContact()!.email)} title="Kirim Pesan Langsung">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>Pesan</span>
                    </button>
                  </Show>
                  <button class="contact-action-btn" onClick={() => startCallFlow('voice')} title="Voice Call">
                    <PhoneIcon /><span>Voice</span>
                  </button>
                  <button class="contact-action-btn" onClick={() => startCallFlow('video')} title="Video Call">
                    <VideoIcon /><span>Video</span>
                  </button>
                </div>

                <div class="right-panel-section">
                  <div class="right-panel-section-header">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    <span>Contact Information</span>
                  </div>
                  <div class="contact-details">
                    <div class="contact-detail-row">
                      <span class="contact-detail-label">Email</span>
                      <span class="contact-detail-value">{selectedContact()?.email || '-'}</span>
                    </div>
                    <div class="contact-detail-row">
                      <span class="contact-detail-label">Display Name</span>
                      <span class="contact-detail-value">{selectedContact()?.email ? getDisplayName(selectedContact()!.email) : '-'}</span>
                    </div>
                    <div class="contact-detail-row">
                      <span class="contact-detail-label">Bio</span>
                      <span class="contact-detail-value">
                        {selectedContact()?.email && selectedContact()!.email === (localStorage.getItem('email') || '')
                          ? (localStorage.getItem('bio') || '-')
                          : '-'}
                      </span>
                    </div>
                    <div class="contact-detail-row">
                      <span class="contact-detail-label">Status</span>
                      <span class="contact-detail-value" style="display:flex;align-items:center;gap:6px;">
                        <span class="dot ok" style="width:8px;height:8px;flex-shrink:0;animation:none;"></span>Online
                      </span>
                    </div>
                    <div class="contact-detail-row">
                      <span class="contact-detail-label">User ID</span>
                      <span class="contact-detail-value" style="font-family:monospace;font-size:11px;color:var(--muted);">{selectedContact()?.userId ? selectedContact()!.userId!.substring(0, 16) + '...' : '-'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Show>
          </aside>
        </Show>

      </div>{/* end app-layout */}

      {/* Floating Overlays */}

      <Show when={showEmojiPicker()}>
        <EmojiPicker
          onSelect={addEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      </Show>

      <Show when={showSearch()}>
        <div class="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowSearch(false); }}>
          <div class="search-panel">
            <div class="search-header">
              <input class="search-input" type="text" placeholder="Search messages..." value={searchQuery()} onInput={(e) => { setSearchQuery(e.currentTarget.value); searchMessages(); }} autofocus />
              <button class="btn btn-ghost" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>Close</button>
            </div>
            <div class="search-results">
              <Show when={searchResults().length > 0}><p class="search-count">{searchResults().length} result{searchResults().length !== 1 ? 's' : ''} found</p></Show>
              <For each={searchResults()}>
                {(msg) => (
                  <div class="search-result-item" onClick={() => scrollToMessage(msg.id)}>
                    <div class="search-result-sender">{getDisplayName(msg.sender_email)}</div>
                    <div class="search-result-content">{msg.content}</div>
                    <div class="search-result-time">{formatTime(msg.created_at)}</div>
                  </div>
                )}
              </For>
              <Show when={searchQuery() && searchResults().length === 0}><p class="search-empty">No messages found</p></Show>
            </div>
          </div>
        </div>
      </Show>

      {/* New DM Modal */}
      <Show when={showNewDmModal()}>
        <div class="modal-overlay" onClick={() => setShowNewDmModal(false)}>
          <div class="modal-content dm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style="margin-bottom:4px;">Tambah Kontak / Pesan Langsung</h3>

            {/* Tabs */}
            <div class="dm-modal-tabs">
              <button class={`dm-tab${dmModalTab() === 'friends' ? ' active' : ''}`} onClick={() => { setDmModalTab('friends'); loadFriendsForDm(); }}>Kontak</button>
              <button class={`dm-tab${dmModalTab() === 'search' ? ' active' : ''}`} onClick={() => setDmModalTab('search')}>Cari / Tambah</button>
              <button class={`dm-tab${dmModalTab() === 'online' ? ' active' : ''}`} onClick={() => setDmModalTab('online')}>Online</button>
            </div>

            {/* Friends list tab */}
            <Show when={dmModalTab() === 'friends'}>
              <div class="user-list" style="max-height:280px;overflow-y:auto;margin:12px 0;">
                <Show when={friendsLoading()}>
                  <p class="no-users">Memuat...</p>
                </Show>
                <For each={friendsList()}>
                  {(f) => (
                    <button class="user-item" onClick={() => { setShowNewDmModal(false); navigateToDm(f.user_id, f.email); }}>
                      <div class="user-avatar" style="background:linear-gradient(135deg,#06b6d4,#0891b2);">
                        {f.avatar_url
                          ? <img src={f.avatar_url} style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>
                          : getInitials(f.email)
                        }
                      </div>
                      <div class="user-info">
                        <div class="user-name">{getDisplayName(f.email)}</div>
                        <div class="user-status" style="color:var(--muted)">{f.email}</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted);flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  )}
                </For>
                <Show when={!friendsLoading() && friendsList().length === 0}>
                  <p class="no-users">Belum ada kontak. Tambahkan lewat tab Cari / Tambah.</p>
                </Show>
              </div>
              <a href="/contacts" class="btn btn-secondary" style="display:block;text-align:center;text-decoration:none;width:100%;margin-bottom:4px;padding:8px;">Kelola Kontak</a>
            </Show>

            {/* Search / Add tab */}
            <Show when={dmModalTab() === 'search'}>
              <div class="dm-search-section">
                <p style="font-size:12px;color:var(--muted);margin-bottom:8px;">Cari via email atau kode undangan:</p>
                <div class="dm-search-row" style="margin-bottom:6px;">
                  <input
                    class="dm-search-input"
                    type="text"
                    placeholder="Email..."
                    value={dmSearchEmail()}
                    onInput={(e) => { setDmSearchEmail(e.currentTarget.value); setDmSearchCode(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') lookupUserByEmail(); }}
                  />
                </div>
                <div class="dm-search-row" style="margin-bottom:10px;">
                  <input
                    class="dm-search-input"
                    type="text"
                    placeholder="Kode undangan (cth: AB12CD34)"
                    value={dmSearchCode()}
                    maxLength={8}
                    style="font-family:monospace;text-transform:uppercase;"
                    onInput={(e) => { setDmSearchCode(e.currentTarget.value.toUpperCase()); setDmSearchEmail(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') lookupUserByEmail(); }}
                  />
                  <button class="btn btn-primary dm-search-btn" onClick={lookupUserByEmail} disabled={dmSearchLoading() || (!dmSearchEmail().trim() && !dmSearchCode().trim())}>
                    {dmSearchLoading() ? '...' : 'Cari'}
                  </button>
                </div>
                <Show when={dmSearchError()}>
                  <p class="dm-search-error">{dmSearchError()}</p>
                </Show>
                <Show when={dmSearchResult()}>
                  {(result) => (
                    <div class="dm-search-result">
                      <div class="user-avatar" style="background:linear-gradient(135deg,#06b6d4,#0891b2);flex-shrink:0;">
                        {result().avatar_url
                          ? <img src={result().avatar_url} style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />
                          : getInitials(result().email)
                        }
                      </div>
                      <div class="user-info" style="flex:1;">
                        <div class="user-name">{getDisplayName(result().email)}</div>
                        <div class="user-status" style="color:var(--muted)">{result().email}</div>
                      </div>
                      <div style="display:flex;gap:6px;flex-shrink:0;">
                        <button class="btn btn-secondary" style="padding:5px 10px;font-size:12px;" onClick={addFriendFromSearch} title="Tambah kontak">+</button>
                        <button class="btn btn-primary" style="padding:5px 10px;font-size:12px;" onClick={() => { setShowNewDmModal(false); setDmSearchEmail(''); setDmSearchCode(''); setDmSearchResult(null); navigateToDm(result().id, result().email); }}>Pesan</button>
                      </div>
                    </div>
                  )}
                </Show>
              </div>

              {/* Invite code/link section */}
              <div class="dm-invite-section">
                <p class="dm-invite-label">Kode / link undangan kamu:</p>
                <Show when={myInviteCode()}>
                  <div class="dm-invite-row" style="margin-bottom:4px;">
                    <span class="dm-invite-link" style="font-family:monospace;font-size:14px;font-weight:700;letter-spacing:2px;">{myInviteCode()}</span>
                    <button class="btn dm-copy-btn" onClick={copyInviteCode}>{dmLinkCopied() ? '✓' : 'Salin Kode'}</button>
                  </div>
                </Show>
                <div class="dm-invite-row">
                  <span class="dm-invite-link" style="font-size:11px;">{getMyInviteLink() || '(login untuk melihat link)'}</span>
                  <button class="btn dm-copy-btn" onClick={copyInviteLink}>{dmInviteCopied() ? '✓ Disalin!' : 'Salin Link'}</button>
                </div>
              </div>
            </Show>

            {/* Online users tab */}
            <Show when={dmModalTab() === 'online'}>
              <div class="user-list" style="max-height:280px;overflow-y:auto;margin:12px 0;">
                <For each={onlineUsers().filter(u => u.user_id !== myUserId)}>
                  {(user) => (
                    <button class="user-item" onClick={() => { setShowNewDmModal(false); navigateToDm(user.user_id, user.email); }}>
                      <div class="user-avatar">{getInitials(user.email)}</div>
                      <div class="user-info">
                        <div class="user-name">{getDisplayName(user.email)}</div>
                        <div class="user-status">● Online</div>
                      </div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--muted);flex-shrink:0"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    </button>
                  )}
                </For>
                <Show when={onlineUsers().filter(u => u.user_id !== myUserId).length === 0}>
                  <p class="no-users">Tidak ada pengguna lain yang online di room ini.</p>
                </Show>
              </div>
            </Show>

            <button class="btn btn-secondary" style="width:100%;margin-top:4px;" onClick={() => { setShowNewDmModal(false); setDmSearchEmail(''); setDmSearchCode(''); setDmSearchResult(null); setDmSearchError(''); }}>Tutup</button>
          </div>
        </div>
      </Show>

      <Show when={showCallMenu()}>
        <div class="modal-overlay" onClick={() => setShowCallMenu(false)}>
          <div class="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Select User to Call</h3>
            <div class="user-list">
              <For each={onlineUsers().filter(u => u.user_id !== myUserId)}>
                {(user) => (
                  <button class="user-item" onClick={() => { webrtcService.startCall(callMenuType(), user.user_id, user.email.split('@')[0]); setShowCallMenu(false); }}>
                    <div class="user-avatar">{getInitials(user.email)}</div>
                    <div class="user-info">
                      <div class="user-name">{getDisplayName(user.email)}</div>
                      <div class="user-status">Online</div>
                    </div>
                  </button>
                )}
              </For>
              <Show when={onlineUsers().filter(u => u.user_id !== myUserId).length === 0}>
                <p class="no-users">No other users online in this room</p>
              </Show>
            </div>
            <button class="btn btn-secondary" onClick={() => setShowCallMenu(false)}>Cancel</button>
          </div>
        </div>
      </Show>

      <CallInterface />
    </>
  );
}
