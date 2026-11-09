import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import activitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import { createReadingActivityRepository } from '../../src/lib/server/repositories/reading-activity-repository.ts';
import { createPracticeSessionRepository } from '../../src/lib/server/repositories/practice-session-repository.ts';
import { createReadingActivityService } from '../../src/lib/server/services/reading-activity.ts';
import { createReadingActivityClient } from '../../src/lib/browser/reading-activity-client.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [
    { name: '0001-application-schema.sql', queries: splitMigration(applicationSchema) },
    { name: '0002-auth-and-session-schema.sql', queries: splitMigration(authSchema) },
    { name: '0026-member-status.sql', queries: splitMigration(memberStatusSchema) },
    { name: '0017-user-activity-foundations.sql', queries: splitMigration(activitySchema) },
  ]);
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM reading_annotations').run();
  await env.DB.prepare('DELETE FROM reading_progress').run();
  await env.DB.prepare('DELETE FROM sync_devices').run();
  await env.DB.prepare('DELETE FROM practice_sessions').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  const now = '2026-09-04T12:00:00.000Z';
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('owner-a', 'Owner A', 'user', ?, ?)
    `).bind(now, now),
    env.DB.prepare(`
      INSERT INTO app_users (id, display_name, role, created_at, updated_at)
      VALUES ('owner-b', 'Owner B', 'user', ?, ?)
    `).bind(now, now),
  ]);
});

describe('reading activity repository', () => {
  it('executes one four-statement progress save for concurrent client flushes', async () => {
    let sql = 0;
    let batches = 0;
    let requests = 0;
    const db = {
      prepare(statement) { sql += 1; return env.DB.prepare(statement); },
      batch(statements) { batches += 1; return env.DB.batch(statements); },
    };
    const service = createReadingActivityService({ env: { DB: db }, principal: { appUserId: 'owner-a' } });
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: key => values.delete(key),
    };
    let release;
    const ready = new Promise(resolve => { release = resolve; });
    const client = createReadingActivityClient(async (_path, init) => {
      requests += 1;
      await ready;
      return Response.json(await service.writeProgress(JSON.parse(String(init.body))));
    }, storage, { createId: () => 'budget-device' });
    client.setSession({ authenticated: true, csrfToken: 'fixture-csrf', user: { id: 'owner-a' } });
    client.enqueueProgress(progressWrite());
    const first = client.flush();
    const second = client.flush();
    release();
    const outcomes = await Promise.allSettled([first, second]);
    expect(sql).toBe(4);
    expect(outcomes.every(outcome => outcome.status === 'fulfilled')).toBe(true);
    expect(requests).toBe(1);
    expect(batches).toBe(1);
    expect(client.pending()).toEqual([]);
    expect(client.cachedProgress()).toMatchObject([{ revision: 1 }]);
  });

  it('enforces device sequence, revision and owner isolation without regressing progress', async () => {
    const repository = createReadingActivityRepository(env);
    const first = progressWrite({ baseRevision: 0, deviceSequence: 1, percent: 10 });

    await expect(repository.writeProgress('owner-a', first, now(1))).resolves.toBe(true);
    await expect(repository.writeProgress('owner-a', first, now(2))).resolves.toBe(false);
    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 0, deviceSequence: 2, percent: 20 }),
      now(3),
    )).resolves.toBe(false);

    const deviceAfterRejectedWrite = await env.DB.prepare(`
      SELECT high_water_sequence FROM sync_devices
      WHERE owner_id = 'owner-a' AND device_id = 'device-a'
    `).first();
    expect(deviceAfterRejectedWrite).toMatchObject({ high_water_sequence: 1 });

    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 1, deviceSequence: 2, percent: 20 }),
      now(4),
    )).resolves.toBe(true);
    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 2, deviceSequence: 1, percent: 99 }),
      now(5),
    )).resolves.toBe(false);

    await expect(repository.getProgress('owner-a', 'pdf', 'book-a')).resolves.toMatchObject({
      device_sequence: 2,
      percent: 20,
      revision: 2,
    });
    await expect(repository.getProgress('owner-b', 'pdf', 'book-a')).resolves.toBeNull();
  });

  it('soft-deletes progress with the same causal sequence guard', async () => {
    const repository = createReadingActivityRepository(env);
    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 0, deviceSequence: 1, percent: 40 }),
      now(1),
    )).resolves.toBe(true);

    await expect(repository.deleteProgress('owner-b', progressDelete(), now(2))).resolves.toBe(false);
    await expect(repository.deleteProgress('owner-a', progressDelete({ baseRevision: 2 }), now(3))).resolves.toBe(false);
    await expect(repository.deleteProgress('owner-a', progressDelete(), now(4))).resolves.toBe(true);
    await expect(repository.getProgress('owner-a', 'pdf', 'book-a')).resolves.toBeNull();
    await expect(repository.getProgressState('owner-a', 'pdf', 'book-a')).resolves.toMatchObject({
      deleted_at: now(4),
      epoch: 1,
      revision: 2,
    });

    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 2, deviceSequence: 2, epoch: 1, percent: 80 }),
      now(5),
    )).resolves.toBe(false);
    await expect(repository.writeProgress(
      'owner-a',
      progressWrite({ baseRevision: 2, deviceSequence: 3, epoch: 2, percent: 5 }),
      now(6),
    )).resolves.toBe(true);
  });

  it('deduplicates annotations, prevents cross-owner mutation and cascades account deletion', async () => {
    const repository = createReadingActivityRepository(env);
    const annotation = annotationWrite();

    await expect(repository.writeAnnotation('owner-a', annotation, now(1))).resolves.toBe(true);
    await expect(repository.writeAnnotation('owner-a', annotation, now(2))).resolves.toBe(false);
    await expect(repository.writeAnnotation('owner-b', { ...annotation, idempotencyKey: 'other-key' }, now(3)))
      .resolves.toBe(false);
    await expect(repository.deleteAnnotation('owner-b', annotation.id, now(4))).resolves.toBe(false);
    await expect(repository.listAnnotations('owner-b', 20)).resolves.toMatchObject({ results: [] });

    await env.DB.prepare("DELETE FROM app_users WHERE id = 'owner-a'").run();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM reading_annotations').first())
      .toMatchObject({ count: 0 });
  });

  it('filters annotations and uses optimistic concurrency for note/orphan updates', async () => {
    const repository = createReadingActivityRepository(env);
    await repository.writeAnnotation('owner-a', annotationWrite(), now(1));
    await repository.writeAnnotation('owner-a', {
      ...annotationWrite(),
      id: 'annotation-b',
      idempotencyKey: 'annotation-key-b',
      contentId: 'book-b',
    }, now(2));

    await expect(repository.listAnnotations('owner-a', 20, 'pdf', 'book-a')).resolves.toMatchObject({
      results: [expect.objectContaining({ id: 'annotation-a' })],
    });
    await expect(repository.updateAnnotation('owner-b', 'annotation-a', annotationPatch(now(1)), now(3)))
      .resolves.toBe(false);
    await expect(repository.updateAnnotation('owner-a', 'annotation-a', annotationPatch(now(0)), now(3)))
      .resolves.toBe(false);
    await expect(repository.updateAnnotation('owner-a', 'annotation-a', annotationPatch(now(1)), now(3)))
      .resolves.toBe(true);
    await expect(repository.getAnnotation('owner-a', 'annotation-a')).resolves.toMatchObject({
      anchor_status: 'orphaned',
      color: 'green',
      note: 'ghi chú mới',
      updated_at: now(3),
    });
    const firstPage = await repository.listAnnotations('owner-a', 1);
    expect(firstPage.results).toEqual([expect.objectContaining({ id: 'annotation-a', updated_at: now(3) })]);
    await expect(repository.listAnnotations('owner-a', 1, undefined, undefined, {
      updatedAt: now(3), id: 'annotation-a',
    })).resolves.toMatchObject({ results: [expect.objectContaining({ id: 'annotation-b' })] });
  });

  it('exposes an annotation tombstone only inside its owner scope', async () => {
    const repository = createReadingActivityRepository(env);
    await repository.writeAnnotation('owner-a', annotationWrite(), now(1));

    await expect(repository.deleteAnnotation('owner-a', 'annotation-a', now(2))).resolves.toBe(true);
    await expect(repository.getAnnotation('owner-a', 'annotation-a')).resolves.toBeNull();
    await expect(repository.getAnnotationState('owner-a', 'annotation-a')).resolves.toMatchObject({
      deleted_at: now(2),
      id: 'annotation-a',
      owner_id: 'owner-a',
    });
    await expect(repository.getAnnotationState('owner-b', 'annotation-a')).resolves.toBeNull();
  });
});

describe('automatic practice session repository', () => {
  it('is idempotent, owner-scoped and derives accepted reads from completed rows', async () => {
    const repository = createPracticeSessionRepository(env);
    const start = {
      activityType: 'meditation',
      clientSessionId: 'client-session-a',
      idempotencyKey: 'start-key-a',
      sourceId: null,
      sourceKind: null,
      startedAt: now(1),
      targetCount: null,
      targetDurationSeconds: 600,
    };

    await expect(repository.start('owner-a', 'session-a', start, now(1))).resolves.toBe(true);
    await expect(repository.start('owner-a', 'session-a', start, now(2))).resolves.toBe(false);
    await expect(repository.getByClientSession('owner-b', start.clientSessionId)).resolves.toBeNull();
    await expect(repository.complete('owner-b', start.clientSessionId, completion(), now(3))).resolves.toBe(false);
    await expect(repository.complete('owner-a', start.clientSessionId, completion(), now(4))).resolves.toBe(true);
    await expect(repository.complete('owner-a', start.clientSessionId, completion(), now(5))).resolves.toBe(false);
    await expect(repository.listAccepted('owner-a', now(0), 20)).resolves.toMatchObject({
      results: [expect.objectContaining({ id: 'session-a', accepted_duration_seconds: 540 })],
    });

    await env.DB.prepare("DELETE FROM app_users WHERE id = 'owner-a'").run();
    expect(await env.DB.prepare('SELECT COUNT(*) AS count FROM practice_sessions').first())
      .toMatchObject({ count: 0 });
  });
});

function progressWrite(overrides = {}) {
  return {
    baseRevision: 0,
    clientUpdatedAt: now(0),
    contentId: 'book-a',
    contentKind: 'pdf',
    contentVersion: 'version-1',
    deviceId: 'device-a',
    deviceSequence: 1,
    epoch: 1,
    percent: 0,
    position: { page: 1 },
    total: 10,
    ...overrides,
  };
}

function progressDelete(overrides = {}) {
  return {
    baseRevision: 1,
    contentId: 'book-a',
    contentKind: 'pdf',
    deviceId: 'device-a',
    deviceSequence: 2,
    epoch: 1,
    ...overrides,
  };
}

function annotationWrite() {
  return {
    anchorStatus: 'active',
    color: 'yellow',
    contentId: 'book-a',
    contentKind: 'pdf',
    contentVersion: 'version-1',
    contextAfter: 'sau',
    contextBefore: 'trước',
    id: 'annotation-a',
    idempotencyKey: 'annotation-key-a',
    locator: { page: 2, quoteIndex: 0 },
    note: 'ghi chú',
    quoteText: 'một câu trích dẫn',
  };
}

function annotationPatch(baseUpdatedAt) {
  return {
    anchorStatus: 'orphaned',
    baseUpdatedAt,
    color: 'green',
    contentVersion: 'version-2',
    locator: { page: 2, quoteIndex: 0 },
    note: 'ghi chú mới',
  };
}

function completion() {
  return {
    acceptedCount: 0,
    acceptedDurationSeconds: 540,
    completedAt: now(10),
    evidenceSummary: { activeSeconds: 540, targetSeconds: 600 },
    verificationReason: null,
    verificationResult: 'accepted',
  };
}

function splitMigration(sql) {
  return sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
    statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`);
}

function now(offsetMinutes) {
  return new Date(Date.parse('2026-09-04T12:00:00.000Z') + offsetMinutes * 60_000).toISOString();
}
