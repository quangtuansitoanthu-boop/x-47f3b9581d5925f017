import type { PageSessionDTO } from '$lib/server/auth/types';
import type { CommunityAuthor } from '$lib/contracts/community-moderation';
import { refreshBrowserSession, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
import { fetchWithSessionRefresh } from './session-csrf';
import { isNativeApp } from './native-platform';

export interface PracticePresenceProjection {
  activity: 'meditation' | 'rosary' | 'scripture' | 'model_chant' | 'dharma_talk';
  startedAt: number;
  visible: boolean;
}
export interface PresenceSnapshot {
  enabled: boolean;
  activeCount: number;
  practicingCount?: number;
  practitioners?: Array<CommunityAuthor & { activity: string; displayName: string; startedAt: number | null }>;
}
interface HeartbeatPayload {
  currentPath: string;
  pageviewId: string;
  practiceActivity: string | null;
  practiceStartedAt: number | null;
  practiceVisible: boolean;
  sessionId: string;
  source: string;
  visitorId: string;
}
interface HeartbeatEnvelope {
  csrfToken: string;
  generation: number;
  payload: HeartbeatPayload;
  principalId: string | null;
}
export type PresenceListener = (snapshot: PresenceSnapshot | null) => void;
const PRESENCE_EVENT = 'quangtu:presence';

const STORAGE_KEY = 'quangtu_presence_visitor_v1';
const SESSION_KEY = 'quangtu_analytics_session_v1';
const SOURCE_KEY = 'quangtu_analytics_source_v1';
let fallbackVisitorId: string | null = null;
let latestPresence: PresenceSnapshot | null = null;
let notifyNavigation: ((path: string) => void) | null = null;
let notifyPractice: (() => void) | null = null;
let practiceProjection: PracticePresenceProjection | null = null;

export function setPracticePresence(projection: PracticePresenceProjection | null): void {
  const next = projection?.visible ? { ...projection } : null;
  if (next?.activity === practiceProjection?.activity && next?.startedAt === practiceProjection?.startedAt
    && next?.visible === practiceProjection?.visible) return;
  practiceProjection = next;
  notifyPractice?.();
}

function randomId(): string {
  try {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  } catch {
    // Bỏ qua – dùng fallback bên dưới.
  }
  try {
    const cryptoApi = globalThis.crypto as Crypto | undefined;
    if (cryptoApi?.getRandomValues) {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    // Bỏ qua – dùng fallback cuối cùng.
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

function visitorId(): string {
  try {
    let value = localStorage.getItem(STORAGE_KEY);
    if (!value) { value = randomId(); localStorage.setItem(STORAGE_KEY, value); }
    return value;
  } catch {
    fallbackVisitorId ??= randomId();
    return fallbackVisitorId;
  }
}

function safeCurrentPath(): string {
  try {
    return location.pathname;
  } catch {
    return '/';
  }
}

function sessionValue(key: string, create: () => string): string {
  try {
    let value = sessionStorage.getItem(key);
    if (!value) { value = create(); sessionStorage.setItem(key, value); }
    return value;
  } catch {
    return create();
  }
}

function analyticsSource(): string {
  try {
    return sessionValue(SOURCE_KEY, () => {
      try {
        const href = typeof location !== 'undefined' ? location.href : '';
        const campaign = new URL(href).searchParams.get('utm_source')?.trim();
        if (campaign) return campaign.slice(0, 80);
      } catch {
        // Bỏ qua utm_source khi URL không parse được.
      }
      try {
        if (!document.referrer) return 'Trực tiếp';
      } catch {
        return 'Trực tiếp';
      }
      try {
        const referrer = new URL(document.referrer);
        return referrer.origin === location.origin ? 'Nội bộ' : referrer.hostname.slice(0, 80);
      } catch {
        return 'Trực tiếp';
      }
    });
  } catch {
    return 'Trực tiếp';
  }
}

export function notifyPresenceNavigation(path: string): void {
  notifyNavigation?.(path);
}

type PresenceSession = Pick<PageSessionDTO, 'authenticated' | 'csrfToken' | 'user'>;

function sessionPrincipalId(session: PresenceSession | null | undefined): string | null {
  return session?.authenticated ? String(session.user?.id ?? '').trim() || null : null;
}

export function startPresence(
  listener: PresenceListener,
  initialSession: PresenceSession | string = 'public',
): () => void {
  // Trên App Mobile: Tắt hoàn toàn heartbeat chạy ngầm để hoạt động offline, tiết kiệm pin và tránh tải server
  if (isNativeApp()) {
    listener({ enabled: false, activeCount: 1 });
    return () => {};
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let inFlight: Promise<void> | null = null;
  const pendingPayloads: HeartbeatEnvelope[] = [];
  let generation = 0;
  let currentCsrfToken = typeof initialSession === 'string'
    ? initialSession
    : initialSession.csrfToken || 'public';
  let currentPrincipalId = typeof initialSession === 'string'
    ? null
    : sessionPrincipalId(initialSession);
  let currentPath = safeCurrentPath();
  let pageviewId = randomId();
  const sessionId = sessionValue(SESSION_KEY, () => randomId());
  let source = 'Trực tiếp';
  try {
    source = analyticsSource();
  } catch {
    source = 'Trực tiếp';
  }

  const currentPayload = (): HeartbeatPayload => ({
    visitorId: visitorId(), sessionId, pageviewId, source, currentPath,
    practiceVisible: practiceProjection?.visible === true,
    practiceActivity: practiceProjection?.activity ?? null,
    practiceStartedAt: practiceProjection?.startedAt ?? null,
  });
  const currentEnvelope = (): HeartbeatEnvelope => ({
    csrfToken: currentCsrfToken,
    generation,
    payload: currentPayload(),
    principalId: currentPrincipalId,
  });

  let lastHeartbeatSentAt = 0;
  let lastUserInteraction = Date.now();
  const onUserInteraction = () => {
    const wasIdle = Date.now() - lastUserInteraction > 5 * 60_000;
    lastUserInteraction = Date.now();
    if (wasIdle && document.visibilityState === 'visible') {
      scheduleNextTimer();
    }
  };

  const scheduleNextTimer = (intervalSec?: number) => {
    clearTimeout(timer);
    if (stopped) return;
    const isPracticing = practiceProjection?.visible === true;
    const isIdle = Date.now() - lastUserInteraction > 5 * 60_000;
    const defaultSeconds = isPracticing ? 60 : isIdle ? 300 : 120;
    const minimumSeconds = isPracticing ? 45 : isIdle ? 300 : 120;
    const nextSeconds = Math.max(minimumSeconds, intervalSec ?? defaultSeconds);
    timer = setTimeout(async () => {
      if (!isPracticing) {
        try {
          const lastGlobal = Number(localStorage.getItem('quangtu_presence_last_heartbeat') || 0);
          if (Date.now() - lastGlobal < 60_000) {
            scheduleNextTimer(nextSeconds);
            return;
          }
        } catch {}
      }
      void heartbeat();
    }, nextSeconds * 1000);
  };

  const sendHeartbeat = (envelope: HeartbeatEnvelope, keepalive = false) => {
    lastHeartbeatSentAt = Date.now();
    try {
      localStorage.setItem('quangtu_presence_last_heartbeat', String(Date.now()));
    } catch {}
    return fetchWithSessionRefresh('/api/presence', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': envelope.csrfToken },
      body: JSON.stringify(envelope.payload),
      keepalive,
    });
  };

  const refreshCsrfToken = async (envelope: HeartbeatEnvelope) => {
    const session = await refreshBrowserSession().catch(() => null);
    if (stopped || !session) return false;
    const refreshedPrincipalId = sessionPrincipalId(session);
    if (refreshedPrincipalId !== currentPrincipalId) applySession(session);
    if (
      envelope.generation !== generation
      || envelope.principalId !== currentPrincipalId
      || refreshedPrincipalId !== envelope.principalId
    ) return false;
    currentCsrfToken = session.csrfToken || 'public';
    envelope.csrfToken = currentCsrfToken;
    return true;
  };

  const heartbeat = async (envelope = currentEnvelope()) => {
    if (stopped || document.visibilityState === 'hidden') return inFlight;
    if (inFlight) {
      const pendingIndex = pendingPayloads.findIndex((pending) => (
        pending.generation === envelope.generation
        && pending.principalId === envelope.principalId
        && pending.payload.pageviewId === envelope.payload.pageviewId
      ));
      if (pendingIndex >= 0) pendingPayloads[pendingIndex] = envelope;
      else pendingPayloads.push(envelope);
      return inFlight;
    }
    clearTimeout(timer);
    inFlight = (async () => {
      try {
        let response = await sendHeartbeat(envelope);
        if (stopped || envelope.generation !== generation || envelope.principalId !== currentPrincipalId) return;
        if (response.status === 403 && await refreshCsrfToken(envelope)) response = await sendHeartbeat(envelope);
        if (stopped || envelope.generation !== generation || envelope.principalId !== currentPrincipalId) return;
        if (response.status === 503 || response.status === 429) {
          window.dispatchEvent(new CustomEvent('quangtu:service-overloaded', {
            detail: { message: 'Hệ thống đang tạm thời quá tải lượt truy cập. Kính mong quý Phật tử hoan hỷ thử lại sau ít phút.' }
          }));
          scheduleNextTimer(600);
          return;
        }
        if (!response.ok) throw new Error('presence_unavailable');
        const data = await response.json() as PresenceSnapshot & { heartbeatIntervalSeconds?: number };
        if (stopped || envelope.generation !== generation || envelope.principalId !== currentPrincipalId) return;
        const snapshot = data.enabled === false ? null : data;
        latestPresence = snapshot;
        listener(snapshot);
        window.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: snapshot }));
        if (data.enabled !== false) scheduleNextTimer(data.heartbeatIntervalSeconds);
      } catch {
        if (stopped || envelope.generation !== generation || envelope.principalId !== currentPrincipalId) return;
        latestPresence = null;
        listener(null);
        window.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: null }));
        scheduleNextTimer(180);
      } finally {
        inFlight = null;
        if (!stopped && document.visibilityState !== 'hidden') {
          const next = pendingPayloads.find((pending) => (
            pending.generation === generation && pending.principalId === currentPrincipalId
          ));
          pendingPayloads.length = 0;
          if (next) void heartbeat(next);
        }
      }
    })();
    return inFlight;
  };
  const visibility = () => {
    if (document.visibilityState === 'visible') {
      if (Date.now() - lastHeartbeatSentAt >= 60_000) {
        void heartbeat();
      } else {
        scheduleNextTimer();
      }
    } else {
      clearTimeout(timer);
    }
  };
  const pageshow = (event: PageTransitionEvent) => { if (event.persisted) void heartbeat(); };
  const pagehide = () => {
    clearTimeout(timer);
    const payloads = [...pendingPayloads, currentEnvelope()]
      .filter((envelope) => envelope.generation === generation && envelope.principalId === currentPrincipalId);
    pendingPayloads.length = 0;
    const unique = new Map(payloads.map((envelope) => [envelope.payload.pageviewId, envelope]));
    for (const envelope of unique.values()) void sendHeartbeat(envelope, true).catch(() => undefined);
  };
  const applySession = (session: PresenceSession) => {
    const nextPrincipalId = sessionPrincipalId(session);
    currentCsrfToken = session?.csrfToken || 'public';
    if (nextPrincipalId === currentPrincipalId) return;
    generation += 1;
    currentPrincipalId = nextPrincipalId;
    practiceProjection = null;
    pendingPayloads.length = 0;
    clearTimeout(timer);
    void heartbeat(currentEnvelope());
  };
  const sessionChanged = (event: Event) => {
    applySession((event as CustomEvent<PageSessionDTO>).detail);
  };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pageshow', pageshow);
  window.addEventListener('pagehide', pagehide);
  window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  window.addEventListener('mousemove', onUserInteraction, { passive: true });
  window.addEventListener('keydown', onUserInteraction, { passive: true });
  window.addEventListener('scroll', onUserInteraction, { passive: true });
  window.addEventListener('touchstart', onUserInteraction, { passive: true });
  notifyNavigation = (path) => {
    const nextPath = path.startsWith('/') ? path.split(/[?#]/u, 1)[0] : '/';
    if (nextPath === currentPath) return;
    currentPath = nextPath;
    pageviewId = randomId();
    if (Date.now() - lastHeartbeatSentAt >= 60_000) {
      void heartbeat(currentEnvelope());
    }
  };
  notifyPractice = () => void heartbeat(currentEnvelope());
  void heartbeat();
  return () => {
    stopped = true; pendingPayloads.length = 0; clearTimeout(timer);
    if (notifyNavigation) notifyNavigation = null;
    if (notifyPractice) notifyPractice = null;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pageshow', pageshow);
    window.removeEventListener('pagehide', pagehide);
    window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.removeEventListener('mousemove', onUserInteraction);
    window.removeEventListener('keydown', onUserInteraction);
    window.removeEventListener('scroll', onUserInteraction);
    window.removeEventListener('touchstart', onUserInteraction);
  };
}

export function listenPresence(listener: PresenceListener): () => void {
  const receive = (event: Event) => listener((event as CustomEvent<PresenceSnapshot | null>).detail);
  window.addEventListener(PRESENCE_EVENT, receive);
  listener(latestPresence);
  return () => window.removeEventListener(PRESENCE_EVENT, receive);
}
