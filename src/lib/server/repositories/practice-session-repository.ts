import type {
  PracticeSessionCompletion,
  PracticeSessionStart,
} from '$lib/domain/practice/sessions';
import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';

export interface PracticeSessionRow extends D1ResultRow {
  id: string;
  owner_id: string;
  client_session_id: string;
  activity_type: string;
  status: string;
  target_duration_seconds: number | null;
  target_count: number | null;
  accepted_duration_seconds: number;
  accepted_count: number;
  source_kind: string | null;
  source_id: string | null;
  started_at: string;
  completed_at: string | null;
  verification_result: string | null;
  verification_reason: string | null;
  evidence_summary_json: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export function createPracticeSessionRepository(env: CloudflareEnvLike) {
  return {
    getByClientSession(ownerId: string, clientSessionId: string) {
      return env.DB.prepare(`
        SELECT * FROM practice_sessions
        WHERE owner_id = ? AND client_session_id = ?
        LIMIT 1
      `).bind(ownerId, clientSessionId).first<PracticeSessionRow>();
    },

    async start(ownerId: string, id: string, input: PracticeSessionStart, now: string): Promise<boolean> {
      const result = await env.DB.prepare(`
        INSERT INTO practice_sessions (
          id, owner_id, client_session_id, activity_type, status,
          target_duration_seconds, target_count, source_kind, source_id,
          started_at, evidence_summary_json, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, '{}', ?, ?, ?)
        ON CONFLICT DO NOTHING
      `).bind(
        id,
        ownerId,
        input.clientSessionId,
        input.activityType,
        input.targetDurationSeconds,
        input.targetCount,
        input.sourceKind,
        input.sourceId,
        input.startedAt,
        input.idempotencyKey,
        now,
        now,
      ).run();
      return Number(result.meta?.changes ?? 0) >= 1;
    },

    async complete(
      ownerId: string,
      clientSessionId: string,
      input: PracticeSessionCompletion,
      now: string,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE practice_sessions
        SET status = 'completed',
            accepted_duration_seconds = ?, accepted_count = ?, completed_at = ?,
            verification_result = ?, verification_reason = ?, evidence_summary_json = ?, updated_at = ?
        WHERE owner_id = ? AND client_session_id = ? AND status = 'active'
      `).bind(
        input.acceptedDurationSeconds,
        input.acceptedCount,
        input.completedAt,
        input.verificationResult,
        input.verificationReason,
        JSON.stringify(input.evidenceSummary),
        now,
        ownerId,
        clientSessionId,
      ).run();
      return Number(result.meta?.changes ?? 0) >= 1;
    },

    listAccepted(ownerId: string, fromIso: string, limit: number) {
      return env.DB.prepare(`
        SELECT * FROM practice_sessions
        WHERE owner_id = ? AND status = 'completed' AND verification_result = 'accepted'
          AND completed_at >= ?
        ORDER BY completed_at DESC, id DESC
        LIMIT ?
      `).bind(ownerId, fromIso, limit).all<PracticeSessionRow>();
    },

    listRecent(ownerId: string, fromIso: string, limit: number) {
      return env.DB.prepare(`
        SELECT * FROM practice_sessions
        WHERE owner_id = ? AND started_at >= ?
        ORDER BY started_at DESC, id DESC
        LIMIT ?
      `).bind(ownerId, fromIso, limit).all<PracticeSessionRow>();
    },

    totals(ownerId: string, fromIso: string) {
      return env.DB.prepare(`
        SELECT activity_type,
          COUNT(*) AS session_count,
          COALESCE(SUM(accepted_duration_seconds), 0) AS accepted_duration_seconds,
          COALESCE(SUM(accepted_count), 0) AS accepted_count
        FROM practice_sessions
        WHERE owner_id = ? AND status = 'completed' AND verification_result = 'accepted'
          AND completed_at >= ?
        GROUP BY activity_type
        ORDER BY activity_type
      `).bind(ownerId, fromIso).all<{
        activity_type: string;
        session_count: number;
        accepted_duration_seconds: number;
        accepted_count: number;
      }>();
    },
  };
}
