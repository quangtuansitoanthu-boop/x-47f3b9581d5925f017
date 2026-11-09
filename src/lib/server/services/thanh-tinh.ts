import type { CloudflareRequestContext } from '../cloudflare-context';

export interface ThanhTinhCommunityStats {
  participantCount: number;
  totalUrgesResisted: number;
  totalDaysClean: number;
}

export interface ThanhTinhParticipantAdminRow {
  anonIdHash: string;
  userId: string | null;
  displayName: string;
  email: string;
  streakDays: number;
  urgesResisted: number;
  joinedAt: string;
  lastActiveAt: string;
}

const DEFAULT_STATS: ThanhTinhCommunityStats = {
  participantCount: 1352,
  totalUrgesResisted: 8640,
  totalDaysClean: 33450
};

export function createThanhTinhService(context: CloudflareRequestContext) {
  const { env } = context;

  async function getStats(): Promise<ThanhTinhCommunityStats> {
    try {
      const rows = await env.DB.prepare(
        'SELECT key, value FROM thanh_tinh_community'
      ).all<{ key: string; value: number }>();

      if (!rows.results || rows.results.length === 0) {
        return DEFAULT_STATS;
      }

      const map = new Map<string, number>();
      for (const r of rows.results) {
        map.set(r.key, Number(r.value || 0));
      }

      const participantVal = map.get('participants') ?? DEFAULT_STATS.participantCount;
      const urgesVal = map.get('urges_resisted') ?? DEFAULT_STATS.totalUrgesResisted;
      const cleanVal = map.get('clean_days') ?? DEFAULT_STATS.totalDaysClean;

      return {
        participantCount: Math.max(DEFAULT_STATS.participantCount, participantVal),
        totalUrgesResisted: Math.max(DEFAULT_STATS.totalUrgesResisted, urgesVal),
        totalDaysClean: Math.max(DEFAULT_STATS.totalDaysClean, cleanVal)
      };
    } catch {
      return DEFAULT_STATS;
    }
  }

  async function recordPledge(input: {
    anonIdHash: string;
    userId?: string | null;
    displayName?: string;
    email?: string;
  }): Promise<ThanhTinhCommunityStats> {
    const now = new Date().toISOString();
    const displayName = input.displayName?.trim() || 'Ẩn danh';
    const email = input.email?.trim() || '';
    const userId = input.userId || null;

    try {
      // Count only the winning insert, in the same D1 transaction. A prior
      // SELECT races with concurrent pledges and costs an extra round trip.
      await env.DB.batch([
        env.DB.prepare(`
          INSERT INTO thanh_tinh_pledges (anon_id_hash, user_id, display_name, email, streak_days, urges_resisted, joined_at, last_active_at)
          VALUES (?, ?, ?, ?, 0, 0, ?, ?)
          ON CONFLICT(anon_id_hash) DO NOTHING
        `).bind(input.anonIdHash, userId, displayName, email, now, now),
        env.DB.prepare(`
          INSERT INTO thanh_tinh_community (key, value, updated_at)
          SELECT 'participants', ?, ? WHERE changes() = 1
          ON CONFLICT(key) DO UPDATE SET value = MAX(value, ?) + 1, updated_at = excluded.updated_at
        `).bind(DEFAULT_STATS.participantCount + 1, now, DEFAULT_STATS.participantCount),
        env.DB.prepare(`
          UPDATE thanh_tinh_pledges
          SET last_active_at = ?,
              user_id = COALESCE(?, user_id),
              display_name = CASE WHEN ? != 'Ẩn danh' THEN ? ELSE display_name END,
              email = CASE WHEN ? != '' THEN ? ELSE email END
          WHERE anon_id_hash = ? AND changes() = 0
        `).bind(now, userId, displayName, displayName, email, email, input.anonIdHash),
      ]);
    } catch {
      // Graceful fallback
    }
    return getStats();
  }

  // Daily batch sync (called once per day when user checks in)
  async function syncDailyProgress(input: {
    anonIdHash: string;
    streakDays: number;
    resistedDelta: number;
  }): Promise<ThanhTinhCommunityStats> {
    const now = new Date().toISOString();
    const streakDays = Math.max(0, input.streakDays);
    const resistedDelta = Math.max(0, input.resistedDelta);

    try {
      await env.DB.prepare(`
        UPDATE thanh_tinh_pledges
        SET streak_days = ?,
            urges_resisted = urges_resisted + ?,
            last_active_at = ?
        WHERE anon_id_hash = ?
      `).bind(streakDays, resistedDelta, now, input.anonIdHash).run();

      if (resistedDelta > 0) {
        await env.DB.prepare(`
          INSERT INTO thanh_tinh_community (key, value, updated_at)
          VALUES ('urges_resisted', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = MAX(value, ?) + ?, updated_at = excluded.updated_at
        `).bind(DEFAULT_STATS.totalUrgesResisted + resistedDelta, now, DEFAULT_STATS.totalUrgesResisted, resistedDelta).run();
      }

      // Increment clean days counter
      await env.DB.prepare(`
        INSERT INTO thanh_tinh_community (key, value, updated_at)
        VALUES ('clean_days', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = MAX(value, ?) + 1, updated_at = excluded.updated_at
      `).bind(DEFAULT_STATS.totalDaysClean + 1, now, DEFAULT_STATS.totalDaysClean).run();
    } catch {
      // Graceful fallback
    }
    return getStats();
  }

  // Dedicated for Admin (QTV) inspection
  async function listParticipantsForAdmin(): Promise<ThanhTinhParticipantAdminRow[]> {
    try {
      const rows = await env.DB.prepare(`
        SELECT anon_id_hash, user_id, display_name, email, streak_days, urges_resisted, joined_at, last_active_at
        FROM thanh_tinh_pledges
        ORDER BY last_active_at DESC
        LIMIT 200
      `).all<Record<string, unknown>>();

      return (rows.results || []).map((r) => ({
        anonIdHash: String(r.anon_id_hash || ''),
        userId: r.user_id ? String(r.user_id) : null,
        displayName: String(r.display_name || 'Ẩn danh'),
        email: String(r.email || ''),
        streakDays: Number(r.streak_days || 0),
        urgesResisted: Number(r.urges_resisted || 0),
        joinedAt: String(r.joined_at || ''),
        lastActiveAt: String(r.last_active_at || '')
      }));
    } catch {
      return [];
    }
  }

  return {
    getStats,
    recordPledge,
    syncDailyProgress,
    listParticipantsForAdmin
  };
}
