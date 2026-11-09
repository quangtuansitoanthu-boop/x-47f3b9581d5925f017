import type { CloudflareEnvLike } from '../cloudflare-context';

export interface PracticeRankingAggregateRow {
  active_days: number;
  avatar_url: string | null;
  display_name: string | null;
  id: string;
  log_count: number;
  streak: number;
  totals_json: string;
}

export function createAdminCommunityRepository(env: CloudflareEnvLike) {
  return {
    async onlineBreakdown(activeCutoff: number) {
      return env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN principal_id IS NULL THEN 1 ELSE 0 END) AS guests,
          SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END) AS members,
          SUM(CASE WHEN role IN ('ctv', 'admin') THEN 1 ELSE 0 END) AS internal
        FROM active_visitors WHERE last_seen_at >= ?
      `).bind(activeCutoff).first<Record<string, unknown>>();
    },

    async practiceRanking(startDate: string, endDate: string): Promise<PracticeRankingAggregateRow[]> {
      const response = await env.DB.prepare(`
        WITH raw_logs AS (
          SELECT u.id, u.display_name, u.avatar_url,
            json_extract(CASE WHEN entry.type = 'object' THEN entry.value ELSE '{}' END, '$.date') AS raw_date,
            json_extract(CASE WHEN entry.type = 'object' THEN entry.value ELSE '{}' END, '$.type') AS raw_type,
            json_extract(CASE WHEN entry.type = 'object' THEN entry.value ELSE '{}' END, '$.count') AS raw_count
          FROM app_users u
          INNER JOIN user_sync_data sync ON sync.id = u.id
          INNER JOIN json_each(CASE WHEN json_valid(sync.practice_logs) THEN sync.practice_logs ELSE '[]' END) entry
        ), logs AS (
          SELECT id, display_name, avatar_url, raw_date AS practice_date,
            CASE WHEN typeof(raw_type) = 'text' AND trim(raw_type) <> ''
              THEN substr(trim(raw_type), 1, 80) ELSE 'Khác' END AS practice_type,
            CASE
              WHEN CAST(raw_count AS REAL) > 1000000000 THEN 1000000000.0
              WHEN CAST(raw_count AS REAL) >= 1 THEN CAST(raw_count AS REAL)
              ELSE 1.0
            END AS practice_count
          FROM raw_logs
          WHERE raw_date BETWEEN ? AND ?
            AND raw_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND date(raw_date) = raw_date
        ), distinct_dates AS (
          SELECT DISTINCT id, practice_date FROM logs
        ), ordered_dates AS (
          SELECT id, practice_date,
            MAX(practice_date) OVER (PARTITION BY id) AS last_date,
            ROW_NUMBER() OVER (PARTITION BY id ORDER BY practice_date DESC) AS sequence
          FROM distinct_dates
        ), streaks AS (
          SELECT id,
            CASE WHEN last_date NOT IN (?, date(?, '-1 day')) THEN 0
              ELSE COALESCE(
                MIN(CASE WHEN practice_date <> date(last_date, '-' || (sequence - 1) || ' day') THEN sequence - 1 END),
                COUNT(*)
              ) END AS streak
          FROM ordered_dates GROUP BY id, last_date
        ), user_summary AS (
          SELECT id, display_name, avatar_url, COUNT(DISTINCT practice_date) AS active_days,
            COUNT(*) AS log_count
          FROM logs GROUP BY id, display_name, avatar_url
        ), type_totals AS (
          SELECT id, practice_type,
            MIN(TOTAL(practice_count), 9007199254740991.0) AS total_count
          FROM logs GROUP BY id, practice_type
        ), type_json AS (
          SELECT id, json_group_array(json_object('type', practice_type, 'count', total_count)) AS totals_json
          FROM type_totals GROUP BY id
        )
        SELECT summary.id, summary.display_name, summary.avatar_url, summary.active_days,
          summary.log_count, COALESCE(streaks.streak, 0) AS streak,
          COALESCE(types.totals_json, '[]') AS totals_json
        FROM user_summary summary
        LEFT JOIN type_json types ON types.id = summary.id
        LEFT JOIN streaks ON streaks.id = summary.id
        ORDER BY summary.active_days DESC, streak DESC, summary.log_count DESC,
          lower(COALESCE(summary.display_name, summary.id)) ASC, summary.id ASC
        LIMIT 50
      `).bind(startDate, endDate, endDate, endDate).all<PracticeRankingAggregateRow>();
      return response.results ?? [];
    },
  };
}
