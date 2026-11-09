import type { CloudflareEnvLike } from '../cloudflare-context';

export interface PresenceHeartbeatRecord {
  browserName: string;
  currentPath: string;
  deviceType: string;
  displayName: string | null;
  firstSeenAt: number;
  isOverflow: boolean;
  lastSeenAt: number;
  operatingSystem: string;
  principalId: string | null;
  role: string | null;
  practiceVisible: boolean;
  practiceActivity: string | null;
  practiceStartedAt: number | null;
}

export interface AnalyticsHeartbeatRecord {
  accountType: 'guest' | 'member' | 'internal';
  browserName: string;
  city: string;
  countryCode: string;
  deviceType: string;
  lastSeenAt: number;
  operatingSystem: string;
  pageviewHash: string;
  path: string;
  principalId: string | null;
  regionCode: string;
  sessionHash: string;
  source: string;
  startedAt: number;
  visitDate: string;
  visitorHash: string;
}

interface WriteHeartbeatArgs {
  activeCutoff: number;
  dailyVisitorLimit: number;
  maxVisitorsPerNetwork: number;
  networkHash: string;
  overflowHash: string;
  record: PresenceHeartbeatRecord;
  visitDate: string;
  visitorHash: string;
  writeCutoff: number;
}

const ACTIVE_COUNT_TTL_MS = 10_000;
interface ActiveCountEntry { cutoff: number; expiresAt: number; value: number }
interface ActiveCountState {
  generation: number;
  cached?: ActiveCountEntry;
  pending?: { cutoff: number; expiresAt: number; generation: number; promise: Promise<number> };
}
const activeCounts = new WeakMap<CloudflareEnvLike['DB'], ActiveCountState>();

function countState(db: CloudflareEnvLike['DB']): ActiveCountState {
  let state = activeCounts.get(db);
  if (!state) { state = { generation: 0 }; activeCounts.set(db, state); }
  return state;
}

function invalidateActiveCount(db: CloudflareEnvLike['DB']): void {
  const state = countState(db);
  state.generation += 1;
  delete state.cached;
  delete state.pending;
}

function sameCountWindow(entry: { cutoff: number; expiresAt: number }, cutoff: number): boolean {
  return cutoff >= entry.cutoff && cutoff < entry.cutoff + ACTIVE_COUNT_TTL_MS && Date.now() < entry.expiresAt;
}

async function readActiveCount(db: CloudflareEnvLike['DB'], cutoff: number): Promise<number> {
  const state = countState(db);
  if (state.cached && sameCountWindow(state.cached, cutoff)) return state.cached.value;
  if (state.pending && state.pending.generation === state.generation && sameCountWindow(state.pending, cutoff)) {
    return state.pending.promise;
  }
  const pending = { cutoff, expiresAt: Date.now() + ACTIVE_COUNT_TTL_MS,
    generation: state.generation, promise: Promise.resolve(0) };
  pending.promise = (async () => {
    try {
      const active = await db.prepare(`
        SELECT COUNT(*) AS active_count FROM active_visitors WHERE last_seen_at >= ?
      `).bind(cutoff).first<{ active_count?: number }>();
      const value = Number(active?.active_count || 0);
      // Trả snapshot của chính lượt đọc, không retry vô hạn khi heartbeat liên tục.
      if (pending.generation !== state.generation) return value;
      state.cached = { cutoff, expiresAt: Date.now() + ACTIVE_COUNT_TTL_MS, value };
      return value;
    } finally {
      if (state.pending === pending) delete state.pending;
    }
  })();
  state.pending = pending;
  return pending.promise;
}

export function createPresenceRepository(env: CloudflareEnvLike) {
  return {
    async writeHeartbeat(args: WriteHeartbeatArgs): Promise<void> {
      const { record } = args;
      const daily = (changedOnly: boolean) => env.DB.prepare(`
          INSERT INTO visitor_daily_presence (
            visit_date, visitor_id_hash, network_hash, first_seen_at, last_seen_at, heartbeat_count
          )
          SELECT ?, ?, ?, ?, ?, 1
          WHERE (${changedOnly ? 'changes() > 0' : '1 = 1'}) AND (EXISTS (
            SELECT 1 FROM visitor_daily_presence
            WHERE visit_date = ? AND visitor_id_hash = ?
          ) OR (
            SELECT COUNT(*) FROM visitor_daily_presence
            WHERE visit_date = ? AND network_hash = ?
          ) < ?)
          ON CONFLICT(visit_date, visitor_id_hash) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            heartbeat_count = visitor_daily_presence.heartbeat_count + 1
        `).bind(
          args.visitDate, args.visitorHash, args.networkHash, record.firstSeenAt,
          record.lastSeenAt, args.visitDate, args.visitorHash, args.visitDate,
          args.networkHash, args.dailyVisitorLimit,
        );
      invalidateActiveCount(env.DB);
      try {
        const updated = await env.DB.batch([
          env.DB.prepare(`
          UPDATE active_visitors
          SET visitor_id_hash = ?, network_hash = ?, last_seen_at = ?, principal_id = ?,
            display_name = ?, role = ?, device_type = ?, browser_name = ?, operating_system = ?,
            current_path = ?, first_seen_at = CASE
              WHEN visitor_id_hash <> ? OR first_seen_at = 0 THEN ? ELSE first_seen_at END,
            is_overflow = 0, practice_visible = ?, practice_activity = ?, practice_started_at = ?
          WHERE visitor_id_hash = COALESCE(
            (SELECT visitor_id_hash FROM active_visitors WHERE visitor_id_hash = ?),
            (SELECT visitor_id_hash FROM active_visitors
              WHERE network_hash = ? AND last_seen_at < ? AND visitor_id_hash <> ?
              ORDER BY last_seen_at ASC LIMIT 1)
          ) AND last_seen_at <= ? AND (
            visitor_id_hash <> ? OR last_seen_at <= ? OR principal_id IS NOT ?
            OR (practice_visible = 1 AND ? = 0)
          )
        `).bind(args.visitorHash, args.networkHash, record.lastSeenAt, record.principalId,
          record.displayName, record.role, record.deviceType, record.browserName,
          record.operatingSystem, record.currentPath, args.visitorHash, record.firstSeenAt,
          record.practiceVisible ? 1 : 0, record.practiceActivity, record.practiceStartedAt,
          args.visitorHash, args.networkHash, args.activeCutoff, args.overflowHash,
          record.lastSeenAt, args.visitorHash, args.writeCutoff, record.principalId,
          record.practiceVisible ? 1 : 0),
          // changes() nối hai câu cùng transaction; lượt mới chưa ghi daily.
          daily(true),
        ]);
        if (Number(updated[0]?.meta?.changes ?? 0) > 0) return;
        // Batch đầu không ghi gì. Visitor/overflow và daily vẫn ghi nguyên tử.
        await env.DB.batch([
          env.DB.prepare(`
          INSERT INTO active_visitors (
            visitor_id_hash, network_hash, last_seen_at, principal_id, display_name, role,
            device_type, browser_name, operating_system, current_path, first_seen_at, is_overflow,
            practice_visible, practice_activity, practice_started_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM active_visitors WHERE visitor_id_hash = ?
          ) OR (
            SELECT COUNT(*) FROM active_visitors
            WHERE network_hash = ? AND last_seen_at >= ?
          ) < ?
          ON CONFLICT(visitor_id_hash) DO UPDATE SET
            network_hash = excluded.network_hash, last_seen_at = excluded.last_seen_at,
            principal_id = excluded.principal_id, display_name = excluded.display_name, role = excluded.role,
            device_type = excluded.device_type, browser_name = excluded.browser_name,
            operating_system = excluded.operating_system, current_path = excluded.current_path,
            first_seen_at = CASE WHEN active_visitors.first_seen_at = 0
              THEN excluded.first_seen_at ELSE active_visitors.first_seen_at END,
            is_overflow = 0, practice_visible = excluded.practice_visible,
            practice_activity = excluded.practice_activity, practice_started_at = excluded.practice_started_at
          WHERE active_visitors.last_seen_at <= excluded.last_seen_at AND (
            active_visitors.last_seen_at <= ? OR active_visitors.principal_id IS NOT excluded.principal_id
            OR (active_visitors.practice_visible = 1 AND excluded.practice_visible = 0)
          )
        `).bind(
          args.visitorHash, args.networkHash, record.lastSeenAt, record.principalId,
          record.displayName, record.role, record.deviceType, record.browserName,
          record.operatingSystem, record.currentPath, record.firstSeenAt,
          record.practiceVisible ? 1 : 0, record.practiceActivity, record.practiceStartedAt,
          args.visitorHash,
          args.networkHash, args.activeCutoff, args.maxVisitorsPerNetwork, args.writeCutoff,
        ),
          env.DB.prepare(`
          INSERT INTO active_visitors (
            visitor_id_hash, network_hash, last_seen_at, display_name, device_type,
            browser_name, operating_system, current_path, first_seen_at, is_overflow
          )
          SELECT ?, ?, ?, 'Nhiều khách cùng mạng', 'Nhiều thiết bị',
            'Nhiều trình duyệt', 'Nhiều hệ điều hành', ?, ?, 1
          WHERE NOT EXISTS (
            SELECT 1 FROM active_visitors WHERE visitor_id_hash = ?
          ) AND (
            SELECT COUNT(*) FROM active_visitors
            WHERE network_hash = ? AND last_seen_at >= ?
          ) >= ?
          ON CONFLICT(visitor_id_hash) DO UPDATE SET
            last_seen_at = excluded.last_seen_at,
            current_path = excluded.current_path
          WHERE active_visitors.last_seen_at <= ?
        `).bind(
          args.overflowHash, args.networkHash, record.lastSeenAt, record.currentPath,
          record.firstSeenAt, args.visitorHash, args.networkHash, args.activeCutoff,
          args.maxVisitorsPerNetwork, args.writeCutoff,
        ),
          daily(false),
        ]);
      } finally {
        invalidateActiveCount(env.DB);
      }
    },

    async writeAnalyticsHeartbeat(record: AnalyticsHeartbeatRecord): Promise<void> {
      // Migration 0014 persisted ordinary signed-in visitors under the legacy
      // `google` token. Keep that storage compatibility behind the repository;
      // current service and UI contracts are provider-neutral.
      const storedAccountType = record.accountType === 'member' ? 'google' : record.accountType;
      await env.DB.prepare(`
        INSERT INTO analytics_pageviews (
          pageview_id_hash, visit_date, visitor_id_hash, session_id_hash, principal_id,
          account_type, path, source, device_type, browser_name, operating_system,
          country_code, region_code, city, started_at, last_seen_at, heartbeat_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(pageview_id_hash) DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          heartbeat_count = analytics_pageviews.heartbeat_count + 1,
          principal_id = COALESCE(excluded.principal_id, analytics_pageviews.principal_id),
          account_type = CASE
            WHEN excluded.account_type = 'guest' THEN analytics_pageviews.account_type
            ELSE excluded.account_type
          END
      `).bind(
        record.pageviewHash, record.visitDate, record.visitorHash, record.sessionHash,
        record.principalId, storedAccountType, record.path, record.source,
        record.deviceType, record.browserName, record.operatingSystem, record.countryCode,
        record.regionCode, record.city, record.startedAt, record.lastSeenAt,
      ).run();
    },

    async countActive(activeCutoff: number): Promise<number> {
      return readActiveCount(env.DB, activeCutoff);
    },

    async listActivePractice(activeCutoff: number, viewerId: string | null = null): Promise<Array<{
      activity: string;
      displayName: string;
      startedAt: number | null;
      authorId: string;
      isOwnProfile: boolean;
    }>> {
      const rows = await env.DB.prepare(`
        SELECT identity.approved_display_name AS display_name, visitor.practice_activity, visitor.practice_started_at,
          identity.public_id, CASE WHEN visitor.principal_id = ? THEN 1 ELSE 0 END AS is_own_profile
        FROM active_visitors visitor
        INNER JOIN practice_profiles profile ON profile.owner_id = visitor.principal_id
          AND profile.presence_opt_in = 1
        INNER JOIN app_users member ON member.id = visitor.principal_id AND member.status = 'active'
        INNER JOIN ugc_public_profiles identity ON identity.owner_id = visitor.principal_id AND identity.approved_display_name IS NOT NULL
        WHERE visitor.last_seen_at >= ? AND visitor.practice_visible = 1
          AND visitor.practice_activity IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = ? AND b.blocked_owner_id = visitor.principal_id)
        ORDER BY visitor.last_seen_at DESC
        LIMIT 50
      `).bind(viewerId, activeCutoff, viewerId).all<{
        display_name: string | null;
        practice_activity: string;
        practice_started_at: number | null;
        public_id: string;
        is_own_profile: number;
      }>();
      return (rows.results ?? []).map((row) => ({
        activity: row.practice_activity,
        displayName: row.display_name?.trim() || 'Thành viên Quang Từ',
        startedAt: row.practice_started_at,
        authorId: row.public_id,
        isOwnProfile: Boolean(row.is_own_profile),
      }));
    },

    async purgeExpired(activeCutoff: number, analyticsCutoff: number): Promise<{ hasMore: boolean; purged: number }> {
      invalidateActiveCount(env.DB);
      try {
        const activeResult = await env.DB.prepare(
          'DELETE FROM active_visitors WHERE last_seen_at < ?',
        ).bind(activeCutoff).run();
        let purged = Number(activeResult.meta?.changes || 0);
        let dailyHasMore = false;
        for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
          const analyticsResult = await env.DB.prepare(`
            DELETE FROM visitor_daily_presence
            WHERE (visit_date, visitor_id_hash) IN (
              SELECT visit_date, visitor_id_hash
              FROM visitor_daily_presence
              WHERE last_seen_at < ?
              ORDER BY last_seen_at ASC
              LIMIT 500
            )
          `).bind(analyticsCutoff).run();
          purged += Number(analyticsResult.meta?.changes || 0);
          const backlog = await env.DB.prepare(`
            SELECT EXISTS(
              SELECT 1 FROM visitor_daily_presence WHERE last_seen_at < ? LIMIT 1
            ) AS has_more
          `).bind(analyticsCutoff).first<{ has_more?: number }>();
          dailyHasMore = Number(backlog?.has_more || 0) === 1;
          if (!dailyHasMore) break;
        }
        let pageviewsHasMore = false;
        try {
          for (let batchIndex = 0; batchIndex < 10; batchIndex += 1) {
            const pageviewsResult = await env.DB.prepare(`
              DELETE FROM analytics_pageviews
              WHERE pageview_id_hash IN (
                SELECT pageview_id_hash FROM analytics_pageviews
                WHERE last_seen_at < ? ORDER BY last_seen_at ASC LIMIT 500
              )
            `).bind(analyticsCutoff).run();
            purged += Number(pageviewsResult.meta?.changes || 0);
            const backlog = await env.DB.prepare(`
              SELECT EXISTS(
                SELECT 1 FROM analytics_pageviews WHERE last_seen_at < ? LIMIT 1
              ) AS has_more
            `).bind(analyticsCutoff).first<{ has_more?: number }>();
            pageviewsHasMore = Number(backlog?.has_more || 0) === 1;
            if (!pageviewsHasMore) break;
          }
        } catch (error) {
          if (!/no such table:\s*analytics_pageviews/iu.test(String((error as Error)?.message || error))) throw error;
        }
        return { hasMore: dailyHasMore || pageviewsHasMore, purged };
      } finally { invalidateActiveCount(env.DB); }
    },
  };
}
