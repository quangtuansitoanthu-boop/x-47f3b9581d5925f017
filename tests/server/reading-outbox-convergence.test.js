import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';
import applicationSchema from '../../migrations/0001-application-schema.sql?raw';
import authSchema from '../../migrations/0002-auth-and-session-schema.sql?raw';
import memberStatusSchema from '../../migrations/0026-member-status.sql?raw';
import activitySchema from '../../migrations/0017-user-activity-foundations.sql?raw';
import { createReadingActivityClient } from '../../src/lib/browser/reading-activity-client.ts';
import { createReadingActivityService } from '../../src/lib/server/services/reading-activity.ts';
import { ServerInputError } from '../../src/lib/server/errors.ts';

beforeAll(async () => {
  await applyD1Migrations(env.DB, [applicationSchema, authSchema, activitySchema].map((sql, index) => ({
    name: `reading-fixture-${index}`,
    queries: sql.trim().split(/;\s*\n\s*\n/gu).map((statement) =>
      statement.trim().endsWith(';') ? statement.trim() : `${statement.trim()};`),
  })));
});

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM reading_annotations').run();
  await env.DB.prepare('DELETE FROM reading_progress').run();
  await env.DB.prepare('DELETE FROM sync_devices').run();
  await env.DB.prepare('DELETE FROM app_users').run();
  await env.DB.prepare(`INSERT INTO app_users (id, display_name, role, created_at, updated_at)
    VALUES ('reading-owner', 'Reading fixture', 'user', '2026-09-05', '2026-09-05')`).run();
});

const session = { authenticated: true, csrfToken: 'fixture-csrf', user: { id: 'reading-owner' } };
const progress = {
  baseRevision: 0, clientUpdatedAt: '2026-09-05T06:00:00.000Z', contentId: 'reading-book',
  contentKind: 'pdf', contentVersion: 'v1', epoch: 1, percent: 20, position: { page: 2 }, total: 10,
};
const annotation = {
  id: 'reading-quote', idempotencyKey: 'reading-quote', contentId: 'reading-book', contentKind: 'pdf',
  locator: { page: 2 }, quoteText: 'Reading fixture', contextBefore: '', contextAfter: '',
  color: 'yellow', note: '', contentVersion: 'v1', anchorStatus: 'active',
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

it('drains a failed-before-commit predecessor after another record advances the device sequence', async () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const service = createReadingActivityService({ env, principal: { appUserId: session.user.id } });
  let fail = true;
  const fetcher = async (_path, init) => {
    if (fail) { fail = false; throw new TypeError('connection lost before commit'); }
    const input = JSON.parse(init.body);
    try {
      return Response.json(await (init.method === 'PUT' ? service.writeProgress(input) : service.deleteProgress(input)));
    } catch (cause) {
      if (!(cause instanceof ServerInputError)) throw cause;
      return Response.json({ error: { details: cause.details } }, { status: cause.status });
    }
  };
  const client = createReadingActivityClient(fetcher, storage);
  client.setSession(session);
  client.enqueueProgress(progress);
  await expect(client.flush()).rejects.toThrow('before commit');
  client.enqueueProgress({ ...progress, contentId: 'another-book' });
  client.enqueueProgressDelete({ ...progress, baseRevision: 1 });
  for (let attempt = 0; attempt < 3 && client.pending().length; attempt += 1) await client.flush();
  expect(client.pending()).toEqual([]);
  expect((await service.getProgress('pdf', progress.contentId)).progress).toBeNull();
  expect((await service.getProgress('pdf', 'another-book')).progress).toMatchObject({ percent: 20 });
  expect(client.cachedProgress().map((row) => row.contentId)).toEqual(['another-book']);
});

describe.each(['progress', 'annotation'])('durable %s outbox deletion', (kind) => {
  it.each(['delayed-response', 'delayed-commit', 'lost-response', 'lost-update-response', 'deleted-remotely'])('converges through real D1 after %s across shared clients', async (mode) => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
    let timestamp = Date.parse('2026-09-05T06:00:00Z');
    const service = createReadingActivityService({ env, principal: { appUserId: session.user.id } }, {
      now: () => new Date(timestamp += 1_000),
    });
    let initial;
    if (mode === 'lost-update-response') {
      initial = kind === 'progress'
        ? await service.writeProgress({ ...progress, deviceId: 'seed-device', deviceSequence: 1 })
        : await service.createAnnotation(annotation);
    }
    const started = deferred();
    const release = deferred();
    const methods = [];
    let holdFirst = true;
    const fetcher = async (path, init) => {
      if (!init.method) return Response.json(await service.getAnnotation('reading-quote'));
      methods.push(init.method);
      expect(init.headers['x-csrf-token']).toBe(session.csrfToken);
      const first = holdFirst;
      holdFirst = false;
      const execute = async () => {
        try {
          const input = init.body ? JSON.parse(init.body) : null;
          const result = kind === 'progress'
            ? await (init.method === 'PUT' ? service.writeProgress(input) : service.deleteProgress(input))
            : await (init.method === 'POST' ? service.createAnnotation(input)
              : init.method === 'PATCH' ? service.updateAnnotation('reading-quote', input)
                : service.deleteAnnotation('reading-quote'));
          return Response.json(result);
        } catch (cause) {
          if (!(cause instanceof ServerInputError)) throw cause;
          return Response.json({ error: { details: cause.details, code: cause.code } }, { status: cause.status });
        }
      };
      if (!first) return execute();
      if (mode === 'delayed-commit') {
        started.resolve();
        await release.promise;
        return execute();
      }
      const response = await execute();
      started.resolve();
      await release.promise;
      if (mode.startsWith('lost-')) throw new TypeError('connection lost after commit');
      return response;
    };
    const first = createReadingActivityClient(fetcher, storage);
    first.setSession(session);
    if (kind === 'progress') first.enqueueProgress({ ...progress, baseRevision: initial?.progress?.revision ?? 0 });
    else if (initial) first.enqueueAnnotationUpdate(annotation.id, {
      ...annotation, note: 'updated note', baseUpdatedAt: initial.annotation.updatedAt,
    });
    else first.enqueueAnnotationCreate(annotation);
    const sending = first.flush().catch((cause) => cause);
    await started.promise;
    if (mode.startsWith('lost-')) { release.resolve(); await sending; }
    if (mode === 'deleted-remotely') {
      if (kind === 'progress') await service.deleteProgress({ ...progress, baseRevision: 1, deviceId: 'remote', deviceSequence: 1 });
      else await service.deleteAnnotation(annotation.id);
    }

    // A fresh component/tab must see that the original create may have reached the server.
    const second = createReadingActivityClient(fetcher, storage);
    second.setSession(session);
    if (kind === 'progress') second.enqueueProgressDelete({ ...progress, baseRevision: 1 });
    else second.enqueueAnnotationDelete(annotation.id);
    expect(second.pending()).toHaveLength(1);
    expect(second.pending()[0].kind).toBe(`${kind}-delete`);
    expect(second.cachedProgress()).toEqual([]);
    expect(second.cachedAnnotations()).toEqual([]);
    // Flush deletion before the first request completes. Replaying the dependency
    // establishes ordering; D1's sequence/idempotency guards reject late resurrection.
    for (let attempt = 0; attempt < 3 && second.pending().length; attempt += 1) await second.flush();
    release.resolve();
    await sending;
    for (let attempt = 0; attempt < 3 && second.pending().length; attempt += 1) await second.flush();
    expect(second.pending()).toEqual([]);
    expect(second.cachedProgress()).toEqual([]);
    expect(second.cachedAnnotations()).toEqual([]);
    expect(methods).toContain('DELETE');
    const state = kind === 'progress'
      ? await service.getProgress('pdf', progress.contentId)
      : await service.getAnnotation(annotation.id);
    expect(state[kind]).toBeNull();
    expect(state.tombstone).not.toBeNull();
  });
});
