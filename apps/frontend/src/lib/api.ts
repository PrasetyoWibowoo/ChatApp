import axios from 'axios';

// Auto-detect API base URL
// Priority: VITE_API_URL env var > derive from current hostname
const getApiBaseUrl = () => {
  // If explicitly set, use it
  if (import.meta.env.VITE_API_URL) {
    let url = import.meta.env.VITE_API_URL;
    // Add https:// if missing protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url;
  }
  
  // Fallback to localhost for development
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
