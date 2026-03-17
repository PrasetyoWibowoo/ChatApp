import { createSignal, onMount, Show } from 'solid-js';
import { getDisplayName, getInitials } from '../lib/displayName';
import { getDmRoomId, upsertStoredRoom } from '../lib/rooms';

function getApiBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  return apiUrl || 'http://localhost:8080';
}

export default function Invite() {
  // Support two URL patterns:
  //   /invite/:userId  — invite link shared by a user
  //   /invite?code=XX   — invite code landing
  const parts = window.location.pathname.split('/');
  const userIdFromPath = parts[2] || '';
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromQuery = urlParams.get('code') || '';

  const token = localStorage.getItem('token');

  interface Profile {
    id: string;
    email: string;
    avatar_url?: string;
  }

  const [profile, setProfile] = createSignal<Profile | null>(null);
  const [loadError, setLoadError] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  const [addLoading, setAddLoading] = createSignal(false);
  const [addError, setAddError] = createSignal('');
  const [addDone, setAddDone] = createSignal(false);
  const [addMsg, setAddMsg] = createSignal('');

  const api = getApiBaseUrl();

  const loadProfile = async () => {
    if (!token) { window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`; return; }
    if (!userIdFromPath && !codeFromQuery) { setLoadError('Link tidak valid.'); setLoading(false); return; }

    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    try {
      let res: Response;
      if (userIdFromPath) {
        res = await fetch(`${api}/api/users/${userIdFromPath}/profile`, { headers });
      } else {
        res = await fetch(`${api}/api/users/by-invite/${codeFromQuery}`, { headers });
      }
      if (!res.ok) { setLoadError('Pengguna tidak ditemukan.'); return; }
      setProfile(await res.json());
    } catch (_) {
      setLoadError('Gagal memuat profil. Periksa koneksi kamu.');
    } finally {
      setLoading(false);
    }
  };

  onMount(loadProfile);

  const addFriend = async () => {
    if (!profile()) return;
    setAddLoading(true);
    setAddError('');
    try {
      const res = await fetch(`${api}/api/friends/request`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile()!.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.message || 'Gagal menambahkan');
      } else {
        setAddDone(true);
        setAddMsg(data.message || 'Permintaan dikirim!');
      }
    } catch (_) {
      setAddError('Terjadi kesalahan. Coba lagi.');
    } finally {
      setAddLoading(false);
    }
  };

  const goToDm = () => {
    if (!profile()) return;
    let myUserId = '';
    try { const p = JSON.parse(atob(token!.split('.')[1])); myUserId = p.sub || ''; } catch (_) {}
    if (!myUserId) return;
    const dmRoomId = getDmRoomId(myUserId, profile()!.id);
    upsertStoredRoom({ id: dmRoomId, name: getDisplayName(profile()!.email) });
    window.location.href = `/chat/${dmRoomId}`;
  };

  return (
    <div style="min-height:100vh;background:var(--bg-primary,#0d1117);display:flex;align-items:center;justify-content:center;padding:24px;">
      <div style="background:var(--bg-secondary,#161b22);border:1px solid var(--border,#21262d);border-radius:16px;padding:32px;max-width:400px;width:100%;text-align:center;">
        
        <Show when={loading()}>
          <div style="color:var(--muted,#8b949e);font-size:14px;">Memuat profil...</div>
        </Show>

        <Show when={loadError() && !loading()}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f85149" stroke-width="1.5" style="margin-bottom:16px;">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p style="color:#f85149;font-size:15px;margin-bottom:16px;">{loadError()}</p>
          <a href="/" class="btn btn-secondary" style="display:inline-block;text-decoration:none;padding:10px 20px;">Kembali ke Home</a>
        </Show>

        <Show when={profile() && !loading()}>
          <>
              {/* Avatar */}
              <div style="width:72px;height:72px;border-radius:50%;margin:0 auto 16px;background:linear-gradient(135deg,#06b6d4,#0891b2);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;overflow:hidden;">
                {profile()!.avatar_url
                  ? <img src={profile()!.avatar_url} alt="" style="width:100%;height:100%;object-fit:cover;"/>
                  : getInitials(profile()!.email)
                }
              </div>

              <h2 style="margin:0 0 4px;font-size:20px;color:var(--text-primary,#e6edf3);">{getDisplayName(profile()!.email)}</h2>
              <p style="margin:0 0 24px;font-size:13px;color:var(--muted,#8b949e);">{profile()!.email}</p>

              <p style="font-size:13px;color:var(--muted,#8b949e);margin-bottom:20px;">
                Kamu diundang untuk bergabung ke kontak {getDisplayName(profile()!.email)}.
              </p>

              <Show when={!addDone()}>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <button
                    class="btn btn-primary"
                    style="width:100%;padding:10px;"
                    onClick={addFriend}
                    disabled={addLoading()}
                  >
                    {addLoading() ? 'Mengirim...' : '+ Tambah sebagai Kontak'}
                  </button>
                  <button class="btn btn-secondary" style="width:100%;padding:10px;" onClick={goToDm}>
                    Kirim Pesan Langsung
                  </button>
                </div>
                <Show when={addError()}>
                  <p style="color:#f85149;font-size:13px;margin-top:10px;">{addError()}</p>
                </Show>
              </Show>

              <Show when={addDone()}>
                <p style="color:#3fb950;font-size:14px;margin-bottom:16px;">✓ {addMsg()}</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <button class="btn btn-primary" style="width:100%;padding:10px;" onClick={goToDm}>
                    Kirim Pesan Langsung
                  </button>
                  <a href="/contacts" class="btn btn-secondary" style="width:100%;padding:10px;display:block;text-decoration:none;">
                    Lihat Kontak
                  </a>
                </div>
              </Show>
          </>
        </Show>

        <div style="margin-top:24px;border-top:1px solid var(--border,#21262d);padding-top:16px;">
          <a href="/" style="font-size:12px;color:var(--muted,#8b949e);text-decoration:none;">← Kembali ke Home</a>
        </div>
      </div>
    </div>
  );
}
