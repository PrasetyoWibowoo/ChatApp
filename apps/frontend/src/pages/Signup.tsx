import { createSignal } from 'solid-js';
import api from '../lib/api';

export default function Signup() {
  const [email, setEmail] = createSignal('');
  const [username, setUsername] = createSignal('');
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
      // Create account
      const response = await api.post('/api/auth/signup', { 
        email: email(), 
        username: username(),
        password: password() 
      });

      // Store basic identity for convenience (auth token should be obtained after verification + login)
      localStorage.setItem('username', username());
      localStorage.setItem('email', email());

      // Redirect to verification page (it auto-sends the code on mount)
      window.location.href = `/verify-email?email=${encodeURIComponent(email())}`;
    } catch (err: any) {
      console.error('Signup error:', err);
      setError(err?.response?.data?.error || err?.response?.data?.message || err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="page-centered">
      <div class="auth-card">
        <h1>Create your account</h1>
        <p class="muted" style={{ 'margin-bottom': '12px' }}>Sign up to start collaborating</p>
        <form class="form" onSubmit={submit}>
          <div>
            <label class="label">Email</label>
            <input class="input" type="email" value={email()} onInput={e => setEmail(e.currentTarget.value)} required />
          </div>
          <div>
            <label class="label">Username</label>
            <input class="input" type="text" value={username()} onInput={e => setUsername(e.currentTarget.value)} required />
          </div>
          <div>
            <label class="label">Password</label>
            <input class="input" type="password" value={password()} onInput={e => setPassword(e.currentTarget.value)} required />
          </div>
          {error() && <p class="muted" style={{ color: 'var(--danger)' }}>{error()}</p>}
          <div class="row" style={{ 'justify-content': 'space-between', 'margin-top': '4px' }}>
            <a class="muted" href="/login">I already have an account</a>
            <button class="btn btn-primary" type="submit" disabled={loading()}>
              {loading() ? 'Creating account...' : 'Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
