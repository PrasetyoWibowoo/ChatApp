import { createSignal, onMount, onCleanup, For } from 'solid-js';
import { GlobeIcon, PlusIcon, MessageIcon, BriefcaseIcon, HelpIcon } from '../components/Icons';
import { initGlobalNotifications, cleanupGlobalNotifications, ensureNotificationPermission } from '../lib/notifications';

interface Room {
  id: string;
  name: string;
  lastMessage?: string;
  timestamp?: string;
}

export default function Home() {
  // Check token immediately before rendering
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return <div>Redirecting...</div>;
  }

  let email = 'User';
  let userId = '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    email = payload.email || 'User';
    userId = payload.sub || '';
  } catch (e) {
    console.error('Failed to decode token', e);
    localStorage.removeItem('token');
    window.location.href = '/login';
    return <div>Redirecting...</div>;
  }

  const [userEmail, setUserEmail] = createSignal(email);
  const [myRooms, setMyRooms] = createSignal<Room[]>([]);
  const [unreadCounts, setUnreadCounts] = createSignal<Record<string, number>>({});

  const getApiBaseUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL as string;
    return apiUrl || 'http://localhost:8080';
  };

  const fetchUnreadCounts = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const apiBase = getApiBaseUrl();
    try {
      const response = await fetch(`${apiBase}/api/rooms/unread-counts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const counts = await response.json();
        setUnreadCounts(counts);
      }
    } catch (err) {
      console.error('Failed to fetch unread counts:', err);
    }
  };

  onMount(() => {
    // Load rooms from localStorage
    const savedRooms = localStorage.getItem('myRooms');
    if (savedRooms) {
      try {
        setMyRooms(JSON.parse(savedRooms));
      } catch (e) {
        console.error('Failed to parse rooms', e);
      }
    }
    
    // Request notification permission
    console.log('[Home] User ID:', userId.substring(0, 8), 'Requesting notification permission...');
    ensureNotificationPermission().then(granted => {
      console.log('[Home] Notification permission result:', granted);
      if (granted) {
        console.log('[Home] Initializing global notifications for user:', userId.substring(0, 8));
        // Initialize global notifications for all rooms
        initGlobalNotifications(userId, undefined); // undefined = not in any specific room
      } else {
        console.warn('[Home] Notification permission denied - notifications will not work');
        alert('⚠️ Notification permission diperlukan untuk menerima notifikasi pesan baru!\n\nSilakan klik "Allow" atau "Izinkan" saat browser meminta permission.');
      }
    });
    
    // Fetch unread counts
    fetchUnreadCounts();
    
    // Poll unread counts every 5 seconds
    const interval = setInterval(fetchUnreadCounts, 5000);
    
    return () => {
      clearInterval(interval);
    };
  });

  onCleanup(() => {
    // Cleanup global notifications when leaving home
    cleanupGlobalNotifications();
  });

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('myRooms');
    window.location.href = '/login';
  };

  const navigate = (path: string) => {
    window.location.href = path;
  };

  const addRoom = (roomId: string, roomName?: string) => {
    const room: Room = {
      id: roomId,
      name: roomName || roomId,
      timestamp: new Date().toISOString(),
    };
    
    const rooms = myRooms();
    const exists = rooms.find(r => r.id === roomId);
    if (!exists) {
      const updated = [room, ...rooms];
      setMyRooms(updated);
      localStorage.setItem('myRooms', JSON.stringify(updated));
    }
  };

  const removeRoom = (roomId: string) => {
    const updated = myRooms().filter(r => r.id !== roomId);
    setMyRooms(updated);
    localStorage.setItem('myRooms', JSON.stringify(updated));
  };

  return (
    <div class="page-container">
      <div class="topbar">
        <div class="topbar-inner">
          <div class="brand">Chat App</div>
          <div class="spacer" />
          <span class="muted">Welcome, {userEmail()}</span>
          <button onClick={logout} class="btn btn-ghost">Logout</button>
        </div>
      </div>

      <div class="dashboard-container">
        <div class="welcome-section">
          <h1>Welcome back, {userEmail()}!</h1>
          <p class="muted" style="font-size: 1.1rem; margin-top: 0.5rem;">
            What would you like to do today?
          </p>
        </div>

        <div class="action-cards">
          <div class="action-card" onClick={() => navigate('/chat/general')}>
            <div class="action-icon"><GlobeIcon /></div>
            <h3>General Chat</h3>
            <p>Join the public chat room</p>
            <button class="btn btn-primary" style="margin-top: 1rem;">
              Join Now →
            </button>
          </div>

          <div class="action-card" onClick={() => navigate('/create-room')}>
            <div class="action-icon"><PlusIcon /></div>
            <h3>Create Private Room</h3>
            <p>Generate a unique link to share</p>
            <button class="btn btn-primary" style="margin-top: 1rem;">
              Create Room →
            </button>
          </div>
        </div>

        <div class="recent-section" style="margin-top: 3rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h2 style="margin: 0;">My Rooms</h2>
            <button onClick={() => navigate('/create-room')} class="btn btn-ghost" style="font-size: 0.9rem;">
              + New Room
            </button>
          </div>
          
          {myRooms().length === 0 ? (
            <div style="text-align: center; padding: 3rem 1rem; background: var(--panel); border: 1px solid var(--border); border-radius: 12px;">
              <p class="muted" style="font-size: 1.1rem; margin-bottom: 1rem;">No rooms yet</p>
              <p class="muted" style="margin-bottom: 1.5rem;">Create a private room or join a public one to get started</p>
              <button onClick={() => navigate('/create-room')} class="btn btn-primary">
                Create Your First Room
              </button>
            </div>
          ) : (
            <div class="quick-links">
              <For each={myRooms()}>
                {(room) => {
                  const unread = unreadCounts()[room.id] || 0;
                  return (
                  <div class="quick-link-card" style="position: relative;">
                    <a href={`/chat/${room.id}`} style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                      <span style="display: flex; align-items: center;"><MessageIcon /></span>
                      <div>
                        <strong>{room.name}</strong>
                        <p class="muted" style="font-size: 0.9rem;">
                          {room.lastMessage || `Room: ${room.id.substring(0, 20)}...`}
                        </p>
                      </div>
                      {unread > 0 && (
                        <div class="unread-badge">{unread > 99 ? '99+' : unread}</div>
                      )}
                    </a>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm(`Remove "${room.name}" from your list?`)) {
                          removeRoom(room.id);
                        }
                      }}
                      class="btn btn-ghost"
                      style="position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); padding: 0.5rem; font-size: 1.2rem;"
                      title="Remove room"
                    >
                      ×
                    </button>
                  </div>
                  );
                }}
              </For>
            </div>
          )}
        </div>

        <div class="recent-section" style="margin-top: 3rem;">
          <h2 style="margin-bottom: 1rem;">Quick Links</h2>
          <div class="quick-links">
            <a href="/chat/general" class="quick-link-card" onClick={() => addRoom('general', 'General Chat')}>
              <span style="display: flex; align-items: center;"><GlobeIcon /></span>
              <div>
                <strong>General Chat</strong>
                <p class="muted" style="font-size: 0.9rem;">Public chat for everyone</p>
              </div>
            </a>
            <a href="/chat/team" class="quick-link-card" onClick={() => addRoom('team', 'Team Chat')}>
              <span style="display: flex; align-items: center;"><BriefcaseIcon /></span>
              <div>
                <strong>Team Chat</strong>
                <p class="muted" style="font-size: 0.9rem;">Collaborate with your team</p>
              </div>
            </a>
            <a href="/chat/support" class="quick-link-card" onClick={() => addRoom('support', 'Support')}>
              <span style="display: flex; align-items: center;"><HelpIcon /></span>
              <div>
                <strong>Support</strong>
                <p class="muted" style="font-size: 0.9rem;">Get help from support team</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
