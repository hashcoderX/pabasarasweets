type OfflineSessionUser = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  roles?: string[];
};

type OfflineSessionSnapshot = {
  token: string;
  user: OfflineSessionUser;
  isOutletUser: boolean;
  preferredPath: string;
  savedAt: number;
};

const OFFLINE_SESSION_KEY = 'offline_auth_session_v1';

export const readOfflineSession = (): OfflineSessionSnapshot | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<OfflineSessionSnapshot>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.token || typeof parsed.token !== 'string') return null;

    return {
      token: parsed.token,
      user: typeof parsed.user === 'object' && parsed.user ? parsed.user : {},
      isOutletUser: Boolean(parsed.isOutletUser),
      preferredPath: typeof parsed.preferredPath === 'string' && parsed.preferredPath.startsWith('/')
        ? parsed.preferredPath
        : '/dashboard',
      savedAt: Number(parsed.savedAt) || Date.now(),
    };
  } catch {
    return null;
  }
};

export const writeOfflineSession = (session: OfflineSessionSnapshot) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Ignore local storage write issues; online auth is still source of truth.
  }
};

export const clearOfflineSession = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // Ignore local storage removal issues.
  }
};

export const canUseOfflineSession = (email: string) => {
  const snapshot = readOfflineSession();
  if (!snapshot) return null;

  const typedEmail = email.trim().toLowerCase();
  const cachedEmail = String(snapshot.user?.email || '').trim().toLowerCase();
  if (!typedEmail || !cachedEmail || typedEmail !== cachedEmail) return null;

  return snapshot;
};
