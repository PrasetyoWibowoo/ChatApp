import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import { initGlobalNotifications, cleanupGlobalNotifications, ensureNotificationPermission, showMessageNotification } from '../lib/notifications';
import { extractDmOtherUserId, getDefaultRoomName, readStoredRooms, subscribeToStoredRooms, upsertStoredRoom } from '../lib/rooms';
import { getDisplayName } from '../lib/displayName';

interface Room {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: string;
}

export default function Home() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return <div>Redirecting...</div>;
  }

  let email = 'User';
  let userId = '';
  let initialAvatar = '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    email = payload.email || 'User';
    userId = payload.sub || '';
    initialAvatar = localStorage.getItem('avatar_url') || '';
  } catch (e) {
    console.error('Failed to decode token', e);
    localStorage.removeItem('token');
    window.location.href = '/login';
    return <div>Redirecting...</div>;
  }

  const [myRooms, setMyRooms] = createSignal<Room[]>([]);
  const [unreadCounts, setUnreadCounts] = createSignal<Record<string, number>>({});
  const [sidebarSearch, setSidebarSearch] = createSignal('');
  const [myAvatar, setMyAvatar] = createSignal(initialAvatar);

  const getApiBaseUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL as string;
    return apiUrl || 'http://localhost:8080';
  };

  let roomSignature = '';

  const syncRooms = (shouldReconnectNotifications = false) => {
    const rooms = readStoredRooms();
    setMyRooms(rooms);

    if (!shouldReconnectNotifications) return;

    const nextSignature = rooms.map((room) => room.id).sort().join('|');
    if (nextSignature !== roomSignature) {
      roomSignature = nextSignature;
      if ('Notification' in window && Notification.permission === 'granted') {
        initGlobalNotifications(userId, undefined);
      }
    }
  };

  const fetchDmRoomName = async (roomId: string) => {
    const otherUserId = extractDmOtherUserId(roomId, userId);
    if (!otherUserId) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/users/${otherUserId}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) return;

      const profile = await response.json();
      upsertStoredRoom({
        id: roomId,
        name: getDisplayName(profile.email || ''),
      }, { bumpTimestamp: false });
    } catch (_) {}
  };

  const hydrateRoomsFromUnread = async (counts: Record<string, number>) => {
    const knownRoomIds = new Set(readStoredRooms().map((room) => room.id));
    let discoveredRoom = false;

    for (const [roomId, unreadCount] of Object.entries(counts)) {
      if (knownRoomIds.has(roomId)) continue;

      upsertStoredRoom({
        id: roomId,
        name: getDefaultRoomName(roomId),
        lastMessage: unreadCount > 0 ? 'Pesan baru' : undefined,
      });
      knownRoomIds.add(roomId);
      discoveredRoom = true;

      if (roomId.startsWith('dm_')) {
        void fetchDmRoomName(roomId);
      }
    }

    if (discoveredRoom) {
      syncRooms(true);
    }
  };

  const fetchUnreadCounts = async () => {
    const tok = localStorage.getItem('token');
    if (!tok) return;
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/rooms/unread-counts`, {
        headers: { 'Authorization': `Bearer ${tok}` }
      });
      if (response.ok) {
        const previousCounts = unreadCounts();
        const counts = await response.json();
        setUnreadCounts(counts);
        await hydrateRoomsFromUnread(counts);

        for (const [roomId, count] of Object.entries(counts) as Array<[string, number]>) {
          const previousCount = previousCounts[roomId] || 0;
          if (count > previousCount && 'Notification' in window && Notification.permission === 'granted') {
            const room = readStoredRooms().find((entry) => entry.id === roomId);
            showMessageNotification(room?.name || 'Pesan baru', 'Ada pesan baru yang belum dibaca.', {
              roomId,
              tag: `unread-${roomId}-${count}`,
              silent: true,
            });
          }
        }
      }
    } catch (_) {}
  };

  onMount(() => {
    const refreshMyAvatar = () => setMyAvatar(localStorage.getItem('avatar_url') || '');

    const onProfileUpdated = () => refreshMyAvatar();
    window.addEventListener('profile:updated', onProfileUpdated as EventListener);
    onCleanup(() => window.removeEventListener('profile:updated', onProfileUpdated as EventListener));

    window.addEventListener('focus', refreshMyAvatar);
    window.addEventListener('pageshow', refreshMyAvatar);
    onCleanup(() => {
      window.removeEventListener('focus', refreshMyAvatar);
      window.removeEventListener('pageshow', refreshMyAvatar);
    });

    syncRooms(true);

    const unsubscribe = subscribeToStoredRooms((rooms) => {
      setMyRooms(rooms);
      const nextSignature = rooms.map((room) => room.id).sort().join('|');
      if (nextSignature !== roomSignature) {
        roomSignature = nextSignature;
        if ('Notification' in window && Notification.permission === 'granted') {
          initGlobalNotifications(userId, undefined);
        }
      }
    });
    onCleanup(unsubscribe);

    ensureNotificationPermission().then(granted => {
      if (granted) {
        initGlobalNotifications(userId, undefined);
        roomSignature = readStoredRooms().map((room) => room.id).sort().join('|');
      }
    });

    fetchUnreadCounts();
    const interval = setInterval(fetchUnreadCounts, 5000);
    onCleanup(() => clearInterval(interval));
  });

  onCleanup(() => {
    cleanupGlobalNotifications();
  });

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('myRooms');
    window.location.href = '/login';
  };

  const filteredRooms = () => {
    const q = sidebarSearch().toLowerCase();
    return myRooms().filter(r =>
      !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)
    );
  };

  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  return (
    <div class="app-layout">

      {/* Mobile sidebar overlay */}
      <div class={"sidebar-overlay" + (sidebarOpen() ? " drawer-open" : "")} onClick={() => setSidebarOpen(false)} />

      {/* Drawer: nav-strip + sidebar slide together on mobile */}
      <div class={"drawer" + (sidebarOpen() ? " drawer-open" : "")}>

      {/* ── Left Navigation Strip ── */}
      <nav class="nav-strip">
        <a href="/" class="nav-brand-icon" title="Home">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </a>
        <div class="nav-icons-group">
          <a href="/" class="nav-icon-btn active" title="Home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
          </a>
          <a href="/chat/general" class="nav-icon-btn" title="Chats">
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
        </div>
        <div class="nav-bottom-group">
          <button
            class="nav-icon-btn nav-avatar-btn"
            title="My Profile"
            onClick={() => window.location.href = '/profile'}
          >
            {myAvatar ? (
              <img src={myAvatar()} alt="You" class="nav-avatar-img" />
            ) : (
              <div class="nav-avatar-placeholder">
                {email[0].toUpperCase()}
              </div>
            )}
          </button>

          <button class="nav-icon-btn" title="Logout" onClick={logout}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Sidebar Chat List ── */}
      <aside class="sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">Chatting</span>
          <Show when={myRooms().length > 0}>
            <span class="sidebar-count">({myRooms().length})</span>
          </Show>
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
        <div class="sidebar-list">
          <div class="sidebar-section-label">
            General Chat
            <button class="sidebar-section-more">···</button>
          </div>
          {/* Default rooms */}
          {(['general', 'team', 'support'] as const).map((id) => {
            const names: Record<string, string> = { general: 'General Chat', team: 'Team Chat', support: 'Support' };
            const q = sidebarSearch().toLowerCase();
            if (q && !names[id].toLowerCase().includes(q)) return null;
            const unread = unreadCounts()[id] || 0;
            return (
              <a href={`/chat/${id}`} class="sidebar-room-item">
                <div class="sidebar-room-avatar">
                  <div class="sidebar-room-avatar-inner">{names[id][0]}</div>
                </div>
                <div class="sidebar-room-info">
                  <div class="sidebar-room-name">{names[id]}</div>
                  <div class="sidebar-room-preview">Tap to open room</div>
                </div>
                <div class="sidebar-room-meta">
                  {unread > 0 && (
                    <div class="sidebar-room-unread">{unread > 99 ? '99+' : unread}</div>
                  )}
                </div>
              </a>
            );
          })}

          <Show when={filteredRooms().length > 0}>
            <div class="sidebar-section-label" style="margin-top:10px;">
              My Rooms
              <button class="sidebar-section-more">···</button>
            </div>
            <For each={filteredRooms()}>
              {(room) => {
                const unread = unreadCounts()[room.id] || 0;
                return (
                  <a href={`/chat/${room.id}`} class="sidebar-room-item">
                    <div class="sidebar-room-avatar">
                      <div class="sidebar-room-avatar-inner">{room.name[0].toUpperCase()}</div>
                    </div>
                    <div class="sidebar-room-info">
                      <div class="sidebar-room-name">{room.name}</div>
                      <div class="sidebar-room-preview">{room.lastMessage || 'Open room'}</div>
                    </div>
                    <div class="sidebar-room-meta">
                      {unread > 0 && (
                        <div class="sidebar-room-unread">{unread > 99 ? '99+' : unread}</div>
                      )}
                    </div>
                  </a>
                );
              }}
            </For>
          </Show>

          <div style="padding: 16px 12px 8px;">
            <a href="/create-room" class="btn btn-primary" style="width:100%;justify-content:center;gap:8px;font-size:13px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Buat Room Baru
            </a>
          </div>
        </div>
        <div class="sidebar-footer">
          <a href="/profile" class="sidebar-footer-user" title="Edit Profile">
            {myAvatar ? (
              <img src={myAvatar()} class="sidebar-footer-avatar-img" alt="" />
            ) : (
              <div class="sidebar-footer-avatar-placeholder">{email[0].toUpperCase()}</div>
            )}
            <div class="sidebar-footer-info">
              <div class="sidebar-footer-name">{getDisplayName(email)}</div>
              <div class="sidebar-footer-email">{email}</div>
            </div>
          </a>
          <button class="sidebar-footer-logout-btn" onClick={logout} title="Logout">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </aside>

      </div>{/* end drawer */}

      {/* ── Main Welcome Area ── */}
      <main class="chat-main">
        {/* Mobile topbar with hamburger */}
        <div class="mobile-topbar">
          <button class="hamburger-btn" style="color:var(--text)" onClick={() => setSidebarOpen(o => !o)} title="Menu" aria-label="Open sidebar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <span class="mobile-topbar-title">Chatting</span>
        </div>
        <div class="home-welcome-area">
          <div class="home-welcome-card">
            {/* Lock icon */}
            <div class="home-lock-icon">
              <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </div>

            <h2 class="home-welcome-title">Mulai Chat!</h2>

            <p class="home-welcome-subtitle">
              Pilih percakapan di sebelah kiri atau buat room baru untuk memulai.
            </p>

            <div class="home-e2e-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <span>Pesan dilindungi enkripsi end-to-end</span>
            </div>

            <div class="home-quick-actions">
              <a href="/chat/general" class="home-quick-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                General Chat
              </a>
              <a href="/create-room" class="home-quick-btn home-quick-btn-outline">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Buat Room Privat
              </a>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
