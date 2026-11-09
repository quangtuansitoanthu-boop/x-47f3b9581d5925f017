import {
  normalizePracticeSessionFinishRequest,
  normalizePracticeSessionStart,
  PRACTICE_RECEIPT_TOLERANCE_SECONDS,
  verifyPracticeSession,
  type PracticeSessionStart,
} from '../../domain/practice/sessions';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import {
  createPracticeSessionRepository,
  type PracticeSessionRow,
} from '../repositories/practice-session-repository';
import { createPracticeCommunityRepository } from '../repositories/practice-community-repository';

type Repository = ReturnType<typeof createPracticeSessionRepository>;

export function createPracticeSessionsService(
  context: CloudflareRequestContext,
  dependencies: {
    repository?: Repository;
    contributeAcceptedSession?: (sessionId: string, ownerId: string, now: string) => Promise<number>;
    createId?: () => string;
    now?: () => Date;
  } = {},
) {
  const { env: bindings } = context;
  const repository = dependencies.repository ?? createPracticeSessionRepository(bindings);
  const createId = dependencies.createId ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? (() => new Date());
  const contributeAcceptedSession = dependencies.contributeAcceptedSession
    ?? createPracticeCommunityRepository(bindings).contributeAcceptedSession;

  const ownerId = () => {
    const value = context.principal?.appUserId;
    if (!value) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
    return value;
  };
  const ensureWritesEnabled = () => {
    if (bindings.AUTOMATIC_PRACTICE_ENABLED === 'false') {
      throw new ServerInputError(503, 'automatic_practice_disabled', 'Ghi nhận tu tập tự động đang tạm dừng.');
    }
  };

  return {
    async start(rawInput: unknown) {
      ensureWritesEnabled();
      const receivedAt = now();
      const input = normalizeStart(rawInput, receivedAt);
      const owner = ownerId();
      const created = await repository.start(owner, createId(), input, receivedAt.toISOString());
      const row = await repository.getByClientSession(owner, input.clientSessionId);
      if (!row) throw new ServerInputError(409, 'practice_session_conflict', 'Không thể tạo phiên tu tập.');
      return { created, session: serialize(row) };
    },

    async complete(clientSessionId: string, rawInput: unknown) {
      ensureWritesEnabled();
      const owner = ownerId();
      const normalizedId = normalizeClientSessionId(clientSessionId);
      const receivedAt = now();
      const current = await repository.getByClientSession(owner, normalizedId);
      if (!current) throw new ServerInputError(404, 'practice_session_not_found', 'Không tìm thấy phiên tu tập.');
      if (current.status !== 'active') {
        const contributionsAdded = current.status === 'completed' && current.verification_result === 'accepted'
          ? await contributeAcceptedSession(current.id, owner, receivedAt.toISOString())
          : 0;
        return { completed: false, contributionsAdded, session: serialize(current) };
      }
      let finish;
      try {
        finish = normalizePracticeSessionFinishRequest(rawInput);
      } catch (cause) {
        throw domainInputError(cause);
      }
      const completedAt = Date.parse(finish.completedAt);
      if (completedAt < Date.parse(current.started_at)
        || completedAt > receivedAt.getTime() + PRACTICE_RECEIPT_TOLERANCE_SECONDS * 1_000) {
        throw new ServerInputError(400, 'invalid_completed_at', 'Thời điểm hoàn tất không hợp lệ.');
      }
      const createdAt = Date.parse(current.created_at);
      const serverElapsedMilliseconds = receivedAt.getTime() - createdAt;
      const receiptToleranceMilliseconds = PRACTICE_RECEIPT_TOLERANCE_SECONDS * 1_000;
      const serverReceiptPlausible = Number.isFinite(createdAt)
        && serverElapsedMilliseconds >= -receiptToleranceMilliseconds;
      const fullyOfflineReplay = serverReceiptPlausible
        && completedAt < createdAt - receiptToleranceMilliseconds;
      const clientElapsedMilliseconds = completedAt - Date.parse(current.started_at);
      const serverElapsedSeconds = fullyOfflineReplay && Number.isFinite(clientElapsedMilliseconds)
        ? Math.floor(Math.max(0, clientElapsedMilliseconds) / 1_000)
        : serverReceiptPlausible
          ? Math.floor(Math.max(0, serverElapsedMilliseconds) / 1_000)
          : -1;
      const completion = verifyPracticeSession(startFromRow(current), finish, {
        receiptMode: fullyOfflineReplay ? 'offline_replay' : 'live',
        serverElapsedSeconds,
      });
      const completed = await repository.complete(owner, normalizedId, completion, receivedAt.toISOString());
      const row = await repository.getByClientSession(owner, normalizedId);
      if (!row) throw new ServerInputError(409, 'practice_session_conflict', 'Không thể hoàn tất phiên tu tập.');
      const contributionsAdded = completed && row.verification_result === 'accepted'
        ? await contributeAcceptedSession(row.id, owner, receivedAt.toISOString())
        : 0;
      return { completed, contributionsAdded, session: serialize(row) };
    },

    async list(from: string | null, limitValue: string | null) {
      const rows = await repository.listRecent(ownerId(), normalizeFrom(from), boundedLimit(limitValue));
      return { sessions: (rows.results ?? []).map(serialize) };
    },

    async summary(from: string | null) {
      const fromIso = normalizeFrom(from);
      const totals = await repository.totals(ownerId(), fromIso);
      return { from: fromIso, totals: totals.results ?? [] };
    },
  };
}

function normalizeStart(rawInput: unknown, now: Date): PracticeSessionStart {
  let input: PracticeSessionStart;
  try {
    input = normalizePracticeSessionStart(rawInput);
  } catch (cause) {
    throw domainInputError(cause);
  }
  const startedAt = Date.parse(input.startedAt);
  if (!Number.isFinite(startedAt)) throw new ServerInputError(400, 'invalid_started_at', 'Thời điểm bắt đầu không hợp lệ.');
  if (startedAt > now.getTime() + PRACTICE_RECEIPT_TOLERANCE_SECONDS * 1_000) {
    throw new ServerInputError(400, 'future_started_at', 'Thời điểm bắt đầu không được ở tương lai.');
  }
  return input;
}

function normalizeClientSessionId(value: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(normalized)) {
    throw new ServerInputError(400, 'invalid_client_session_id', 'Mã phiên không hợp lệ.');
  }
  return normalized;
}

function normalizeFrom(value: string | null): string {
  if (!value) return '1970-01-01T00:00:00.000Z';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ServerInputError(400, 'invalid_from', 'Mốc thời gian không hợp lệ.');
  return new Date(parsed).toISOString();
}

function boundedLimit(value: string | null): number {
  const parsed = Number(value ?? 50);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200) {
    throw new ServerInputError(400, 'invalid_limit', 'Giới hạn phải từ 1 đến 200.');
  }
  return parsed;
}

function startFromRow(row: PracticeSessionRow): PracticeSessionStart {
  return {
    activityType: row.activity_type as PracticeSessionStart['activityType'],
    clientSessionId: row.client_session_id,
    idempotencyKey: row.idempotency_key,
    sourceId: row.source_id,
    sourceKind: row.source_kind,
    startedAt: row.started_at,
    targetCount: row.target_count,
    targetDurationSeconds: row.target_duration_seconds,
  };
}

function serialize(row: PracticeSessionRow) {
  return {
    id: row.id,
    clientSessionId: row.client_session_id,
    activityType: row.activity_type,
    status: row.status,
    targetDurationSeconds: row.target_duration_seconds,
    targetCount: row.target_count,
    acceptedDurationSeconds: row.accepted_duration_seconds,
    acceptedCount: row.accepted_count,
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    verificationResult: row.verification_result,
    verificationReason: row.verification_reason,
    evidenceSummary: parseEvidence(row.evidence_summary_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseEvidence(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function domainInputError(cause: unknown): ServerInputError {
  const code = cause instanceof Error ? cause.message : 'invalid_practice_session';
  return new ServerInputError(400, code, 'Dữ liệu phiên tu tập không hợp lệ.');
}
