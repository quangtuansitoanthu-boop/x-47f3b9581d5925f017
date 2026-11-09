import { describe, expect, it, vi } from 'vitest';

import { createPracticeSyncClient } from '../../../src/lib/browser/practice-storage';
import { createPrincipalStorage } from '../../../src/lib/browser/principal-storage';
import { LEGACY_LOCAL_STORAGE_KEYS, type StorageLike } from '../../../src/lib/browser/storage-contract';

class MemoryStorage implements StorageLike {
  #items = new Map<string, string>();
  get length() { return this.#items.size; }
  getItem(key: string) { return this.#items.get(key) ?? null; }
  key(index: number) { return [...this.#items.keys()][index] ?? null; }
  removeItem(key: string) { this.#items.delete(key); }
  setItem(key: string, value: string) { this.#items.set(key, value); }
}

describe('practice sync client transport contract', () => {
  it('coalesces tokenless writes and sends the latest local state once the same principal receives a live nonce', async () => {
    const storage = new MemoryStorage();
    const owned = createPrincipalStorage(storage, 'pending-reader');
    owned.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"first-local"}]');
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const cached = { authenticated: true, csrfToken: null, user: { id: 'pending-reader' } };
    await client.push(cached);
    owned.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"latest-local"}]');
    await client.push(cached);
    expect(fetcher).not.toHaveBeenCalled();
    expect(owned.getItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums)).toBe('[{"id":"latest-local"}]');

    client.setSession({ ...cached, csrfToken: 'live-reader-nonce' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const init = (fetcher.mock.calls as unknown as Array<[unknown, RequestInit]>)[0][1];
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'live-reader-nonce' });
    expect(JSON.parse(String(init.body)).listened_history).toEqual([{ id: 'latest-local' }]);
    client.setSession({ ...cached, csrfToken: 'live-reader-nonce' });
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not replay a deferred principal after logout or account switch', async () => {
    const storage = new MemoryStorage();
    const ownedA = createPrincipalStorage(storage, 'reader-a');
    ownedA.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"a-local"}]');
    const fetcher = vi.fn(async () => Response.json({ ok: true }));
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    await client.push({ authenticated: true, csrfToken: null, user: { id: 'reader-a' } });
    expect(fetcher).not.toHaveBeenCalled();
    client.setSession({ authenticated: false, csrfToken: null, user: null });
    client.setSession({ authenticated: true, csrfToken: 'live-b', user: { id: 'reader-b' } });
    await Promise.resolve();
    expect(fetcher).not.toHaveBeenCalled();
    expect(ownedA.getItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums)).toBe('[{"id":"a-local"}]');
  });

  it('defers a tokenless personal pull and coalesces the route pull with the latest pending push after credentials recover', async () => {
    const storage = new MemoryStorage();
    const owned = createPrincipalStorage(storage, 'pending-pull');
    owned.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"local-listen"}]');
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      init?.method ? Response.json({ ok: true }) : Response.json({ practice_logs: [], bookmarks: [], listened_history: [] }));
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const cached = { authenticated: true, csrfToken: null, user: { id: 'pending-pull' } };
    await expect(client.pull(cached)).resolves.toBeNull();
    await client.push(cached);
    expect(fetcher).not.toHaveBeenCalled();
    expect(owned.getItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums)).toBe('[{"id":"local-listen"}]');
    owned.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"latest-listen"}]');
    const live = { ...cached, csrfToken: 'live-pull-nonce' };
    client.setSession(live);
    await client.pull(live);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0][1]?.method).toBeUndefined();
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: expect.objectContaining({ 'x-csrf-token': 'live-pull-nonce' }) });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).listened_history).toEqual([{ id: 'latest-listen' }]);
    client.setSession(live);
    await Promise.resolve();
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reads historical logs/bookmarks without writing retired fields or the audio owner', async () => {
    const storage = new MemoryStorage();
    const principalStorage = createPrincipalStorage(storage, 'user-1');
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState, JSON.stringify({ albumId: 'local-player', savedAt: 10 }));
    const requests: RequestInit[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(init ?? {});
      if (!init?.method) {
        return Response.json({
          bookmarks: [{ id: 'historical-bookmark', scrollTop: 42 }],
          listened_history: [{ id: 'historical-listen' }],
          practice_logs: [{ id: 17, date: '2026-07-31', type: 'Tụng kinh', count: 1 }],
          pt_album_positions: {},
          pt_player_state: { albumId: 'stale-aggregate-player', savedAt: 999 },
          pt_recent_albums: [{ albumId: 'stale-aggregate-player', savedAt: 999 }],
        });
      }
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const session = { authenticated: true, csrfToken: 'csrf-1', user: { id: 'user-1' } };

    await expect(client.pull(session)).resolves.toEqual([
      expect.objectContaining({ id: 17, date: '2026-07-31' }),
    ]);
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs, '[]');
    await client.push(session);

    const body = JSON.parse(String(requests.at(-1)?.body));
    expect(body).not.toHaveProperty('practice_logs');
    expect(body).not.toHaveProperty('bookmarks');
    expect(body).not.toHaveProperty('pt_player_state');
    expect(body).not.toHaveProperty('pt_album_positions');
    expect(body).not.toHaveProperty('pt_recent_albums');
    expect(JSON.parse(principalStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.talkPlayerState) || 'null')).toEqual({
      albumId: 'local-player',
      savedAt: 10,
    });
    expect(body.sync_tombstones).not.toHaveProperty('practice_logs');
    expect(body.sync_tombstones).not.toHaveProperty('bookmarks');
    expect(body.listened_history).toEqual([{ id: 'historical-listen' }]);
    expect(JSON.parse(principalStorage.getItem(LEGACY_LOCAL_STORAGE_KEYS.bookmarks) || '[]'))
      .toEqual([{ id: 'historical-bookmark', scrollTop: 42 }]);
  });

  it('does not continue a delayed A pull after A → guest → B, even when fetch ignores abort', async () => {
    const storage = new MemoryStorage();
    const ownerA = createPrincipalStorage(storage, 'user-a');
    ownerA.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"a-local"}]');
    let release = (_response: Response) => {};
    const gate = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return gate;
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const pending = client.pull({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } });
    client.setSession({ authenticated: false, csrfToken: null, user: null });
    client.setSession({ authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } });
    release(Response.json({ practice_logs: [{ id: 17, date: '2026-07-31', type: 'Tụng kinh', count: 1 }] }));

    await expect(pending).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(ownerA.getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs)).toBeNull();
    expect(createPrincipalStorage(storage, 'user-b').getItem(LEGACY_LOCAL_STORAGE_KEYS.practiceLogs)).toBeNull();
  });

  it('merges compatible history for the same principal with automatic practice enabled', async () => {
    const storage = new MemoryStorage();
    createPrincipalStorage(storage, 'user-a').setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[{"id":"local-listen"}]');
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      if (!init?.method) return Response.json({ practice_logs: [], bookmarks: [], listened_history: [] });
      const body = JSON.parse(String(init.body));
      if (Object.hasOwn(body, 'practice_logs') || body.sync_tombstones?.practice_logs?.length) {
        return Response.json({ error: 'legacy_practice_write_disabled' }, { status: 409 });
      }
      expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-a' });
      expect(body.listened_history).toEqual([{ id: 'local-listen' }]);
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    await expect(client.pull({ authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } })).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('serializes an in-flight history create before a queued delete', async () => {
    const storage = new MemoryStorage();
    const principalStorage = createPrincipalStorage(storage, 'user-1');
    const created = { id: 23, date: '2026-08-02', type: 'Tụng kinh', count: 1 };
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify([created]));

    let releaseFirstPush = () => {};
    const firstPushGate = new Promise<void>((resolve) => {
      releaseFirstPush = resolve;
    });
    let signalFirstPushStarted = () => {};
    const firstPushStarted = new Promise<void>((resolve) => {
      signalFirstPushStarted = resolve;
    });
    const serverLogs = new Map<number, typeof created>();
    const requests: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const requestIndex = requests.push(body) - 1;
      if (requestIndex === 0) {
        signalFirstPushStarted();
        await firstPushGate;
      }

      for (const log of body.listened_history as typeof created[]) serverLogs.set(log.id, log);
      const tombstones = body.sync_tombstones as {
        listened_history?: Array<{ key: string }>;
      } | undefined;
      for (const deletion of tombstones?.listened_history ?? []) {
        const id = Number(deletion.key.replace(/^id:/u, ''));
        serverLogs.delete(id);
      }
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const session = { authenticated: true, csrfToken: 'csrf-1', user: { id: 'user-1' } };

    const createPush = client.push(session);
    await firstPushStarted;
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[]');
    const deletePush = client.push(session);
    const coalescedDeletePush = client.push(session);
    await Promise.resolve();
    releaseFirstPush();
    await Promise.all([createPush, deletePush, coalescedDeletePush]);

    expect(serverLogs.size).toBe(0);
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({
      listened_history: [],
      sync_tombstones: {
        listened_history: [expect.objectContaining({ key: 'id:23' })],
      },
    });
  });

  it('uses an attempted in-flight snapshot as the baseline when its response fails', async () => {
    const storage = new MemoryStorage();
    const principalStorage = createPrincipalStorage(storage, 'user-1');
    const created = { id: 29, date: '2026-08-02', type: 'Niệm danh hiệu', count: 1 };
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify([created]));
    let releaseFailedPush = () => {};
    const failedPushGate = new Promise<void>((resolve) => { releaseFailedPush = resolve; });
    let signalFailedPushStarted = () => {};
    const failedPushStarted = new Promise<void>((resolve) => { signalFailedPushStarted = resolve; });
    const serverLogs = new Map([[created.id, created]]);
    const requests: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const requestIndex = requests.push(body) - 1;
      if (requestIndex === 0) {
        signalFailedPushStarted();
        await failedPushGate;
        return Response.json({ error: 'response_lost' }, { status: 503 });
      }
      const tombstones = body.sync_tombstones as {
        listened_history?: Array<{ key: string }>;
      } | undefined;
      for (const deletion of tombstones?.listened_history ?? []) {
        serverLogs.delete(Number(deletion.key.replace(/^id:/u, '')));
      }
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const session = { authenticated: true, csrfToken: 'csrf-1', user: { id: 'user-1' } };

    const createPush = client.push(session);
    await failedPushStarted;
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[]');
    const deletePush = client.push(session);
    releaseFailedPush();

    await expect(createPush).rejects.toThrow('sync_503');
    await expect(deletePush).resolves.toBeUndefined();
    expect(serverLogs.size).toBe(0);
    expect(requests[1]).toMatchObject({
      sync_tombstones: {
        listened_history: [expect.objectContaining({ key: 'id:29' })],
      },
    });
  });

  it('replays a deletion tombstone when the delete request fails before being applied', async () => {
    const storage = new MemoryStorage();
    const principalStorage = createPrincipalStorage(storage, 'user-1');
    const created = { id: 31, date: '2026-08-02', type: 'Tụng kinh', count: 1 };
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, JSON.stringify([created]));
    const serverLogs = new Map<number, typeof created>();
    const requests: Array<Record<string, unknown>> = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const requestIndex = requests.push(body) - 1;
      if (requestIndex === 1) return Response.json({ error: 'unavailable' }, { status: 503 });

      for (const log of body.listened_history as typeof created[]) serverLogs.set(log.id, log);
      const tombstones = body.sync_tombstones as {
        listened_history?: Array<{ key: string }>;
      } | undefined;
      for (const deletion of tombstones?.listened_history ?? []) {
        serverLogs.delete(Number(deletion.key.replace(/^id:/u, '')));
      }
      return Response.json({ ok: true });
    });
    const client = createPracticeSyncClient(fetcher as typeof fetch, storage);
    const session = { authenticated: true, csrfToken: 'csrf-1', user: { id: 'user-1' } };

    await client.push(session);
    principalStorage.setItem(LEGACY_LOCAL_STORAGE_KEYS.listenedAlbums, '[]');
    await expect(client.push(session)).rejects.toThrow('sync_503');
    await expect(client.push(session)).resolves.toBeUndefined();

    expect(serverLogs.size).toBe(0);
    expect(requests[2]).toMatchObject({
      sync_tombstones: {
        listened_history: [expect.objectContaining({ key: 'id:31' })],
      },
    });
  });
});
