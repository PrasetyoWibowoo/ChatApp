import { createSignal } from 'solid-js';
import api from '../lib/api';
import { sendVerificationCode } from '../lib/api';

export default function Signup() {
  const [email, setEmail] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);
  const [loading, setLoading] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    
    try {
      // Create account
      await api.post('/api/auth/signup', { email: email(), password: password() });
      
      // Send verification code
      await sendVerificationCode(email());
      
      // Redirect to verification page with email
      window.location.href = `/verify-email?email=${encodeURIComponent(email())}`;
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Signup failed');
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
