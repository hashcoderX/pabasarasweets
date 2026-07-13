import axios from 'axios';

const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8000';

const http = axios.create({
  // Keep /api paths in callers; only centralize backend origin here.
  baseURL: API_ORIGIN,
  timeout: 15000,
});

export * from 'axios';
export default http;
