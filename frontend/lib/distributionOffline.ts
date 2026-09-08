export const DISTRIBUTION_OFFLINE_KEYS = {
  invoices: 'distribution_offline_invoices',
  payments: 'distribution_offline_payments',
  returns: 'distribution_offline_returns',
} as const;

export type OfflineQueueEntry<TPayload> = {
  id: string;
  createdAt: string;
  payload: TPayload;
};

export const makeOfflineEntryId = (prefix: string) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const readOfflineQueue = <TPayload,>(key: string): OfflineQueueEntry<TPayload>[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as OfflineQueueEntry<TPayload>[];
    if (!Array.isArray(parsed)) return [];

    return parsed;
  } catch {
    return [];
  }
};

export const writeOfflineQueue = <TPayload,>(key: string, queue: OfflineQueueEntry<TPayload>[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(queue));
  } catch {
    // Ignore local storage write failures.
  }
};

export const isLikelyNetworkError = (error: unknown) => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;

  const err = error as {
    code?: string;
    message?: string;
    response?: { status?: number };
  } | null;

  if (!err) return false;
  if (err.code === 'ERR_NETWORK') return true;
  if (!err.response) return true;

  return false;
};
