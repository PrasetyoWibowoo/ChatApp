import axios from 'axios';

// Auto-detect API base URL
// Priority: VITE_API_URL env var > localhost fallback
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim();
  }
  return 'http://localhost:8080';
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
