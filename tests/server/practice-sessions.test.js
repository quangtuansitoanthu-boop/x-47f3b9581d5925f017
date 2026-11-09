import { describe, expect, it, vi } from 'vitest';

import { createPracticeSessionsService } from '../../src/lib/server/services/practice-sessions.ts';
import { createPracticeSessionOutbox } from '../../src/lib/browser/practice-session-outbox.ts';

describe('practice session service verification', () => {
  it('preserves background evidence through completion and replay with the existing repository budget', async () => {
    const now = new Date('2026-09-04T10:20:00.000Z');
    const harness = serviceHarness(practiceRow('meditation', {
      created_at: '2026-09-04T10:05:00.000Z', started_at: '2026-09-04T10:05:00.000Z',
      target_duration_seconds: 900,
    }), now);
    const reads = vi.spyOn(harness.repository, 'getByClientSession');
    const writes = vi.spyOn(harness.repository, 'complete');
    const finish = { completedAt: now.toISOString(), evidenceSummary: {
      activeSeconds: 0, hiddenSeconds: 900, backgroundActiveSeconds: 900, clientElapsedSeconds: 900,
    } };
    await expect(harness.service.complete('meditation-session', finish)).resolves.toMatchObject({
      completed: true, contributionsAdded: 1,
      session: { acceptedDurationSeconds: 900, verificationResult: 'accepted', evidenceSummary: { backgroundActiveSeconds: 900 } },
    });
    await expect(harness.service.complete('meditation-session', finish)).resolves.toMatchObject({
      completed: false, contributionsAdded: 0,
    });
    expect(reads).toHaveBeenCalledTimes(3);
    expect(writes).toHaveBeenCalledOnce();
  });
  it('rejects an inflated meditation completed immediately after the server received its start', async () => {
    const serverNow = new Date('2026-09-04T10:15:00.000Z');
    const harness = serviceHarness(practiceRow('meditation', {
      created_at: serverNow.toISOString(),
      started_at: '2026-09-04T10:00:00.000Z',
      target_duration_seconds: 900,
    }), serverNow);

    await expect(harness.service.complete('meditation-session', {
      completedAt: serverNow.toISOString(),
      evidenceSummary: {
        activeSeconds: 720,
        clientElapsedSeconds: 900,
        hiddenSeconds: 180,
      },
    })).resolves.toMatchObject({
      completed: true,
      contributionsAdded: 0,
      session: {
        acceptedDurationSeconds: 0,
        verificationReason: 'server_elapsed_mismatch',
        verificationResult: 'implausible',
      },
    });
    expect(harness.contributeAcceptedSession).not.toHaveBeenCalled();
  });

  it.each([
    ['rosary', { acceptedCount: 18, clientElapsedSeconds: 5, minimumIntervalMs: 400 }, 'rosary_interaction_rate'],
    ['scripture', { activeSeconds: 300, clientElapsedSeconds: 300, scrollDepthPercent: 100 }, 'server_elapsed_mismatch'],
    ['model_chant', { clientElapsedSeconds: 120, playedSeconds: 120, sequential: true, skippedSeconds: 0 }, 'server_elapsed_mismatch'],
    ['dharma_talk', { clientElapsedSeconds: 90, playedSeconds: 90 }, 'server_elapsed_mismatch'],
  ])('rejects an immediate inflated %s completion', async (activityType, evidenceSummary, reason) => {
    const serverNow = new Date('2026-09-04T10:15:00.000Z');
    const harness = serviceHarness(practiceRow(activityType, { created_at: serverNow.toISOString() }), serverNow);

    await expect(harness.service.complete(`${activityType}-session`, {
      completedAt: serverNow.toISOString(),
      evidenceSummary,
    })).resolves.toMatchObject({
      completed: true,
      contributionsAdded: 0,
      session: {
        acceptedCount: 0,
        acceptedDurationSeconds: 0,
        verificationReason: reason,
        verificationResult: 'implausible',
      },
    });
  });

  it.each([
    ['meditation', 600, { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 }, { acceptedDurationSeconds: 480 }],
    ['rosary', 18, { acceptedCount: 18, clientElapsedSeconds: 18, minimumIntervalMs: 400 }, { acceptedCount: 18 }],
    ['scripture', 320, { activeSeconds: 300, clientElapsedSeconds: 320, scrollDepthPercent: 100 }, { acceptedDurationSeconds: 300 }],
    ['model_chant', 120, { clientElapsedSeconds: 120, playedSeconds: 120, sequential: true, skippedSeconds: 0 }, { acceptedDurationSeconds: 120 }],
    ['dharma_talk', 90, { clientElapsedSeconds: 90, playedSeconds: 90 }, { acceptedDurationSeconds: 90 }],
  ])('accepts a valid %s completion bounded by persisted server receipt time', async (
    activityType,
    elapsedSeconds,
    evidenceSummary,
    accepted,
  ) => {
    const receivedAt = new Date('2026-09-04T10:20:00.000Z');
    const createdAt = new Date(receivedAt.getTime() - elapsedSeconds * 1_000).toISOString();
    const harness = serviceHarness(practiceRow(activityType, { created_at: createdAt }), receivedAt);

    await expect(harness.service.complete(`${activityType}-session`, {
      completedAt: receivedAt.toISOString(),
      evidenceSummary,
    })).resolves.toMatchObject({
      completed: true,
      contributionsAdded: 1,
      session: { ...accepted, verificationResult: 'accepted' },
    });
  });

  it('accepts a delayed completion once and never double-contributes its replay', async () => {
    const receivedAt = new Date('2026-09-04T10:03:00.000Z');
    const harness = serviceHarness(practiceRow('dharma_talk', {
      created_at: '2026-09-04T10:00:00.000Z',
      started_at: '2026-09-04T10:00:00.000Z',
    }), receivedAt);
    const finish = {
      completedAt: '2026-09-04T10:01:30.000Z',
      evidenceSummary: { clientElapsedSeconds: 90, playedSeconds: 90 },
    };

    await expect(harness.service.complete('dharma_talk-session', finish)).resolves.toMatchObject({
      completed: true,
      contributionsAdded: 1,
      session: { acceptedDurationSeconds: 90, verificationResult: 'accepted' },
    });
    await expect(harness.service.complete('dharma_talk-session', finish)).resolves.toMatchObject({
      completed: false,
      session: { acceptedDurationSeconds: 90, verificationResult: 'accepted' },
    });
    expect(harness.contributeAcceptedSession).toHaveBeenCalledTimes(2);
  });

  it('losslessly replays a fully offline start and completion with an auditable bounded receipt mode', async () => {
    const receiptTimes = [
      new Date('2026-09-04T10:20:00.000Z'),
      new Date('2026-09-04T10:20:00.100Z'),
    ];
    const harness = serviceHarness(null, () => receiptTimes.shift() ?? new Date('2026-09-04T10:20:01.000Z'));
    const fetcher = vi.fn(async (input, init) => {
      const path = String(input);
      const body = JSON.parse(String(init?.body || '{}'));
      const payload = path.endsWith('/complete')
        ? await harness.service.complete('offline-meditation', body)
        : await harness.service.start(body);
      return Response.json(payload, { status: path.endsWith('/complete') ? 200 : 201 });
    });
    const outbox = createPracticeSessionOutbox(fetcher, memoryStorage());
    outbox.setSession({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'owner-a' } });
    outbox.enqueueStart({
      activityType: 'meditation', clientSessionId: 'offline-meditation',
      idempotencyKey: 'offline-meditation-start', sourceId: null, sourceKind: 'guided_meditation',
      startedAt: '2026-09-04T10:00:00.000Z', targetCount: null, targetDurationSeconds: 600,
    });
    outbox.enqueueCompletion('offline-meditation', {
      completedAt: '2026-09-04T10:10:00.000Z',
      evidenceSummary: { activeSeconds: 480, clientElapsedSeconds: 600, hiddenSeconds: 120 },
    });

    await expect(outbox.flush()).resolves.toBe(2);
    expect(outbox.pending()).toEqual([]);
    expect(harness.currentRow()).toMatchObject({
      accepted_duration_seconds: 480,
      status: 'completed',
      verification_result: 'accepted',
    });
    expect(JSON.parse(harness.currentRow().evidence_summary_json)).toMatchObject({ receiptMode: 'offline_replay' });
  });

  it('retries the idempotent campaign contribution after completion committed before a failure', async () => {
    const receivedAt = new Date('2026-09-04T10:03:00.000Z');
    let contributionAttempt = 0;
    const harness = serviceHarness(practiceRow('dharma_talk', {
      created_at: '2026-09-04T10:00:00.000Z',
      started_at: '2026-09-04T10:00:00.000Z',
    }), receivedAt, async () => {
      contributionAttempt += 1;
      if (contributionAttempt === 1) throw new Error('temporary_campaign_failure');
      return 1;
    });
    const finish = {
      completedAt: '2026-09-04T10:01:30.000Z',
      evidenceSummary: { clientElapsedSeconds: 90, playedSeconds: 90 },
    };

    await expect(harness.service.complete('dharma_talk-session', finish))
      .rejects.toThrow('temporary_campaign_failure');
    await expect(harness.service.complete('dharma_talk-session', finish)).resolves.toMatchObject({
      completed: false,
      contributionsAdded: 1,
      session: { acceptedDurationSeconds: 90, verificationResult: 'accepted' },
    });
    expect(harness.contributeAcceptedSession).toHaveBeenCalledTimes(2);
  });

  it('allows five seconds of client clock skew and rejects larger future timestamps', async () => {
    const serverNow = new Date('2026-09-04T10:00:00.000Z');
    const harness = serviceHarness(null, serverNow);
    const start = {
      activityType: 'model_chant',
      clientSessionId: 'model-skew',
      idempotencyKey: 'model-skew',
      sourceId: 'article-a',
      sourceKind: 'practice_article_speech',
      targetDurationSeconds: 1,
    };

    await expect(harness.service.start({
      ...start,
      startedAt: '2026-09-04T10:00:05.000Z',
    })).resolves.toMatchObject({ created: true });
    await expect(harness.service.complete('model-skew', {
      completedAt: '2026-09-04T10:00:05.000Z',
      evidenceSummary: { clientElapsedSeconds: 1, playedSeconds: 1, sequential: true, skippedSeconds: 0 },
    })).resolves.toMatchObject({ session: { verificationResult: 'accepted' } });

    const futureStart = serviceHarness(null, serverNow);
    await expect(futureStart.service.start({
      ...start,
      clientSessionId: 'model-future',
      idempotencyKey: 'model-future',
      startedAt: '2026-09-04T10:00:06.000Z',
    })).rejects.toMatchObject({ code: 'future_started_at', status: 400 });

    const futureCompletion = serviceHarness(practiceRow('model_chant', {
      client_session_id: 'model-future-completion',
      created_at: serverNow.toISOString(),
      idempotency_key: 'model-future-completion',
    }), serverNow);
    await expect(futureCompletion.service.complete('model-future-completion', {
      completedAt: '2026-09-04T10:00:06.000Z',
      evidenceSummary: { clientElapsedSeconds: 1, playedSeconds: 1, sequential: true, skippedSeconds: 0 },
    })).rejects.toMatchObject({ code: 'invalid_completed_at', status: 400 });
  });

  it('fails closed when the persisted server start receipt is beyond clock-skew tolerance', async () => {
    const serverNow = new Date('2026-09-04T10:00:00.000Z');
    const harness = serviceHarness(practiceRow('model_chant', {
      created_at: '2026-09-04T10:00:06.000Z',
      started_at: '2026-09-04T09:59:00.000Z',
    }), serverNow);

    await expect(harness.service.complete('model_chant-session', {
      completedAt: serverNow.toISOString(),
      evidenceSummary: { clientElapsedSeconds: 1, playedSeconds: 1, sequential: true, skippedSeconds: 0 },
    })).resolves.toMatchObject({
      contributionsAdded: 0,
      session: {
        acceptedDurationSeconds: 0,
        verificationReason: 'invalid_server_receipt_window',
        verificationResult: 'implausible',
      },
    });
  });
});

function context() {
  return {
    env: { AUTOMATIC_PRACTICE_ENABLED: 'true' },
    principal: { appUserId: 'owner-a' },
    requestId: 'request-a',
  };
}

function practiceRow(activityType, overrides = {}) {
  const activity = {
    dharma_talk: {
      source_id: 'album-a:0', source_kind: 'dharma_talk', target_count: null, target_duration_seconds: 180,
    },
    meditation: {
      source_id: null, source_kind: 'guided_meditation', target_count: null, target_duration_seconds: 600,
    },
    model_chant: {
      source_id: 'article-a', source_kind: 'practice_article_speech', target_count: null, target_duration_seconds: 120,
    },
    rosary: {
      source_id: 'Nam mô A Di Đà Phật', source_kind: 'guided_rosary', target_count: 18, target_duration_seconds: null,
    },
    scripture: {
      source_id: 'article-a', source_kind: 'practice_article', target_count: null, target_duration_seconds: 300,
    },
  }[activityType];
  return {
    accepted_count: 0,
    accepted_duration_seconds: 0,
    activity_type: activityType,
    client_session_id: `${activityType}-session`,
    completed_at: null,
    created_at: '2026-09-04T10:15:00.000Z',
    evidence_summary_json: '{}',
    id: 'server-session',
    idempotency_key: `${activityType}-session`,
    owner_id: 'owner-a',
    started_at: '2026-09-04T10:00:00.000Z',
    status: 'active',
    updated_at: '2026-09-04T10:15:00.000Z',
    verification_reason: null,
    verification_result: null,
    ...activity,
    ...overrides,
  };
}

function serviceHarness(initialRow, serverNow, contribute = null) {
  let row = initialRow;
  const contributedSessions = new Set();
  const contributeAcceptedSession = vi.fn(contribute ?? (async (sessionId) => {
    if (contributedSessions.has(sessionId)) return 0;
    contributedSessions.add(sessionId);
    return 1;
  }));
  const repository = {
    async complete(_ownerId, _clientSessionId, completion, updatedAt) {
      if (!row || row.status !== 'active') return false;
      row = {
        ...row,
        accepted_count: completion.acceptedCount,
        accepted_duration_seconds: completion.acceptedDurationSeconds,
        completed_at: completion.completedAt,
        evidence_summary_json: JSON.stringify(completion.evidenceSummary),
        status: 'completed',
        updated_at: updatedAt,
        verification_reason: completion.verificationReason,
        verification_result: completion.verificationResult,
      };
      return true;
    },
    async getByClientSession(_ownerId, clientSessionId) {
      return row?.client_session_id === clientSessionId ? row : null;
    },
    async start(ownerId, id, input, now) {
      if (row) return false;
      row = {
        ...practiceRow(input.activityType),
        activity_type: input.activityType,
        client_session_id: input.clientSessionId,
        created_at: now,
        id,
        idempotency_key: input.idempotencyKey,
        owner_id: ownerId,
        source_id: input.sourceId,
        source_kind: input.sourceKind,
        started_at: input.startedAt,
        target_count: input.targetCount,
        target_duration_seconds: input.targetDurationSeconds,
        updated_at: now,
      };
      return true;
    },
  };
  return {
    contributeAcceptedSession,
    repository,
    service: createPracticeSessionsService(context(), {
      contributeAcceptedSession,
      createId: () => 'server-session',
      now: typeof serverNow === 'function' ? serverNow : () => serverNow,
      repository,
    }),
    currentRow: () => row,
  };
}

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}
