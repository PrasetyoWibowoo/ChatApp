import { createSignal, onMount, Show } from 'solid-js';

function getApiBaseUrl() {
  const apiUrl = import.meta.env.VITE_API_URL as string;
  return apiUrl || 'http://localhost:8080';
}

export default function Profile() {
  const [email, setEmail] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [bio, setBio] = createSignal('');
  const [avatarUrl, setAvatarUrl] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(false);
  const [error, setError] = createSignal('');

  let fileInputRef: HTMLInputElement | undefined;

  onMount(() => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }
    setEmail(localStorage.getItem('email') || '');
    setAvatarUrl(localStorage.getItem('avatar_url') || '');
    setDisplayName(localStorage.getItem('display_name') || '');
    setBio(localStorage.getItem('bio') || '');
  });

  const handleAvatarChange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Pilih file gambar yang valid'); return; }
    if (file.size > 900_000) { setError('Gambar harus lebih kecil dari 900KB'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      localStorage.setItem('display_name', displayName());
      localStorage.setItem('bio', bio());

      const currentAvatar = localStorage.getItem('avatar_url') || '';
      if (avatarUrl() && avatarUrl() !== currentAvatar) {
        const token = localStorage.getItem('token');
        const res = await fetch(`${getApiBaseUrl()}/api/user/avatar`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ avatar_url: avatarUrl() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as any).error || 'Gagal mengupdate avatar');
        }
        localStorage.setItem('avatar_url', avatarUrl());
      }

      // Notify other mounted pages (Chat/Home/Contacts) to refresh cached profile UI
      window.dispatchEvent(new CustomEvent('profile:updated'));

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  const initials = () => (displayName() || email() || 'U')[0].toUpperCase();

  return (
    <div class="profile-page">
      <div class="profile-card">
        <div class="profile-header">
          <button class="profile-back-btn" onClick={() => window.history.back()} title="Kembali">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 class="profile-title">Edit Profile</h1>
        </div>

        {/* Avatar */}
        <div class="profile-avatar-section">
          <div class="profile-avatar-wrap">
            <Show when={avatarUrl()} fallback={
              <div class="profile-avatar-placeholder">{initials()}</div>
            }>
              <img src={avatarUrl()} alt="Avatar" class="profile-avatar-img" />
            </Show>
            <button class="profile-avatar-edit" onClick={() => fileInputRef?.click()} title="Ganti foto">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style="display:none"
              onChange={handleAvatarChange}
            />
          </div>
          <p class="profile-email-badge">{email()}</p>
        </div>

        {/* Form Fields */}
        <div class="profile-form">
          <div class="profile-field">
            <label class="profile-label">Display Name</label>
            <input
              class="input"
              type="text"
              placeholder={email().split('@')[0] || 'Nama kamu'}
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              maxLength={50}
            />
          </div>

          <div class="profile-field">
            <label class="profile-label">Bio</label>
            <textarea
              class="input profile-bio-input"
              placeholder="Ceritakan sedikit tentang dirimu..."
              value={bio()}
              onInput={(e) => setBio(e.currentTarget.value)}
              maxLength={200}
              rows={3}
            />
            <span class="profile-char-count">{bio().length}/200</span>
          </div>

          <Show when={error()}>
            <p class="profile-error">{error()}</p>
          </Show>

          <button
            class="btn btn-primary profile-save-btn"
            onClick={handleSave}
            disabled={saving()}
          >
            {saving() ? 'Menyimpan...' : saved() ? '✓ Tersimpan!' : 'Simpan Perubahan'}
          </button>

          <button
            class="btn profile-logout-btn"
            onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
