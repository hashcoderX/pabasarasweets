import axios, { AxiosInstance } from 'axios';
import { enforceHttpsForSecurePage, resolveApiOrigin } from './apiOrigin';

export function createApiClient(token?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: `${resolveApiOrigin()}/api`,
    timeout: 15000,
  });

  instance.interceptors.request.use((config) => {
    if (typeof config.baseURL === 'string') {
      config.baseURL = enforceHttpsForSecurePage(config.baseURL);
    }
    if (typeof config.url === 'string') {
      config.url = enforceHttpsForSecurePage(config.url);
    }

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
