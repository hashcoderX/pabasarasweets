import axios from 'axios';
import { enforceHttpsForSecurePage, resolveApiOrigin } from './apiOrigin';

const http = axios.create({
  // Keep /api paths in callers; only centralize backend origin here.
  baseURL: resolveApiOrigin(),
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  if (typeof config.baseURL === 'string') {
    config.baseURL = enforceHttpsForSecurePage(config.baseURL);
  }
  if (typeof config.url === 'string') {
    config.url = enforceHttpsForSecurePage(config.url);
  }
  return config;
});

export * from 'axios';
export default http;
