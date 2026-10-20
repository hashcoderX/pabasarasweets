const CONFIGURED_API_ORIGIN =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  '';

export function enforceHttpsForSecurePage(url: string): string {
  const normalized = url.trim();
  if (!normalized) return normalized;

  if (typeof window === 'undefined' || window.location.protocol !== 'https:') {
    return normalized;
  }

  if (normalized.startsWith('http://')) {
    return `https://${normalized.slice('http://'.length)}`;
  }

  if (normalized.startsWith('//')) {
    return `https:${normalized}`;
  }

  return normalized;
}

export function resolveApiOrigin(): string {
  const fallbackOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000';

  const rawOrigin = (CONFIGURED_API_ORIGIN || fallbackOrigin).trim();
  if (!rawOrigin) return fallbackOrigin;

  const normalized = rawOrigin.replace(/\/+$/, '');

  if (typeof window === 'undefined') {
    return normalized;
  }

  if (window.location.protocol !== 'https:') {
    return normalized;
  }

  return enforceHttpsForSecurePage(normalized);
}
