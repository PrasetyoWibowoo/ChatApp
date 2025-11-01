import { createSignal, Show, onMount } from 'solid-js';
import { sendVerificationCode, verifyEmail } from '../lib/api';

export default function EmailVerification() {
  // Get email from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const [email, setEmail] = createSignal(urlParams.get('email') || '');
  const [code, setCode] = createSignal('');
  const [error, setError] = createSignal('');
  const [success, setSuccess] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [resending, setResending] = createSignal(false);
  const [countdown, setCountdown] = createSignal(0);

  onMount(() => {
    // Auto-send verification code on mount if email is present
    if (email()) {
      handleSendCode();
    }
  });

  const handleSendCode = async () => {
    if (!email().trim()) {
      setError('Please enter your email');
      return;
    }

    setResending(true);
    setError('');
    setSuccess('');

    try {
      await sendVerificationCode(email());
      setSuccess('Verification code sent to your email!');
      setCountdown(60);
      
      // Countdown timer for resend button
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to send verification code');
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async (e: Event) => {
    e.preventDefault();
    
    if (!email().trim() || !code().trim()) {
      setError('Please enter email and verification code');
      return;
    }

    if (code().length !== 6) {
      setError('Verification code must be 6 characters');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await verifyEmail(email(), code().toUpperCase());
      setSuccess('Email verified successfully! Redirecting to login...');
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="page-centered">
      <div class="auth-card">
        <h1>Verify Your Email</h1>
        <p class="muted" style={{ 'margin-bottom': '12px' }}>Enter the 6-digit code sent to your email</p>

        <form class="form" onSubmit={handleVerify}>
          <div>
            <label class="label">Email Address</label>
            <input
              class="input"
              type="email"
              value={email()}
              onInput={(e) => setEmail(e.currentTarget.value)}
              disabled={!!urlParams.get('email')}
              placeholder="your@email.com"
              style={{
                'background-color': urlParams.get('email') ? 'var(--bg-secondary)' : 'var(--bg-primary)',
                opacity: urlParams.get('email') ? '0.6' : '1',
              }}
            />
          </div>

          <div>
            <label class="label">Verification Code</label>
            <input
              class="input"
              type="text"
              value={code()}
              onInput={(e) => {
                const val = e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                if (val.length <= 6) setCode(val);
              }}
              placeholder="XXXXXX"
              maxLength={6}
              style={{
                'font-size': '18px',
                'letter-spacing': '8px',
                'text-align': 'center',
                'font-weight': '600',
                'text-transform': 'uppercase',
              }}
            />
          </div>

          <Show when={error()}>
            <p class="muted" style={{ color: 'var(--danger)', 'margin-top': '8px' }}>{error()}</p>
          </Show>

          <Show when={success()}>
            <p class="muted" style={{ color: 'var(--success)', 'margin-top': '8px' }}>{success()}</p>
          </Show>

          <button
            type="submit"
            class="btn btn-primary"
            disabled={loading() || !code() || code().length !== 6}
            style={{
              width: '100%',
              'margin-top': '8px',
            }}
          >
            {loading() ? 'Verifying...' : 'Verify Email'}
          </button>

          <div style={{ 'text-align': 'center', 'margin-top': '12px' }}>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={resending() || countdown() > 0}
              class="muted"
              style={{
                background: 'none',
                border: 'none',
                cursor: resending() || countdown() > 0 ? 'not-allowed' : 'pointer',
                'text-decoration': 'underline',
                opacity: countdown() > 0 ? '0.5' : '1',
              }}
            >
              {resending() ? 'Sending...' : countdown() > 0 ? `Resend code in ${countdown()}s` : 'Resend verification code'}
            </button>
          </div>

          <div class="row" style={{ 'justify-content': 'center', 'margin-top': '16px' }}>
            <a class="muted" href="/login">Already verified? Login</a>
          </div>
        </form>
      </div>
    </div>
  );
}
