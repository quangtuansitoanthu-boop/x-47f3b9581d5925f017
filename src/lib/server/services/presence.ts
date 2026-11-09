import type { CloudflareRequestContext, RateLimiterBinding } from '../cloudflare-context';
import { sha256 } from '../crypto';
import { normalizeVisitorPath, vietnamDateKey, visitorClientMetadata } from '../domain/visitor-client';
import { ServerInputError } from '../errors';
import { createPresenceRepository } from '../repositories/presence-repository';
import { createPracticeCommunityRepository } from '../repositories/practice-community-repository';
import { publicPracticeCommunityEnabled } from './practice-community-gate';

export const ACTIVE_WINDOW_SECONDS = 120;
export const HEARTBEAT_INTERVAL_SECONDS = 60;
const VISITOR_RETENTION_MS = 24 * 60 * 60 * 1000;
const ANALYTICS_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/u;
const MAX_VISITORS_PER_NETWORK = 20;
const MAX_DAILY_VISITORS_PER_NETWORK = 200;
const MIN_WRITE_INTERVAL_MS = 45_000;

export function createPresenceService(context: CloudflareRequestContext) {
  const { env: bindings } = context;
  const practiceRepository = createPracticeCommunityRepository(bindings);
  const repository = createPresenceRepository(context.env);

  return {
    async heartbeat(args: {
      visitorId: string;
      clientAddress?: string;
      currentPath?: string;
      sessionId?: string;
      pageviewId?: string;
      source?: string;
      countryCode?: string;
      regionCode?: string;
      city?: string;
      now?: number;
      rateLimiter?: RateLimiterBinding;
      userAgent?: string | null;
      practiceVisible?: boolean;
      practiceActivity?: string | null;
      practiceStartedAt?: number | null;
    }) {
      if (String(context.env.PRESENCE_ENABLED || 'true').toLowerCase() === 'false') {
        return presencePayload(0, false);
      }
      const visitorId = args.visitorId.trim();
      if (!VISITOR_ID_PATTERN.test(visitorId)) {
        throw new ServerInputError(400, 'invalid_visitor_id', 'Định danh trình duyệt không hợp lệ.');
      }

      const networkHash = await sha256([
        context.env.RATE_LIMIT_SALT || '',
        'presence-network',
        args.clientAddress || 'unknown',
      ].join(':'));
      const limiter = args.rateLimiter || context.env.PRESENCE_RATE_LIMITER;
      if (limiter && !await checkRateLimit(limiter, networkHash)) {
        throw new ServerInputError(429, 'rate_limited', 'Bộ đếm đang cập nhật quá nhanh.');
      }

      const now = args.now ?? Date.now();
      const visitorHash = await sha256(`${context.env.RATE_LIMIT_SALT || ''}:visitor:${visitorId}`);
      const overflowHash = await sha256(`${context.env.RATE_LIMIT_SALT || ''}:presence-overflow:${networkHash}`);
      const activeCutoff = now - ACTIVE_WINDOW_SECONDS * 1000;
      const writeCutoff = now - MIN_WRITE_INTERVAL_MS;
      const client = visitorClientMetadata(args.userAgent || null);
      const principal = context.principal;
      const communityEnabled = publicPracticeCommunityEnabled(bindings);
      const requestedPracticeActivity = normalizePracticeActivity(args.practiceActivity);
      const practiceVisible = Boolean(
        communityEnabled
        && args.practiceVisible
        && requestedPracticeActivity
        && principal?.appUserId
        && await practiceRepository.isPresenceOptedIn(principal.appUserId),
      );
      try {
        await repository.writeHeartbeat({
          activeCutoff,
          dailyVisitorLimit: MAX_DAILY_VISITORS_PER_NETWORK,
          maxVisitorsPerNetwork: MAX_VISITORS_PER_NETWORK,
          networkHash,
          overflowHash,
          record: {
            browserName: client.browserName,
            currentPath: normalizeVisitorPath(args.currentPath),
            deviceType: client.deviceType,
            displayName: principal?.displayName?.trim() || null,
            firstSeenAt: now,
            isOverflow: false,
            lastSeenAt: now,
            operatingSystem: client.operatingSystem,
            principalId: principal?.userId || null,
            role: principal?.role && principal.role !== 'guest' ? principal.role : null,
            practiceVisible,
            practiceActivity: practiceVisible ? requestedPracticeActivity : null,
            practiceStartedAt: practiceVisible ? normalizePracticeStartedAt(args.practiceStartedAt, now) : null,
          },
          visitDate: vietnamDateKey(now),
          visitorHash,
          writeCutoff,
        });
        if (VISITOR_ID_PATTERN.test(String(args.sessionId || '')) && VISITOR_ID_PATTERN.test(String(args.pageviewId || ''))) {
          try {
            await repository.writeAnalyticsHeartbeat({
              accountType: principal?.role === 'admin' || principal?.role === 'ctv'
                ? 'internal'
                : principal?.appUserId ? 'member' : 'guest',
              browserName: client.browserName,
              city: normalizeDimension(args.city, 80),
              countryCode: normalizeCountryCode(args.countryCode),
              deviceType: client.deviceType,
              lastSeenAt: now,
              operatingSystem: client.operatingSystem,
              pageviewHash: await sha256(`${context.env.RATE_LIMIT_SALT || ''}:pageview:${args.pageviewId}`),
              path: normalizeVisitorPath(args.currentPath),
              principalId: principal?.userId || null,
              regionCode: normalizeDimension(args.regionCode, 40),
              sessionHash: await sha256(`${context.env.RATE_LIMIT_SALT || ''}:analytics-session:${args.sessionId}`),
              source: normalizeSource(args.source),
              startedAt: now,
              visitDate: vietnamDateKey(now),
              visitorHash,
            });
          } catch (error) {
            if (!/no such table:\s*analytics_pageviews/iu.test(String((error as Error)?.message || error))) throw error;
          }
        }
        const [activeCount, practitioners] = await Promise.all([
          repository.countActive(activeCutoff),
          communityEnabled ? repository.listActivePractice(activeCutoff, context.principal?.appUserId ?? null) : Promise.resolve([]),
        ]);
        return presencePayload(activeCount, true, practitioners);
      } catch (error) {
        if (isMissingPresenceTable(error)) return presencePayload(0, false);
        throw error;
      }
    },

    async purgeExpired(now = Date.now()) {
      return repository.purgeExpired(
        now - VISITOR_RETENTION_MS,
        now - ANALYTICS_RETENTION_MS,
      );
    },
  };
}

function normalizeCountryCode(value: unknown): string {
  const candidate = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/u.test(candidate) ? candidate : 'Chưa xác định';
}

function normalizeDimension(value: unknown, maxLength: number): string {
  const candidate = String(value || '').trim().replace(/[\u0000-\u001f\u007f]/gu, ' ');
  return candidate ? candidate.slice(0, maxLength) : 'Chưa xác định';
}

function normalizeSource(value: unknown): string {
  const candidate = normalizeDimension(value, 80);
  return candidate === 'Chưa xác định' ? 'Trực tiếp' : candidate;
}

async function checkRateLimit(binding: RateLimiterBinding, key: string): Promise<boolean> {
  const result = await binding.limit({ key });
  return result.success !== false;
}

function isMissingPresenceTable(error: unknown): boolean {
  return /(?:no such table:\s*(?:active_visitors|visitor_daily_presence)|no such column:\s*(?:principal_id|device_type|current_path))/iu
    .test(String((error as Error)?.message || error));
}

function normalizePracticeActivity(value: unknown): string | null {
  const normalized = String(value || '');
  return ['meditation', 'rosary', 'scripture', 'model_chant', 'dharma_talk'].includes(normalized)
    ? normalized
    : null;
}

function normalizePracticeStartedAt(value: unknown, now: number): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) && candidate >= now - 24 * 60 * 60 * 1_000 && candidate <= now
    ? Math.floor(candidate)
    : now;
}

function presencePayload(
  activeCount: number,
  enabled: boolean,
  practitioners: Array<{ activity: string; displayName: string; startedAt: number | null }> = [],
) {
  return {
    enabled,
    activeCount,
    practicingCount: practitioners.length,
    practitioners,
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
  };
}
