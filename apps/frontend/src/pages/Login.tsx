import { createSignal } from 'solid-js';
import api from '../lib/api';

export default function Login() {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    
    // Prevent double-submit
    if (loading()) return;
    
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/api/auth/login', { email: email(), password: password() });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user_id', res.data.user_id);
      localStorage.setItem('email', email());
      if (res.data.avatar_url) {
        localStorage.setItem('avatar_url', res.data.avatar_url);
      }
      // Force full page reload to home
      window.location.replace('/');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div class="page-centered">
      <div class="auth-card">
        <h1>Welcome back</h1>
        <p class="muted" style={{ 'margin-bottom': '12px' }}>Login to start chatting</p>
        <form class="form" onSubmit={submit}>
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" value={email()} onInput={e => setEmail(e.currentTarget.value)} required />
          </div>
          <div>
            <label class="label">Password</label>
            <input class="input" type="password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required />
          </div>
          {error() && <p class="muted" style={{ color: 'var(--danger)' }}>{error()}</p>}
          <div class="row" style={{ 'justify-content': 'space-between', 'margin-top': '4px' }}>
            <a class="muted" href="/signup">Create account</a>
            <button class="btn btn-primary" type="submit" disabled={loading()}>
              {loading() ? 'Logging in...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
