import type { CloudflareEnvLike, D1PreparedStatement, D1ResultRow } from '../cloudflare-context';
import type { CompletedPracticeLog } from '../../domain/practice/completed-logs';
import { normalizePracticeLogs } from '../../domain/practice/logs';

export interface PracticeProfileRow extends D1ResultRow {
  owner_id: string;
  time_zone: string;
  leaderboard_opt_in: number;
  presence_opt_in: number;
  selected_badge: string | null;
  created_at: string;
  updated_at: string;
  public_author_id?: string | null;
  public_moderation_status?: 'pending' | 'approved' | 'rejected' | null;
  public_moderation_reason?: string | null;
  public_revision?: number | null;
}

export interface AcceptedPracticeActivityRow extends D1ResultRow {
  id: string;
  owner_id: string;
  accepted_count: number;
  accepted_duration_seconds: number;
  completed_at: string;
}

export interface PublicPracticeActivityRow extends AcceptedPracticeActivityRow {
  display_name: string | null;
  avatar_url: string | null;
  time_zone: string;
  selected_badge: string | null;
  public_author_id?: string;
  is_own_profile?: number;
}

export interface PracticeCampaignRow extends D1ResultRow {
  id: string;
  title: string;
  description: string;
  metric: 'count' | 'duration_seconds' | 'sessions';
  goal_value: number;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'active' | 'closed';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
  contribution_value?: number;
  joined?: number;
}

export function createPracticeCommunityRepository(env: CloudflareEnvLike) {
  return {
    getProfile(ownerId: string) {
      return env.DB.prepare(`SELECT profile.owner_id, profile.time_zone, profile.leaderboard_opt_in, profile.presence_opt_in,
        profile.selected_badge, profile.created_at, profile.updated_at, public.public_id AS public_author_id,
        public.moderation_status AS public_moderation_status, public.moderation_reason AS public_moderation_reason,
        public.revision AS public_revision
        FROM practice_profiles profile LEFT JOIN ugc_public_profiles public ON public.owner_id = profile.owner_id
        WHERE profile.owner_id = ? LIMIT 1`)
        .bind(ownerId).first<PracticeProfileRow>();
    },

    async upsertProfile(ownerId: string, input: {
      timeZone: string;
      leaderboardOptIn: boolean;
      presenceOptIn: boolean;
      selectedBadge: string | null;
    }, now: string): Promise<void> {
      await env.DB.prepare(`
        INSERT INTO practice_profiles (
          owner_id, time_zone, leaderboard_opt_in, presence_opt_in, selected_badge, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(owner_id) DO UPDATE SET
          time_zone = excluded.time_zone,
          leaderboard_opt_in = excluded.leaderboard_opt_in,
          presence_opt_in = excluded.presence_opt_in,
          selected_badge = excluded.selected_badge,
          updated_at = excluded.updated_at
      `).bind(
        ownerId,
        input.timeZone,
        input.leaderboardOptIn ? 1 : 0,
        input.presenceOptIn ? 1 : 0,
        input.selectedBadge,
        now,
        now,
      ).run();
    },

    async isPresenceOptedIn(ownerId: string): Promise<boolean> {
      const row = await env.DB.prepare(`
        SELECT presence_opt_in FROM practice_profiles WHERE owner_id = ? LIMIT 1
      `).bind(ownerId).first<{ presence_opt_in?: number }>();
      return row?.presence_opt_in === 1;
    },

    listAcceptedActivitiesPage(
      ownerId: string,
      cursor: { completedAt: string; id: string } | null,
      toIso: string,
      limit = 5_000,
    ) {
      return env.DB.prepare(`
        SELECT id, owner_id, accepted_count, accepted_duration_seconds, completed_at
        FROM practice_sessions
        WHERE owner_id = ? AND status = 'completed' AND verification_result = 'accepted'
          AND completed_at <= ?
          AND (? IS NULL OR completed_at > ? OR (completed_at = ? AND id > ?))
        ORDER BY completed_at ASC, id ASC
        LIMIT ?
      `).bind(
        ownerId,
        toIso,
        cursor?.completedAt ?? null,
        cursor?.completedAt ?? null,
        cursor?.completedAt ?? null,
        cursor?.id ?? '',
        limit,
      ).all<AcceptedPracticeActivityRow>();
    },

    async totalAcceptedCount(ownerId: string): Promise<number> {
      const row = await env.DB.prepare(`
        SELECT COALESCE(SUM(accepted_count), 0) AS total
        FROM practice_sessions
        WHERE owner_id = ? AND status = 'completed' AND verification_result = 'accepted'
      `).bind(ownerId).first<{ total?: number }>();
      return Number(row?.total ?? 0);
    },

    async acceptedTotals(ownerId: string): Promise<{
      acceptedCount: number;
      acceptedDurationSeconds: number;
      sessions: number;
    }> {
      const row = await env.DB.prepare(`
        SELECT COALESCE(SUM(accepted_count), 0) AS accepted_count,
          COALESCE(SUM(accepted_duration_seconds), 0) AS accepted_duration_seconds,
          COUNT(*) AS sessions
        FROM practice_sessions
        WHERE owner_id = ? AND status = 'completed' AND verification_result = 'accepted'
      `).bind(ownerId).first<{
        accepted_count?: number;
        accepted_duration_seconds?: number;
        sessions?: number;
      }>();
      return {
        acceptedCount: Number(row?.accepted_count ?? 0),
        acceptedDurationSeconds: Number(row?.accepted_duration_seconds ?? 0),
        sessions: Number(row?.sessions ?? 0),
      };
    },

    listPublicAcceptedActivitiesPage(
      fromIso: string,
      toIso: string,
      cursor: { completedAt: string; id: string } | null,
      limit: number,
      viewerId: string | null = null,
    ) {
      return env.DB.prepare(`
        SELECT sessions.id, sessions.owner_id, sessions.accepted_count,
          sessions.accepted_duration_seconds, sessions.completed_at,
          public.approved_display_name AS display_name, public.approved_avatar_url AS avatar_url,
          public.public_id AS public_author_id, CASE WHEN sessions.owner_id = ? THEN 1 ELSE 0 END AS is_own_profile,
          profiles.time_zone, profiles.selected_badge
        FROM practice_sessions sessions
        INNER JOIN practice_profiles profiles ON profiles.owner_id = sessions.owner_id
          AND profiles.leaderboard_opt_in = 1
        INNER JOIN app_users users ON users.id = sessions.owner_id
        INNER JOIN ugc_public_profiles public ON public.owner_id = sessions.owner_id AND public.approved_display_name IS NOT NULL
        WHERE sessions.status = 'completed' AND sessions.verification_result = 'accepted'
          AND users.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM ugc_user_blocks b WHERE b.blocker_id = ? AND b.blocked_owner_id = sessions.owner_id)
          AND sessions.completed_at >= ? AND sessions.completed_at <= ?
          AND (? IS NULL OR sessions.completed_at > ?
            OR (sessions.completed_at = ? AND sessions.id > ?))
        ORDER BY sessions.completed_at ASC, sessions.id ASC
        LIMIT ?
      `).bind(
        viewerId, viewerId,
        fromIso,
        toIso,
        cursor?.completedAt ?? null,
        cursor?.completedAt ?? null,
        cursor?.completedAt ?? null,
        cursor?.id ?? '',
        limit,
      ).all<PublicPracticeActivityRow>();
    },

    listCampaigns(includeDrafts: boolean, now: string, ownerId: string | null = null) {
      return env.DB.prepare(`
        SELECT campaigns.*,
          (SELECT COUNT(*) FROM practice_campaign_members members
            WHERE members.campaign_id = campaigns.id AND members.left_at IS NULL) AS member_count,
          (SELECT COALESCE(SUM(contributions.contribution_value), 0)
            FROM practice_campaign_contributions contributions
            WHERE contributions.campaign_id = campaigns.id) AS contribution_value,
          EXISTS(
            SELECT 1 FROM practice_campaign_members current_member
            WHERE current_member.campaign_id = campaigns.id
              AND current_member.owner_id = ? AND current_member.left_at IS NULL
          ) AS joined
        FROM practice_campaigns campaigns
        WHERE (? = 1 OR (campaigns.status = 'active' AND campaigns.starts_at <= ? AND campaigns.ends_at >= ?))
        ORDER BY campaigns.starts_at DESC, campaigns.id DESC
      `).bind(ownerId, includeDrafts ? 1 : 0, now, now).all<PracticeCampaignRow>();
    },

    getCampaign(campaignId: string) {
      return env.DB.prepare('SELECT * FROM practice_campaigns WHERE id = ? LIMIT 1')
        .bind(campaignId).first<PracticeCampaignRow>();
    },

    async createCampaign(input: {
      id: string;
      title: string;
      description: string;
      metric: 'count' | 'duration_seconds' | 'sessions';
      goal_value: number;
      starts_at: string;
      ends_at: string;
      status: 'draft' | 'active' | 'closed';
      created_by: string;
      created_at: string;
      updated_at: string;
    }): Promise<boolean> {
      const result = await env.DB.prepare(`
        INSERT INTO practice_campaigns (
          id, title, description, metric, goal_value, starts_at, ends_at,
          status, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        input.id, input.title, input.description, input.metric, input.goal_value,
        input.starts_at, input.ends_at, input.status, input.created_by,
        input.created_at, input.updated_at,
      ).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },

    async updateCampaign(campaignId: string, input: {
      title: string;
      description: string;
      metric: string;
      goalValue: number;
      startsAt: string;
      endsAt: string;
      status: string;
    }, now: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE practice_campaigns
        SET title = ?, description = ?, metric = ?, goal_value = ?, starts_at = ?,
          ends_at = ?, status = ?, updated_at = ?
        WHERE id = ?
          AND (
            (metric = ? AND starts_at = ?)
            OR NOT EXISTS (
              SELECT 1 FROM practice_campaign_contributions contributions
              WHERE contributions.campaign_id = practice_campaigns.id
            )
          )
      `).bind(
        input.title, input.description, input.metric, input.goalValue, input.startsAt,
        input.endsAt, input.status, now, campaignId,
        input.metric, input.startsAt,
      ).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },

    async deleteCampaign(campaignId: string): Promise<boolean> {
      const result = await env.DB.prepare('DELETE FROM practice_campaigns WHERE id = ?')
        .bind(campaignId).run();
      // D1 includes rows removed by ON DELETE CASCADE, including members and contributions.
      return Number(result.meta?.changes ?? 0) > 0;
    },

    async joinCampaign(campaignId: string, ownerId: string, now: string): Promise<void> {
      await env.DB.prepare(`
        INSERT INTO practice_campaign_members (campaign_id, owner_id, joined_at, left_at)
        VALUES (?, ?, ?, NULL)
        ON CONFLICT(campaign_id, owner_id) DO UPDATE SET joined_at = excluded.joined_at, left_at = NULL
      `).bind(campaignId, ownerId, now).run();
    },

    async leaveCampaign(campaignId: string, ownerId: string, now: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE practice_campaign_members SET left_at = ?
        WHERE campaign_id = ? AND owner_id = ? AND left_at IS NULL
      `).bind(now, campaignId, ownerId).run();
      return Number(result.meta?.changes ?? 0) === 1;
    },

    listCampaignMembers(campaignId: string) {
      return env.DB.prepare(`
        SELECT members.owner_id, members.joined_at, members.left_at,
          users.display_name, users.avatar_url,
          COALESCE(profiles.leaderboard_opt_in, 0) AS identity_visible,
          COALESCE(SUM(contributions.contribution_value), 0) AS contribution_value
        FROM practice_campaign_members members
        INNER JOIN app_users users ON users.id = members.owner_id
        LEFT JOIN practice_profiles profiles ON profiles.owner_id = members.owner_id
        LEFT JOIN practice_campaign_contributions contributions
          ON contributions.campaign_id = members.campaign_id AND contributions.owner_id = members.owner_id
        WHERE members.campaign_id = ?
        GROUP BY members.campaign_id, members.owner_id
        ORDER BY contribution_value DESC, members.joined_at ASC
      `).bind(campaignId).all<{
        owner_id: string;
        joined_at: string;
        left_at: string | null;
        display_name: string | null;
        avatar_url: string | null;
        identity_visible: number;
        contribution_value: number;
      }>();
    },

    async contributeAcceptedSession(sessionId: string, ownerId: string, now: string): Promise<number> {
      const result = await env.DB.prepare(`
        INSERT INTO practice_campaign_contributions (
          campaign_id, session_id, owner_id, contribution_value, created_at
        )
        SELECT campaigns.id, sessions.id, sessions.owner_id,
          CASE campaigns.metric
            WHEN 'count' THEN sessions.accepted_count
            WHEN 'duration_seconds' THEN sessions.accepted_duration_seconds
            ELSE 1
          END,
          ?
        FROM practice_sessions sessions
        INNER JOIN practice_campaign_members members ON members.owner_id = sessions.owner_id
          AND members.left_at IS NULL
          AND sessions.completed_at >= members.joined_at
        INNER JOIN practice_campaigns campaigns ON campaigns.id = members.campaign_id
          AND campaigns.status = 'active'
          AND sessions.completed_at >= campaigns.starts_at
          AND sessions.completed_at <= campaigns.ends_at
        WHERE sessions.id = ? AND sessions.owner_id = ?
          AND sessions.status = 'completed' AND sessions.verification_result = 'accepted'
          AND CASE campaigns.metric
            WHEN 'count' THEN sessions.accepted_count
            WHEN 'duration_seconds' THEN sessions.accepted_duration_seconds
            ELSE 1
          END > 0
        ON CONFLICT(campaign_id, session_id) DO NOTHING
      `).bind(now, sessionId, ownerId).run();
      return Number(result.meta?.changes ?? 0);
    },

    async recordManualCampaignContribution(input: {
      campaignId: string;
      ownerId: string;
      logId: number;
      type: string;
      count: number;
      note?: string;
      date: string;
      metric: 'count' | 'duration_seconds' | 'sessions';
      now: string;
    }): Promise<{ contributionValue: number }> {
      const clientSessionId = `manual:${input.campaignId}:${input.logId}`;
      const physicalSessionId = `manual:${input.ownerId}:${input.campaignId}:${input.logId}`;
      const activityType = input.type === 'Ngồi thiền'
        ? 'meditation'
        : (input.type === 'Chép kinh' || input.type === 'Tụng kinh')
          ? 'scripture'
          : 'rosary';
      const targetDuration = input.type === 'Ngồi thiền' ? input.count * 60 : null;
      const acceptedDuration = input.type === 'Ngồi thiền' ? input.count * 60 : 0;
      const contributionValue = input.metric === 'count'
        ? input.count
        : input.metric === 'duration_seconds'
          ? acceptedDuration
          : 1;

      const sessionStmt = env.DB.prepare(`
        INSERT INTO practice_sessions (
          id, owner_id, client_session_id, activity_type, status,
          target_count, accepted_count, target_duration_seconds, accepted_duration_seconds,
          source_kind, source_id, started_at, completed_at,
          verification_result, verification_reason, evidence_summary_json,
          idempotency_key, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, 'completed',
          ?, ?, ?, ?,
          'manual_log', ?, ?, ?,
          'accepted', 'manual_entry', ?,
          ?, ?, ?
        )
        ON CONFLICT(owner_id, client_session_id) DO UPDATE SET
          target_count = excluded.target_count,
          accepted_count = excluded.accepted_count,
          target_duration_seconds = excluded.target_duration_seconds,
          accepted_duration_seconds = excluded.accepted_duration_seconds,
          updated_at = excluded.updated_at
      `).bind(
        physicalSessionId,
        input.ownerId,
        clientSessionId,
        activityType,
        input.count,
        input.count,
        targetDuration,
        acceptedDuration,
        input.campaignId,
        input.now,
        input.now,
        JSON.stringify({
          manual: true,
          type: input.type,
          count: input.count,
          note: input.note ?? '',
          date: input.date,
        }),
        clientSessionId,
        input.now,
        input.now,
      );

      const contributionStmt = env.DB.prepare(`
        INSERT INTO practice_campaign_contributions (
          campaign_id, session_id, owner_id, contribution_value, created_at
        ) VALUES (
          ?,
          (SELECT id FROM practice_sessions WHERE owner_id = ? AND client_session_id = ?),
          ?,
          ?,
          ?
        )
        ON CONFLICT(campaign_id, session_id) DO UPDATE SET
          contribution_value = excluded.contribution_value
      `).bind(
        input.campaignId,
        input.ownerId,
        clientSessionId,
        input.ownerId,
        contributionValue,
        input.now,
      );

      await env.DB.batch([sessionStmt, contributionStmt]);

      return { contributionValue };
    },

    async deleteManualCampaignContribution(ownerId: string, campaignId: string, logId: number): Promise<boolean> {
      const sessionId = `manual:${campaignId}:${logId}`;
      const result = await env.DB.prepare(`
        DELETE FROM practice_sessions
        WHERE owner_id = ? AND client_session_id = ?
      `).bind(ownerId, sessionId).run();
      return Number(result.meta?.changes ?? 0) > 0;
    },

    practiceBreakdown(ownerId: string) {
      return env.DB.prepare(`
        SELECT ps.activity_type, ps.source_kind, ps.source_id,
          CASE WHEN ps.source_kind IN ('manual_log', 'legacy_import') THEN
            CASE WHEN json_extract(ps.evidence_summary_json, '$.type') IN ('Lễ Phật', 'Chép kinh', 'Chép danh hiệu')
              THEN json_extract(ps.evidence_summary_json, '$.type')
            WHEN json_extract(ps.evidence_summary_json, '$.legacyType') IN ('Lễ Phật', 'Chép kinh', 'Chép danh hiệu')
              THEN json_extract(ps.evidence_summary_json, '$.legacyType') END
          END AS practice_type,
          COUNT(*) AS session_count,
          COALESCE(SUM(ps.accepted_count), 0) AS accepted_count,
          COALESCE(SUM(ps.accepted_duration_seconds), 0) AS accepted_duration_seconds,
          CASE WHEN ps.source_id LIKE 'completed-tool:%' THEN NULL ELSE MAX(COALESCE(
            CASE WHEN json_type(ps.evidence_summary_json, '$.dharmaTalk.albumTitle') = 'text' THEN NULLIF(json_extract(ps.evidence_summary_json, '$.dharmaTalk.albumTitle'), '') END,
            pt.tieu_de,
            bv.tieu_de,
            CASE WHEN json_type(ps.evidence_summary_json, '$.articleTitle') = 'text' THEN NULLIF(json_extract(ps.evidence_summary_json, '$.articleTitle'), '') END,
            CASE WHEN json_type(ps.evidence_summary_json, '$.title') = 'text' THEN NULLIF(json_extract(ps.evidence_summary_json, '$.title'), '') END,
            CASE WHEN json_type(ps.evidence_summary_json, '$.chapterTitle') = 'text' THEN NULLIF(json_extract(ps.evidence_summary_json, '$.chapterTitle'), '') END,
            CASE WHEN json_type(ps.evidence_summary_json, '$.phrase') = 'text' THEN NULLIF(json_extract(ps.evidence_summary_json, '$.phrase'), '') END,
            CASE WHEN ps.source_kind = 'legacy_import' AND json_type(ps.evidence_summary_json, '$.note') = 'text'
              AND ps.source_id = json_extract(ps.evidence_summary_json, '$.note') THEN NULLIF(json_extract(ps.evidence_summary_json, '$.note'), '') END
          )) END AS display_title
        FROM practice_sessions ps
        LEFT JOIN phap_thoai pt ON (
          ps.activity_type = 'dharma_talk' AND (
            pt.id = ps.source_id OR
            pt.id = CASE WHEN instr(ps.source_id, ':') > 0 THEN substr(ps.source_id, 1, instr(ps.source_id, ':') - 1) ELSE ps.source_id END
          )
        )
        LEFT JOIN baiviet bv ON (
          ps.activity_type IN ('scripture', 'model_chant') AND bv.id = ps.source_id
        )
        WHERE ps.owner_id = ? AND ps.status = 'completed' AND ps.verification_result = 'accepted'
        GROUP BY ps.activity_type, ps.source_kind, ps.source_id, practice_type
        ORDER BY accepted_count DESC, ps.activity_type
      `).bind(ownerId).all<{
        activity_type: string;
        source_kind: string | null;
        source_id: string | null;
        practice_type: string | null;
        session_count: number;
        accepted_count: number;
        accepted_duration_seconds: number;
        display_title: string | null;
      }>();
    },

        async recordCompletedLogs(ownerId: string, logs: CompletedPracticeLog[], now: string) {
      const statements = logs.flatMap(log => {
        const clientId = `legacy_import_${log.localLogId}`;
        const id = `tool-log:${ownerId}:${log.logId}`;
        const activity = log.type === 'Chép kinh' ? 'scripture' : 'rosary';
        return [
          env.DB.prepare(`
            INSERT INTO practice_sessions (
              id, owner_id, client_session_id, activity_type, status,
              target_count, accepted_count, accepted_duration_seconds,
              source_kind, source_id, started_at, completed_at,
              verification_result, verification_reason, evidence_summary_json,
              idempotency_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'completed', ?, ?, 0, 'manual_log', ?, ?, ?,
              'accepted', 'manual_entry', ?, ?, ?, ?)
            ON CONFLICT(owner_id, client_session_id) DO NOTHING
          `).bind(id, ownerId, clientId, activity, log.count, log.count,
            `completed-tool:${log.type}`, log.completedAt, log.completedAt,
            JSON.stringify({ manual: true, type: log.type, title: log.note || log.type, note: log.note, origin: 'completed_tool', localLogId: log.localLogId }),
            clientId, now, now),
          env.DB.prepare(`
            INSERT INTO practice_campaign_contributions (
              campaign_id, session_id, owner_id, contribution_value, created_at
            )
            SELECT campaigns.id, sessions.id, sessions.owner_id,
              CASE campaigns.metric
                WHEN 'count' THEN sessions.accepted_count
                WHEN 'duration_seconds' THEN sessions.accepted_duration_seconds
                ELSE 1
              END,
              ?
            FROM practice_sessions sessions
            INNER JOIN practice_campaign_members members ON members.owner_id = sessions.owner_id
              AND members.left_at IS NULL
              AND sessions.completed_at >= members.joined_at
            INNER JOIN practice_campaigns campaigns ON campaigns.id = members.campaign_id
              AND campaigns.status = 'active'
              AND sessions.completed_at >= campaigns.starts_at
              AND sessions.completed_at <= campaigns.ends_at
            WHERE sessions.id = ? AND sessions.owner_id = ?
              AND sessions.status = 'completed' AND sessions.verification_result = 'accepted'
              AND CASE campaigns.metric
                WHEN 'count' THEN sessions.accepted_count
                WHEN 'duration_seconds' THEN sessions.accepted_duration_seconds
                ELSE 1
              END > 0
            ON CONFLICT(campaign_id, session_id) DO NOTHING
          `).bind(now, id, ownerId),
        ];
      });
      const results = await env.DB.batch(statements);
      return {
        recorded: results.filter((r, i) => i % 2 === 0 && Number(r.meta?.changes ?? 0) > 0).length,
        contributionsAdded: results.reduce((sum, r, i) => sum + (i % 2 ? Number(r.meta?.changes ?? 0) : 0), 0),
      };
    },

async backfillLegacyPracticeLogs(ownerId: string): Promise<number> {
      const syncRow = await env.DB.prepare(
        'SELECT practice_logs FROM user_sync_data WHERE id = ?'
      ).bind(ownerId).first<{ practice_logs?: string }>();
      if (!syncRow?.practice_logs) return 0;
      let logs: unknown[] = [];
      try {
        logs = JSON.parse(syncRow.practice_logs);
      } catch {
        return 0;
      }
      if (!Array.isArray(logs) || logs.length === 0) return 0;
      const normalizedLogs = normalizePracticeLogs(logs);
      if (normalizedLogs.length === 0) return 0;

      const existingLegacy = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM practice_sessions WHERE owner_id = ? AND source_kind = 'legacy_import'"
      ).bind(ownerId).first<{ count?: number }>();
      if (Number(existingLegacy?.count ?? 0) >= normalizedLogs.length) {
        return 0;
      }

      const statements: D1PreparedStatement[] = [];
      const nowIso = new Date().toISOString();

      for (const log of normalizedLogs) {
        const clientSessionId = `legacy_import_${log.id}`;
        const activityType = log.type === 'Ngồi thiền'
          ? 'meditation'
          : log.type === 'Tụng kinh' || log.type === 'Thọ giới'
            ? 'scripture'
            : 'rosary';

        let acceptedDurationSeconds = 60;
        if (log.type === 'Ngồi thiền') {
          const minuteMatch = log.note.match(/(\d+)\s*(?:phút|m)/iu);
          acceptedDurationSeconds = minuteMatch
            ? Math.max(60, parseInt(minuteMatch[1], 10) * 60)
            : Math.max(60, log.count * 60);
        } else {
          acceptedDurationSeconds = Math.max(60, log.count * 2);
        }

        let completedAt = log.created;
        if (!completedAt || Number.isNaN(Date.parse(completedAt))) {
          if (log.id > 1_000_000_000_000 && log.id < 3_000_000_000_000) {
            completedAt = new Date(log.id).toISOString();
          } else {
            completedAt = `${log.date}T12:00:00.000Z`;
          }
        }
        const startedAt = new Date(Math.max(0, Date.parse(completedAt) - acceptedDurationSeconds * 1000)).toISOString();
        const evidenceSummary = JSON.stringify({
          legacyLogId: log.id,
          legacyType: log.type,
          note: log.note || ''
        });

        // Map legacy source_id to a meaningful display name for the breakdown view
        let legacySourceId: string | null;
        if (activityType === 'meditation') {
          legacySourceId = null; // meditation has no source_id
        } else if (activityType === 'scripture') {
          legacySourceId = (log.note && log.note.length > 2 && log.note.length < 120) ? log.note : log.type;
        } else {
          // rosary: use note as danh hieu name if it looks like a Buddhist phrase
          const note = log.note ?? '';
          const looksLikePhrase = note.length > 5 && (
            note.toLowerCase().includes('nam mo') ||
            note.toLowerCase().includes('nam m\u00f4') ||
            note.toLowerCase().includes('\u00e1n ') ||
            note.toLowerCase().includes('om ') ||
            note.toLowerCase().includes('a di') ||
            note.toLowerCase().includes('ph\u1eadt') ||
            note.toLowerCase().includes('b\u1ed3') ||
            note.toLowerCase().includes('ch\u00fa')
          );
          legacySourceId = looksLikePhrase ? note.trim() : log.type;
        }

        statements.push(
          env.DB.prepare(`
            INSERT INTO practice_sessions (
              id, owner_id, client_session_id, activity_type, status,
              target_count, accepted_duration_seconds, accepted_count,
              source_kind, source_id, started_at, completed_at,
              verification_result, verification_reason, evidence_summary_json,
              idempotency_key, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, 'legacy_import', ?, ?, ?, 'accepted', 'legacy_import', ?, ?, ?, ?)
            ON CONFLICT(owner_id, client_session_id) DO NOTHING
          `).bind(
            crypto.randomUUID(),
            ownerId,
            clientSessionId,
            activityType,
            log.count,
            acceptedDurationSeconds,
            log.count,
            legacySourceId,
            startedAt,
            completedAt,
            evidenceSummary,
            clientSessionId,
            nowIso,
            nowIso
          )
        );
      }

      const chunkSize = 100;
      let inserted = 0;
      for (let i = 0; i < statements.length; i += chunkSize) {
        const chunk = statements.slice(i, i + chunkSize);
        const results = await env.DB.batch(chunk);
        for (const res of results) {
          inserted += Number(res.meta?.changes ?? 0);
        }
      }
      return inserted;
    },
  };
}
