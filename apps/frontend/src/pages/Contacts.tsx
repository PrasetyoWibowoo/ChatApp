import { createSignal, onCleanup, onMount, For, Show } from 'solid-js';
import { getDisplayName, getInitials } from '../lib/displayName';
import { getDmRoomId, upsertStoredRoom } from '../lib/rooms';

function getApiBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  return apiUrl || 'http://localhost:8080';
}

interface Friend {
  id: string;
  user_id: string;
  email: string;
  avatar_url?: string;
  status: 'pending' | 'accepted';
  direction: 'sent' | 'received';
}

export default function Contacts() {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login'; return <div/>; }

  let myUserId = '';
  try {
    const p = JSON.parse(atob(token.split('.')[1]));
    myUserId = p.sub || '';
  } catch (_) { window.location.href = '/login'; return <div/>; }

  const [friends, setFriends] = createSignal<Friend[]>([]);
  const [loading, setLoading] = createSignal(true);

  const [myAvatarUrl, setMyAvatarUrl] = createSignal(localStorage.getItem('avatar_url') || '');
  const [myEmail, setMyEmail] = createSignal(localStorage.getItem('email') || '');

  // Add friend modal
  const [showAdd, setShowAdd] = createSignal(false);
  const [addTab, setAddTab] = createSignal<'email' | 'code' | 'link'>('email');
  const [addEmail, setAddEmail] = createSignal('');
  const [addCode, setAddCode] = createSignal('');
  const [addLoading, setAddLoading] = createSignal(false);
  const [addError, setAddError] = createSignal('');
  const [addSuccess, setAddSuccess] = createSignal('');

  // My invite code / link
  const [myCode, setMyCode] = createSignal('');
  const [codeLoading, setCodeLoading] = createSignal(true);
  const [codeError, setCodeError] = createSignal(false);
  const [codeCopied, setCodeCopied] = createSignal(false);
  const [linkCopied, setLinkCopied] = createSignal(false);

  const api = getApiBaseUrl();
  const headers = () => ({ Authorization: `Bearer ${token}` });

  const loadFriends = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${api}/api/friends`, { headers: headers() });
      if (res.ok) setFriends(await res.json());
    } finally {
      setLoading(false);
    }
  };

  const loadMyCode = async () => {
    setCodeLoading(true);
    setCodeError(false);
    try {
      const res = await fetch(`${api}/api/users/invite-code`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setMyCode(data.code || '');
      } else {
        setCodeError(true);
      }
    } catch (_) {
      setCodeError(true);
    } finally {
      setCodeLoading(false);
    }
  };

  const refreshMyProfileFromStorage = () => {
    setMyAvatarUrl(localStorage.getItem('avatar_url') || '');
    setMyEmail(localStorage.getItem('email') || '');
  };

  onMount(() => {
    refreshMyProfileFromStorage();
    loadFriends();
    loadMyCode();

    const onProfileUpdated = () => refreshMyProfileFromStorage();
    window.addEventListener('profile:updated', onProfileUpdated);
    onCleanup(() => window.removeEventListener('profile:updated', onProfileUpdated));

    window.addEventListener('focus', onProfileUpdated);
    window.addEventListener('pageshow', onProfileUpdated);
    onCleanup(() => {
      window.removeEventListener('focus', onProfileUpdated);
      window.removeEventListener('pageshow', onProfileUpdated);
    });
  });

  const addFriend = async () => {
    setAddError('');
    setAddSuccess('');
    setAddLoading(true);
    try {
      const body: Record<string, string> = {};
      if (addTab() === 'email') body.email = addEmail().trim();
      else if (addTab() === 'code') body.invite_code = addCode().trim().toUpperCase();

      const res = await fetch(`${api}/api/friends/request`, {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.message || 'Gagal menambahkan kontak');
      } else {
        setAddSuccess(data.message || 'Permintaan dikirim!');
        setAddEmail('');
        setAddCode('');
        loadFriends();
      }
    } catch (_) {
      setAddError('Terjadi kesalahan. Coba lagi.');
    } finally {
      setAddLoading(false);
    }
  };

  const acceptRequest = async (id: string) => {
    const res = await fetch(`${api}/api/friends/${id}/accept`, {
      method: 'POST',
      headers: headers(),
    });
    if (res.ok) loadFriends();
  };

  const removeFriend = async (id: string) => {
    if (!confirm('Hapus kontak ini?')) return;
    const res = await fetch(`${api}/api/friends/${id}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (res.ok) setFriends(f => f.filter(x => x.id !== id));
  };

  const navigateToDm = (otherUserId: string, otherEmail: string) => {
    const dmRoomId = getDmRoomId(myUserId, otherUserId);
    upsertStoredRoom({ id: dmRoomId, name: getDisplayName(otherEmail) });
    window.location.href = `/chat/${dmRoomId}`;
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(myCode());
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (_) {}
  };

  const copyLink = async () => {
    const link = myCode()
      ? `${window.location.origin}/invite/${myUserId}`
      : '';
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (_) {}
  };

  const acceptedFriends = () => friends().filter(f => f.status === 'accepted');
  const pendingReceived = () => friends().filter(f => f.status === 'pending' && f.direction === 'received');
  const pendingSent     = () => friends().filter(f => f.status === 'pending' && f.direction === 'sent');
  const [sidebarOpen, setSidebarOpen] = createSignal(false);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('myRooms');
    window.location.href = '/login';
  };

  return (
    <div class="app-layout">
      {/* Mobile sidebar overlay */}
      <div class={"sidebar-overlay" + (sidebarOpen() ? " drawer-open" : "")} onClick={() => setSidebarOpen(false)} />

      {/* Drawer wraps nav-strip on mobile */}
      <div class={"drawer" + (sidebarOpen() ? " drawer-open" : "")}>
      {/* Left nav strip */}
      <nav class="nav-strip">
        <a href="/" class="nav-brand-icon" title="Home">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </a>
        <div class="nav-icons-group">
          <a href="/" class="nav-icon-btn" title="Home">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
          </a>
          <a href="/chat/general" class="nav-icon-btn" title="Chats">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </a>
          <a href="/contacts" class="nav-icon-btn active" title="Kontak">
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
            onClick={() => { window.location.href = '/profile'; }}
          >
            {myAvatarUrl() ? (
              <img src={myAvatarUrl()} alt="You" class="nav-avatar-img" />
            ) : (
              <div class="nav-avatar-placeholder">
                {(myEmail() || 'U')[0].toUpperCase()}
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
      </div>{/* end drawer */}

      {/* Main content */}
      <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary,#0d1117);">
        {/* Header */}
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border,#21262d);background:var(--bg-secondary,#161b22);">
          <button class="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} title="Menu" aria-label="Open sidebar">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <h1 style="margin:0;font-size:18px;font-weight:600;color:var(--text-primary,#e6edf3);">Kontak</h1>
          <button
            class="btn btn-primary"
            style="margin-left:auto;padding:8px 16px;font-size:13px;display:flex;align-items:center;gap:6px;"
            onClick={() => { setShowAdd(true); setAddError(''); setAddSuccess(''); }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Tambah Kontak
          </button>
        </div>

        <div style="flex:1;overflow-y:auto;padding:20px 24px;max-width:720px;width:100%;margin:0 auto;">

          {/* My invite code/link card — always visible */}
          <div style="background:var(--bg-secondary,#161b22);border:1px solid var(--border,#21262d);border-radius:12px;padding:16px;margin-bottom:20px;">
            <div style="font-size:13px;color:var(--muted,#8b949e);margin-bottom:10px;font-weight:500;">🔑 Kode Undangan Saya</div>
            <Show when={codeLoading()}>
              <div style="color:var(--muted,#8b949e);font-size:13px;">Memuat kode...</div>
            </Show>
            <Show when={!codeLoading() && codeError()}>
              <p style="color:#f85149;font-size:13px;margin-bottom:8px;">Gagal memuat kode. Pastikan backend berjalan.</p>
              <button class="btn btn-secondary" style="padding:6px 14px;font-size:12px;" onClick={loadMyCode}>Coba Lagi</button>
            </Show>
            <Show when={!codeLoading() && !codeError()}>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                <div style="background:var(--bg-tertiary,#21262d);border-radius:8px;padding:8px 14px;font-family:monospace;font-size:20px;font-weight:700;letter-spacing:4px;color:var(--accent,#58a6ff);">
                  {myCode() || '—'}
                </div>
                <button class="btn btn-secondary" style="padding:7px 14px;font-size:12px;" onClick={copyCode} disabled={!myCode()}>
                  {codeCopied() ? '✓ Disalin!' : 'Salin Kode'}
                </button>
                <button class="btn btn-secondary" style="padding:7px 14px;font-size:12px;" onClick={copyLink} disabled={!myCode()}>
                  {linkCopied() ? '✓ Disalin!' : 'Salin Link'}
                </button>
              </div>
              <div style="margin-top:10px;font-size:12px;color:var(--muted,#8b949e);word-break:break-all;">
                <span style="opacity:.7;">Link: </span>
                <span style="color:var(--accent,#58a6ff);">{myUserId ? `${window.location.origin}/invite/${myUserId}` : '—'}</span>
              </div>
              <div style="margin-top:6px;font-size:11px;color:var(--muted,#8b949e);">
                Bagikan kode atau link ini agar orang lain bisa menambahkan kamu sebagai kontak.
              </div>
            </Show>
          </div>

          {/* Pending received requests */}
          <Show when={pendingReceived().length > 0}>
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;font-weight:600;color:var(--muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
                Permintaan Masuk ({pendingReceived().length})
              </div>
              <For each={pendingReceived()}>
                {(f) => (
                  <div style="display:flex;align-items:center;gap:12px;background:var(--bg-secondary,#161b22);border:1px solid var(--accent,#388bfd);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
                    <div class="user-avatar" style="background:linear-gradient(135deg,#f59e0b,#d97706);flex-shrink:0;">
                      {f.avatar_url
                        ? <img src={f.avatar_url} alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>
                        : getInitials(f.email)
                      }
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:500;color:var(--text-primary,#e6edf3);font-size:14px;">{getDisplayName(f.email)}</div>
                      <div style="font-size:12px;color:var(--muted,#8b949e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.email}</div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                      <button class="btn btn-primary" style="padding:6px 12px;font-size:12px;" onClick={() => acceptRequest(f.id)}>Terima</button>
                      <button class="btn btn-secondary" style="padding:6px 12px;font-size:12px;" onClick={() => removeFriend(f.id)}>Tolak</button>
                    </div>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Accepted friends */}
          <div style="margin-bottom:20px;">
            <div style="font-size:12px;font-weight:600;color:var(--muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
              Kontak ({acceptedFriends().length})
            </div>
            <Show when={loading()}>
              <div style="text-align:center;padding:32px;color:var(--muted,#8b949e);font-size:14px;">Memuat...</div>
            </Show>
            <Show when={!loading() && acceptedFriends().length === 0}>
              <div style="text-align:center;padding:40px;color:var(--muted,#8b949e);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom:12px;opacity:.4;">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <div style="font-size:14px;margin-bottom:8px;">Belum ada kontak</div>
                <div style="font-size:12px;">Tambahkan teman lewat email, kode, atau link undangan.</div>
              </div>
            </Show>
            <For each={acceptedFriends()}>
              {(f) => (
                <div style="display:flex;align-items:center;gap:12px;background:var(--bg-secondary,#161b22);border:1px solid var(--border,#21262d);border-radius:10px;padding:12px 14px;margin-bottom:8px;">
                  <div class="user-avatar" style="background:linear-gradient(135deg,#06b6d4,#0891b2);flex-shrink:0;">
                    {f.avatar_url
                      ? <img src={f.avatar_url} alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>
                      : getInitials(f.email)
                    }
                  </div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:500;color:var(--text-primary,#e6edf3);font-size:14px;">{getDisplayName(f.email)}</div>
                    <div style="font-size:12px;color:var(--muted,#8b949e);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{f.email}</div>
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0;">
                    <button
                      class="btn btn-primary"
                      style="padding:6px 12px;font-size:12px;display:flex;align-items:center;gap:4px;"
                      onClick={() => navigateToDm(f.user_id, f.email)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      Pesan
                    </button>
                    <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px;" title="Hapus kontak" onClick={() => removeFriend(f.id)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>

          {/* Pending sent */}
          <Show when={pendingSent().length > 0}>
            <div>
              <div style="font-size:12px;font-weight:600;color:var(--muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
                Menunggu Konfirmasi ({pendingSent().length})
              </div>
              <For each={pendingSent()}>
                {(f) => (
                  <div style="display:flex;align-items:center;gap:12px;background:var(--bg-secondary,#161b22);border:1px solid var(--border,#21262d);border-radius:10px;padding:12px 14px;margin-bottom:8px;opacity:.75;">
                    <div class="user-avatar" style="background:linear-gradient(135deg,#8b949e,#6e7681);flex-shrink:0;">
                      {f.avatar_url
                        ? <img src={f.avatar_url} alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;"/>
                        : getInitials(f.email)
                      }
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="font-weight:500;color:var(--text-primary,#e6edf3);font-size:14px;">{getDisplayName(f.email)}</div>
                      <div style="font-size:12px;color:var(--muted,#8b949e);">Menunggu konfirmasi...</div>
                    </div>
                    <button class="btn btn-secondary" style="padding:6px 10px;font-size:12px;" onClick={() => removeFriend(f.id)}>Batalkan</button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Add Friend Modal */}
      <Show when={showAdd()}>
        <div class="modal-overlay" onClick={() => setShowAdd(false)}>
          <div class="modal-content" style="max-width:440px;" onClick={(e) => e.stopPropagation()}>
            <h3 style="margin-bottom:4px;">Tambah Kontak</h3>
            <p style="margin:0 0 16px;font-size:13px;color:var(--muted,#8b949e);">Cari teman lewat email, kode undangan, atau buka link undangan mereka.</p>

            {/* Tabs */}
            <div class="dm-modal-tabs" style="margin-bottom:16px;">
              <button class={`dm-tab${addTab() === 'email' ? ' active' : ''}`} onClick={() => setAddTab('email')}>Email</button>
              <button class={`dm-tab${addTab() === 'code' ? ' active' : ''}`} onClick={() => setAddTab('code')}>Kode Undangan</button>
            </div>

            <Show when={addTab() === 'email'}>
              <div class="dm-search-row" style="margin-bottom:12px;">
                <input
                  class="dm-search-input"
                  type="email"
                  placeholder="Email pengguna..."
                  value={addEmail()}
                  onInput={(e) => setAddEmail(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addFriend(); }}
                />
                <button class="btn btn-primary dm-search-btn" onClick={addFriend} disabled={addLoading() || !addEmail().trim()}>
                  {addLoading() ? '...' : 'Tambah'}
                </button>
              </div>
            </Show>

            <Show when={addTab() === 'code'}>
              <div style="margin-bottom:12px;">
                <p style="font-size:13px;color:var(--muted,#8b949e);margin-bottom:10px;">Masukkan kode undangan 8 karakter dari teman kamu:</p>
                <div class="dm-search-row">
                  <input
                    class="dm-search-input"
                    type="text"
                    placeholder="Contoh: AB12CD34"
                    value={addCode()}
                    maxLength={8}
                    style="font-family:monospace;font-size:16px;letter-spacing:2px;text-transform:uppercase;"
                    onInput={(e) => setAddCode(e.currentTarget.value.toUpperCase())}
                    onKeyDown={(e) => { if (e.key === 'Enter') addFriend(); }}
                  />
                  <button class="btn btn-primary dm-search-btn" onClick={addFriend} disabled={addLoading() || addCode().trim().length < 6}>
                    {addLoading() ? '...' : 'Tambah'}
                  </button>
                </div>
              </div>
            </Show>

            <Show when={addError()}>
              <p class="dm-search-error" style="margin-bottom:8px;">{addError()}</p>
            </Show>
            <Show when={addSuccess()}>
              <p style="color:#3fb950;font-size:13px;margin-bottom:8px;">✓ {addSuccess()}</p>
            </Show>

            {/* Share own code/link — always visible */}
            <div class="dm-invite-section" style="margin-top:16px;">
              <p class="dm-invite-label">Kode undangan kamu:</p>
              <Show when={codeLoading()}>
                <span style="font-size:13px;color:var(--muted,#8b949e);">Memuat...</span>
              </Show>
              <Show when={!codeLoading() && codeError()}>
                <span style="font-size:13px;color:#f85149;">Gagal. </span>
                <button class="btn dm-copy-btn" onClick={loadMyCode}>Coba Lagi</button>
              </Show>
              <Show when={!codeLoading() && !codeError()}>
                <div class="dm-invite-row">
                  <span class="dm-invite-link" style="font-family:monospace;font-size:16px;letter-spacing:3px;font-weight:700;color:var(--accent,#58a6ff);">{myCode() || '—'}</span>
                  <button class="btn dm-copy-btn" onClick={copyCode} disabled={!myCode()}>{codeCopied() ? '✓' : 'Salin Kode'}</button>
                  <button class="btn dm-copy-btn" onClick={copyLink} style="margin-left:4px;" disabled={!myCode()}>{linkCopied() ? '✓ Link!' : 'Salin Link'}</button>
                </div>
              </Show>
            </div>

            <button class="btn btn-secondary" style="width:100%;margin-top:16px;" onClick={() => setShowAdd(false)}>Tutup</button>
          </div>
        </div>
      </Show>
    </div>
  );
}
