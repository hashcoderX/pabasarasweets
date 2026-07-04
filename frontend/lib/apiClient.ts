import axios, { AxiosInstance } from 'axios';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8020';

export function createApiClient(token?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: `${API_BASE_URL}/api`,
    timeout: 15000,
  });

  instance.interceptors.request.use((config) => {
    if (token) {
      config.headers = config.headers ?? {};
      if (!config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  });

  return instance;
}
