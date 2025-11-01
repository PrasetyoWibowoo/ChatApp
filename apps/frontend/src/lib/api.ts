import axios from 'axios';

// Auto-detect API base URL
// Priority: VITE_API_URL env var > derive from current hostname
const getApiBaseUrl = () => {
  // If explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Use the same hostname as frontend but port 8080
  // This ensures localhost->localhost and IP->IP
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  
  // Special case: if hostname is empty or localhost variants, ensure localhost
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8080';
  }
  
  return `${protocol}//${hostname}:8080`;
};

const api = axios.create({ baseURL: getApiBaseUrl() });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers = config.headers ?? {} as any;
    (config.headers as any).Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;

// Email verification API functions
export async function sendVerificationCode(email: string): Promise<void> {
  try {
    await api.post('/api/auth/send-verification', { email });
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Failed to send verification code');
  }
}

export async function verifyEmail(email: string, code: string): Promise<void> {
  try {
    await api.post('/api/auth/verify-email', { email, code });
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Verification failed');
  }
}
