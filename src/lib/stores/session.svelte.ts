import { getContext, setContext } from 'svelte';
import type { PageSessionDTO } from '$lib/server/auth/types';
import { announceOfflinePdfPrincipal } from '$lib/browser/offline-pdf-resolver';
import { resolveApiUrl } from '$lib/browser/native-api';
import { isNativeApp } from '$lib/browser/native-platform';
import { afterNativeAuthMutation, isNativeAuthMutationActive, nativeAuthMutationRevision } from '$lib/browser/native-auth-transaction';
import { selectTalkCatalogPrincipal } from '$lib/browser/talk-catalog-cache';

export const SESSION_CONTEXT = Symbol('quangtu-session');
const SESSION_CHANGED_EVENT = 'quangtu:session-changed';
const MAX_TIMER_DELAY = 2_147_000_000;

export const GUEST_SESSION: PageSessionDTO = {
  authenticated: false,
  user: null,
  csrfToken: null,
  expiresAt: null,
};

export interface SessionStore {
  readonly value: PageSessionDTO;
  readonly verification?: 'verified' | 'cached' | 'anonymous';
  /** Initial identity resolution has settled; this does not imply an online or authenticated session. */
  readonly initialResolutionComplete?: boolean;
  set: (next: PageSessionDTO) => void;
  clear: () => void;
  refresh: () => Promise<PageSessionDTO>;
  activate: () => void;
  deactivate: () => void;
}

let browserSessionStore: SessionStore | null = null;
let deferredSessionRefresh: { store: SessionStore; snapshot: PageSessionDTO } | null = null;

export function detectUserRole(email?: string, name?: string, serverRole?: string): 'user' | 'ctv' | 'admin' {
  if (serverRole === 'admin' || serverRole === 'ctv') return serverRole;
  return 'user';
}

function profileAvatarUrl(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const picture = value as { url?: unknown; data?: { url?: unknown } };
  if (typeof picture.url === 'string' && picture.url.trim()) return picture.url.trim();
  return typeof picture.data?.url === 'string' ? picture.data.url.trim() : '';
}

function normalizeSession(raw: Partial<PageSessionDTO>): PageSessionDTO {
  if (!raw.authenticated || !raw.user) return { ...GUEST_SESSION };
  const profile = raw.user as NonNullable<PageSessionDTO['user']> & {
    avatar_url?: unknown; picture?: unknown; imageUrl?: unknown; photoUrl?: unknown;
  };
  const email = String(raw.user.email ?? '').toLowerCase().trim();
  let displayName = String(raw.user.displayName ?? '').trim();

  // Đảm bảo displayName không bao giờ là địa chỉ email
  if (!displayName || displayName.includes('@')) {
    if (email === 'tutap.phatphap26@gmail.com' || email.includes('quangtu')) {
      displayName = 'Quang Từ';
    } else if (email === 'chienqan@gmail.com') {
      displayName = 'Chiến An';
    } else if (email.includes('@')) {
      const local = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
      displayName = local
        ? local.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : 'Phật tử';
    } else {
      displayName = 'Phật tử';
    }
  }

  const role = detectUserRole(email, displayName, raw.user.role);
  return {
    authenticated: true,
    user: {
      id: String(raw.user.id ?? ''),
      email: String(raw.user.email ?? ''),
      displayName,
      avatarUrl: [profile.avatarUrl, profile.avatar_url, profile.picture, profile.imageUrl, profile.photoUrl]
        .map(profileAvatarUrl).find(Boolean) ?? '',
      role,
    },
    csrfToken: typeof raw.csrfToken === 'string' && raw.csrfToken ? raw.csrfToken : null,
    expiresAt: typeof raw.expiresAt === 'string' && raw.expiresAt ? raw.expiresAt : null,
  };
}

const ANONYMOUS_SESSION: PageSessionDTO = {
  authenticated: false,
  user: null,
  csrfToken: null,
  expiresAt: null,
};

const LOCAL_SESSION_KEY = 'tutam_native_session';
const AVATAR_CACHE_PREFIX = 'tutam_profile_avatar_v1:';

function cachedAvatar(accountId: string, value?: string): string {
  if (typeof localStorage === 'undefined' || !accountId) return '';
  try {
    const key = `${AVATAR_CACHE_PREFIX}${encodeURIComponent(accountId)}`;
    const candidate = value ?? localStorage.getItem(key) ?? '';
    if (candidate.length > 4096 || !/^https?:$/u.test(new URL(candidate).protocol)) return '';
    if (value) localStorage.setItem(key, value);
    return candidate;
  } catch { return ''; }
}

function preserveAccountAvatar(next: PageSessionDTO, previous: PageSessionDTO | null): PageSessionDTO {
  if (next.authenticated && next.user?.id) {
    const previousAvatar = previous?.authenticated && previous.user?.id === next.user.id ? previous.user.avatarUrl : '';
    const avatarUrl = next.user.avatarUrl?.trim() || previousAvatar?.trim() || cachedAvatar(next.user.id);
    if (avatarUrl) cachedAvatar(next.user.id, avatarUrl);
    if (avatarUrl && avatarUrl !== next.user.avatarUrl) return { ...next, user: { ...next.user, avatarUrl } };
  }
  return next;
}

export function saveLocalSession(session: PageSessionDTO): void {
  if (typeof localStorage === 'undefined') return;
  if (!isNativeApp()) {
    if (session.authenticated && session.user?.id && session.user.avatarUrl) cachedAvatar(session.user.id, session.user.avatarUrl);
    clearLocalSession();
    return;
  }
  try {
    const normalized = normalizeSession(session);
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
      authenticated: normalized.authenticated,
      user: normalized.user,
      expiresAt: normalized.expiresAt,
    }));
  } catch {}
}

export function getLocalSavedSession(): PageSessionDTO | null {
  if (typeof localStorage === 'undefined') return null;
  if (!isNativeApp()) {
    // Preserve the public profile photo while removing the former credential cache.
    // The photo is read only after a live server session identifies its owner.
    try {
      const previous = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
      if (previous?.user?.id && typeof previous.user.avatarUrl === 'string') cachedAvatar(String(previous.user.id), previous.user.avatarUrl);
    } catch {}
    clearLocalSession();
    return null;
  }
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.authenticated && parsed.user) {
      const remembered = normalizeSession({ ...parsed, csrfToken: null });
      // Giữ hồ sơ offline, đồng thời bỏ credential còn sót từ phiên bản cũ.
      if (Object.prototype.hasOwnProperty.call(parsed, 'csrfToken')) saveLocalSession(remembered);
      return remembered;
    }
  } catch {}
  return null;
}

export function clearLocalSession(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_SESSION_KEY);
  } catch {}
}

async function fetchSession(
  isCurrent: () => boolean = () => true,
  current: PageSessionDTO = ANONYMOUS_SESSION,
  onVerified: () => void = () => {},
): Promise<PageSessionDTO> {
  const localCached = getLocalSavedSession();
  const retained = normalizeSession(current.authenticated ? current : localCached ?? ANONYMOUS_SESSION);
  const authRevision = nativeAuthMutationRevision();
  const ownsRead = () => isCurrent() && nativeAuthMutationRevision() === authRevision && !isNativeAuthMutationActive();
  if (isNativeAuthMutationActive() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return retained;
  }
  try {
    const response = await fetch(resolveApiUrl('/api/session'), {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      credentials: 'include',
    });
    if (response.status === 401) {
      if (ownsRead()) clearLocalSession();
      onVerified();
      return normalizeSession(ANONYMOUS_SESSION);
    }
    if (!response.ok) {
      return retained;
    }
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return retained;
    }
    const data = await response.json() as Partial<PageSessionDTO>;
    if (data.authenticated === true && data.user && typeof data.user.id === 'string' && data.user.id) {
      const refreshed = preserveAccountAvatar(normalizeSession(data), localCached);
      if (ownsRead()) saveLocalSession(refreshed);
      onVerified();
      return refreshed;
    }
    if (data.authenticated !== false) return retained;
    // Server xác nhận không có phiên hợp lệ: dọn dẹp bộ nhớ đệm cũ để tránh kẹt trạng thái zombie
    if (ownsRead()) clearLocalSession();
    onVerified();
    return normalizeSession(ANONYMOUS_SESSION);
  } catch {
    // Mất mạng hoặc server lỗi kết nối: cho phép giữ phiên offline đã lưu để người dùng đọc sách
    return retained;
  }
}

export function createSessionStore(initial: PageSessionDTO, initialVerified = initial.authenticated): SessionStore {
  const savedSession = getLocalSavedSession();
  // Phiên SSR đã xác minh, kể cả khách, phải thắng hồ sơ native được nhớ trên máy.
  const effectiveInitial = initialVerified || initial.authenticated
    ? preserveAccountAvatar(normalizeSession(initial), savedSession)
    : (savedSession ?? initial);
  const normalizedInitial = normalizeSession(effectiveInitial);
  let session = $state(normalizedInitial);
  let verification = $state<'verified' | 'cached' | 'anonymous'>(normalizedInitial.authenticated ? initialVerified ? 'verified' : 'cached' : 'anonymous');
  let initialResolutionComplete = $state(initialVerified);
  // Refresh thất bại cũng kết thúc chờ, nhưng chưa cho phép dọn catalog của owner cũ.
  let verifiedPrincipal = initialVerified;
  let refreshPromise: Promise<PageSessionDTO> | null = null;
  let refreshRevision = -1;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let sessionGeneration = 0;

  function emit(): void {
    if (!active || typeof window === 'undefined') return;
    announceOfflinePdfPrincipal(session);
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: session }));
  }

  function scheduleExpiryRefresh(): void {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = null;
    if (!active || !session.authenticated || !session.expiresAt || typeof window === 'undefined') return;
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return;
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      // Offline refresh can legitimately return the same expired cached session.
      // Re-entering refresh immediately from set() would spin forever.
      expiryTimer = setTimeout(() => {
        expiryTimer = null;
        void refresh().catch(() => { if (active) scheduleExpiryRefresh(); });
      }, 60_000);
      return;
    }
    expiryTimer = setTimeout(() => {
      expiryTimer = null;
      if (Date.now() < expiresAt) {
        scheduleExpiryRefresh();
        return;
      }
      void refresh().catch(() => { if (active) scheduleExpiryRefresh(); });
    }, Math.min(delay, MAX_TIMER_DELAY));
  }

  function set(next: PageSessionDTO, verified = true): void {
    sessionGeneration++;
    session = preserveAccountAvatar(normalizeSession(next), session);
    verification = session.authenticated ? verified ? 'verified' : 'cached' : 'anonymous';
    initialResolutionComplete = true;
    verifiedPrincipal = verified;
    if (active) selectTalkCatalogPrincipal(session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest', verified);
    scheduleExpiryRefresh();
    emit();
  }

  async function refresh(): Promise<PageSessionDTO> {
    if (isNativeAuthMutationActive()) {
      // Không đọc cookie giữa HTTP xác thực và commit phiên; expiry vẫn phải có lần thử sau.
      scheduleExpiryRefresh();
      return session;
    }
    if (refreshPromise && refreshRevision === nativeAuthMutationRevision()) return refreshPromise;
    const expectedGeneration = sessionGeneration;
    const authRevision = nativeAuthMutationRevision();
    const ownsRead = () => sessionGeneration === expectedGeneration
      && nativeAuthMutationRevision() === authRevision && !isNativeAuthMutationActive();
    let verified = false;
    const pending = fetchSession(ownsRead, session, () => { verified = true; })
      .then((next) => {
        if (ownsRead()) set(next, verified);
        else if (active && sessionGeneration === expectedGeneration && nativeAuthMutationRevision() !== authRevision) {
          // Hủy SDK không commit phiên mới: đọc lại sau lease để startup không kẹt ở guest.
          const retry = () => {
            if (!active || sessionGeneration !== expectedGeneration) return;
            if (isNativeAuthMutationActive()) afterNativeAuthMutation(retry);
            else void refresh().catch(() => undefined);
          };
          afterNativeAuthMutation(retry);
        }
        return session;
      })
      .finally(() => {
        if (refreshPromise === pending) {
          initialResolutionComplete = true;
          refreshPromise = null;
        }
      });
    refreshRevision = authRevision;
    refreshPromise = pending;
    return pending;
  }

  return {
    get value() { return session; },
    get verification() { return verification; },
    get initialResolutionComplete() { return initialResolutionComplete; },
    set,
    clear() {
      clearLocalSession();
      set(GUEST_SESSION);
    },
    refresh,
    activate() {
      active = true;
      selectTalkCatalogPrincipal(session.authenticated ? session.user?.id ?? null : null, session.user?.role ?? 'guest', verifiedPrincipal);
      announceOfflinePdfPrincipal(session);
      scheduleExpiryRefresh();
    },
    deactivate() {
      active = false;
      if (expiryTimer) clearTimeout(expiryTimer);
      expiryTimer = null;
    },
  };
}

export function setSessionContext(initial: PageSessionDTO, initialVerified = initial.authenticated): SessionStore {
  const store = createSessionStore(initial, initialVerified);
  setContext(SESSION_CONTEXT, store);
  return store;
}

export function getSessionContext(): SessionStore {
  const store = getContext<SessionStore | undefined>(SESSION_CONTEXT);
  if (!store) throw new Error('Session context is unavailable outside the root layout.');
  return store;
}

export function registerBrowserSessionStore(store: SessionStore): () => void {
  browserSessionStore = store;
  store.activate();
  return () => {
    if (browserSessionStore === store) browserSessionStore = null;
    store.deactivate();
  };
}

export function getBrowserSessionSnapshot(): PageSessionDTO {
  return browserSessionStore?.value ?? GUEST_SESSION;
}

/** False means the native host has not mounted the root session store yet. */
export function applyBrowserSession(next: PageSessionDTO): boolean {
  saveLocalSession(next);
  if (!browserSessionStore) return false;
  browserSessionStore.set(next);
  return true;
}

export function refreshBrowserSession(): Promise<PageSessionDTO> {
  if (isNativeAuthMutationActive()) {
    const store = browserSessionStore;
    const snapshot = getBrowserSessionSnapshot();
    if (store && (deferredSessionRefresh?.store !== store || deferredSessionRefresh.snapshot !== snapshot)) {
      const deferred = { store, snapshot };
      deferredSessionRefresh = deferred;
      afterNativeAuthMutation(() => {
        if (deferredSessionRefresh !== deferred) return;
        deferredSessionRefresh = null;
        // Phiên mới đã commit thì không đọc lại cookie vì yêu cầu 401 của phiên trước.
        if (browserSessionStore === store && getBrowserSessionSnapshot() === snapshot) {
          void refreshBrowserSession().catch(() => undefined);
        }
      });
    }
    return Promise.resolve(snapshot);
  }
  return browserSessionStore?.refresh() ?? fetchSession();
}

export function clearBrowserSession(): void {
  browserSessionStore?.clear();
}

export function isSessionExpired(session = getBrowserSessionSnapshot()): boolean {
  if (!session.authenticated || !session.expiresAt) return false;
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export const SESSION_CHANGE_EVENT = SESSION_CHANGED_EVENT;
