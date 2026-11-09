import type {
  AutomaticPracticeType,
  PracticeSessionFinishRequest,
  PracticeSessionStart,
} from '$lib/domain/practice/sessions';
import type { createPracticeSessionOutbox } from './practice-session-outbox';
import { createBrowserId } from './random-id';

type PracticeSessionOutbox = ReturnType<typeof createPracticeSessionOutbox>;

export interface PracticeEvidenceHandle {
  principalId?: string;
  activityType: AutomaticPracticeType;
  clientSessionId: string;
  startedAt: string;
  startedAtMs: number;
  targetCount: number | null;
  targetDurationSeconds: number | null;
}

export interface PracticeEvidenceStartInput {
  activityType: AutomaticPracticeType;
  sourceId?: string | null;
  sourceKind?: string | null;
  targetCount?: number | null;
  targetDurationSeconds?: number | null;
}

interface PracticeEvidenceDependencies {
  createId?: () => string;
  now?: () => Date;
  principalId?: () => string;
}

export function createPracticeEvidenceController(
  outbox: PracticeSessionOutbox,
  dependencies: PracticeEvidenceDependencies = {},
) {
  const createId = dependencies.createId ?? createBrowserId;
  const now = dependencies.now ?? (() => new Date());
  const completed = new Set<string>();
  let flushChain: Promise<unknown> = Promise.resolve();

  const flush = (principalId?: string) => {
    flushChain = flushChain.then(() => principalId && outbox.getStatus?.().principalId !== principalId ? 0 : outbox.flush()).catch(() => undefined);
  };

  return {
    start(input: PracticeEvidenceStartInput, observedStart?: Date): PracticeEvidenceHandle {
      const current = now();
      // Only native rosary segments need a trusted observed boundary when JS
      // resumes after midnight. Other tools retain their existing start clock.
      if (observedStart !== undefined && (input.activityType !== 'rosary'
        || !(observedStart instanceof Date) || !Number.isFinite(observedStart.getTime())
        || observedStart.getTime() > current.getTime())) throw new Error('invalid_observed_practice_start');
      const startedAt = observedStart ?? current;
      const clientSessionId = `practice:${input.activityType}:${createId()}`;
      const principalId = dependencies.principalId?.() ?? outbox.getStatus?.().principalId;
      const start: PracticeSessionStart = {
        activityType: input.activityType,
        clientSessionId,
        idempotencyKey: clientSessionId,
        sourceId: input.sourceId ?? null,
        sourceKind: input.sourceKind ?? null,
        startedAt: startedAt.toISOString(),
        targetCount: input.targetCount ?? null,
        targetDurationSeconds: input.targetDurationSeconds ?? null,
      };
      outbox.enqueueStart(start);
      flush(principalId);
      return {
        ...(principalId ? { principalId } : {}),
        activityType: input.activityType,
        clientSessionId,
        startedAt: start.startedAt,
        startedAtMs: startedAt.getTime(),
        targetCount: start.targetCount,
        targetDurationSeconds: start.targetDurationSeconds,
      };
    },

    finish(handle: PracticeEvidenceHandle | null, evidenceSummary: Record<string, unknown>): boolean {
      if (!handle || completed.has(handle.clientSessionId)) return false;
      const finish: PracticeSessionFinishRequest = {
        completedAt: now().toISOString(),
        evidenceSummary: { ...evidenceSummary },
      };
      const principalId = handle.principalId ?? dependencies.principalId?.();
      if (principalId) outbox.enqueueCompletion(handle.clientSessionId, finish, principalId);
      else outbox.enqueueCompletion(handle.clientSessionId, finish);
      completed.add(handle.clientSessionId);
      flush(principalId);
      return true;
    },

    hasFinished(handle: PracticeEvidenceHandle | null): boolean {
      return Boolean(handle && completed.has(handle.clientSessionId));
    },
  };
}
