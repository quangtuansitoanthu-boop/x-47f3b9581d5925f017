import { sha256 } from '../auth/crypto.js';
import { HttpInputError, readJson } from '../http/request.js';
import { checkRateLimit } from '../http/rate-limit.js';
import { clientAddressHashInput } from '../http/security.js';

export const ACTIVE_WINDOW_SECONDS = 120;
export const HEARTBEAT_INTERVAL_SECONDS = 60;
const VISITOR_RETENTION_MS = 24 * 60 * 60 * 1000;
const VISITOR_ID_PATTERN = /^[A-Za-z0-9_-]{20,100}$/u;
const MAX_VISITORS_PER_NETWORK = 20;
const MIN_WRITE_INTERVAL_MS = 45_000;

export async function heartbeatPresence(request, env, dependencies = {}) {
  if (String(env.PRESENCE_ENABLED || 'true').toLowerCase() === 'false') {
    return presencePayload(0, false);
  }

  const body = await readJson(request, 2_000);
  const visitorId = typeof body.visitorId === 'string' ? body.visitorId.trim() : '';
  if (!VISITOR_ID_PATTERN.test(visitorId)) {
    throw new HttpInputError(400, 'invalid_visitor_id', 'Định danh trình duyệt không hợp lệ.');
  }

  const networkHash = await sha256([
    env.RATE_LIMIT_SALT || '',
    'presence-network',
    clientAddressHashInput(request),
  ].join(':'));
  const limiter = dependencies.rateLimiter || env.PRESENCE_RATE_LIMITER;
  if (!await checkRateLimit(limiter, networkHash)) {
    throw new HttpInputError(429, 'rate_limited', 'Bộ đếm đang cập nhật quá nhanh.');
  }

  const now = dependencies.now ?? Date.now();
  const visitorHash = await sha256(`${env.RATE_LIMIT_SALT || ''}:visitor:${visitorId}`);
  const overflowHash = await sha256(`${env.RATE_LIMIT_SALT || ''}:presence-overflow:${networkHash}`);
  const activeCutoff = now - ACTIVE_WINDOW_SECONDS * 1000;
  const writeCutoff = now - MIN_WRITE_INTERVAL_MS;
  try {
    // One atomic D1 batch throttles repeats, reuses inactive slots, admits at most
    // MAX_VISITORS_PER_NETWORK active IDs per network, then coalesces overflow.
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE active_visitors
        SET network_hash = ?, last_seen_at = ?
        WHERE visitor_id_hash = ? AND last_seen_at <= ?
      `).bind(networkHash, now, visitorHash, writeCutoff),
      env.DB.prepare(`
        UPDATE active_visitors
        SET visitor_id_hash = ?, network_hash = ?, last_seen_at = ?
        WHERE visitor_id_hash = (
          SELECT visitor_id_hash FROM active_visitors
          WHERE network_hash = ? AND last_seen_at < ?
            AND visitor_id_hash <> ?
            AND NOT EXISTS (
              SELECT 1 FROM active_visitors WHERE visitor_id_hash = ?
            )
          ORDER BY last_seen_at ASC
          LIMIT 1
        )
      `).bind(
        visitorHash, networkHash, now,
        networkHash, activeCutoff, overflowHash, visitorHash,
      ),
      env.DB.prepare(`
        INSERT INTO active_visitors (visitor_id_hash, network_hash, last_seen_at)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM active_visitors WHERE visitor_id_hash = ?
        ) AND (
          SELECT COUNT(*) FROM active_visitors
          WHERE network_hash = ? AND last_seen_at >= ?
        ) < ?
        ON CONFLICT(visitor_id_hash) DO NOTHING
      `).bind(
        visitorHash, networkHash, now, visitorHash,
        networkHash, activeCutoff, MAX_VISITORS_PER_NETWORK,
      ),
      env.DB.prepare(`
        INSERT INTO active_visitors (visitor_id_hash, network_hash, last_seen_at)
        SELECT ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM active_visitors WHERE visitor_id_hash = ?
        ) AND (
          SELECT COUNT(*) FROM active_visitors
          WHERE network_hash = ? AND last_seen_at >= ?
        ) >= ?
        ON CONFLICT(visitor_id_hash) DO UPDATE SET last_seen_at = excluded.last_seen_at
        WHERE active_visitors.last_seen_at <= ?
      `).bind(
        overflowHash, networkHash, now, visitorHash,
        networkHash, activeCutoff, MAX_VISITORS_PER_NETWORK, writeCutoff,
      ),
    ]);
    const active = await env.DB.prepare(`
      SELECT COUNT(*) AS active_count
      FROM active_visitors
      WHERE last_seen_at >= ?
    `).bind(activeCutoff).first();
    return presencePayload(Number(active?.active_count || 0), true);
  } catch (error) {
    if (isMissingPresenceTable(error)) return presencePayload(0, false);
    throw error;
  }
}

export async function purgeExpiredVisitors(env, now = Date.now()) {
  if (!env.DB) return { purged: 0 };
  try {
    const result = await env.DB.prepare(
      'DELETE FROM active_visitors WHERE last_seen_at < ?',
    ).bind(now - VISITOR_RETENTION_MS).run();
    return { purged: Number(result?.meta?.changes || 0) };
  } catch (error) {
    if (isMissingPresenceTable(error)) return { purged: 0 };
    throw error;
  }
}

function isMissingPresenceTable(error) {
  return /no such table:\s*active_visitors/iu.test(String(error?.message || error));
}

function presencePayload(activeCount, enabled) {
  return {
    enabled,
    activeCount,
    heartbeatIntervalSeconds: HEARTBEAT_INTERVAL_SECONDS,
    activeWindowSeconds: ACTIVE_WINDOW_SECONDS,
  };
}
