import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), csrf: vi.fn(), fetch: vi.fn(), native: vi.fn() }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: mocks.snapshot, SESSION_CHANGE_EVENT: 'quangtu:session-changed' }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.fetch, requireBrowserCsrf: mocks.csrf }));
vi.mock('$lib/browser/native-api', () => ({ fetchNativeJsonMutation: mocks.native }));
import { loadPersonalLunarEvents, savePersonalLunarEvents, syncPersonalLunarEventsWithServer, pullPersonalLunarEventsFromServer, resolvePersonalEventsConflict } from '../../src/lib/browser/personal-lunar-events';
import { startPersonalEventsSync } from '../../src/lib/browser/personal-events-sync';
let storage: Map<string, string>;
let session: any;
const event = (id: string) => ({ id, title: id, lunarDay: 15, lunarMonth: 7, type: 'gia-dinh' as const, createdAt: '2026-10-22' });
beforeEach(() => {
  vi.useFakeTimers();
  storage = new Map();
  session = { authenticated: true, user: { id: 'A' }, csrfToken: 'csrf-A' };
  mocks.snapshot.mockImplementation(() => session);
  mocks.csrf.mockResolvedValue('csrf-A');
  mocks.native.mockResolvedValue(null);
  mocks.fetch.mockReset().mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({ ok: true, revision: 1 }) : Response.json({ events: [], revision: 0 }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
describe('personal event principal and outbox protection', () => {
  it('imports guest events on restored login offline and keeps a recovery copy', () => {
    session = { authenticated: false, user: null };
    savePersonalLunarEvents([event('guest-login')]);
    session = { authenticated: true, user: { id: 'A' } };
    vi.stubGlobal('navigator', { onLine: false });
    const stop = startPersonalEventsSync();
    try {
      expect(loadPersonalLunarEvents()).toEqual([event('guest-login')]);
      const guest = JSON.parse(storage.get('tutam_personal_lunar_events:v2:guest')!);
      expect(guest.events).toEqual([]);
      expect(guest.recovery).toContainEqual(event('guest-login'));
      expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!).pending).toBe(true);
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it('merges guest and server events without uploading duplicates after repeated login', async () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('guest-upload')]));
    let remote = [event('server-existing')]; let revision = 4;
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'POST') { remote = JSON.parse(init.body).events; return Response.json({ ok: true, revision: ++revision }); }
      return Response.json({ events: remote, revision });
    });
    let stop = startPersonalEventsSync();
    await syncPersonalLunarEventsWithServer();
    expect(remote.map(item => item.id).sort()).toEqual(['guest-upload', 'server-existing']);
    stop(); stop = startPersonalEventsSync();
    await syncPersonalLunarEventsWithServer();
    expect(remote).toHaveLength(2);
    expect(mocks.fetch.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
    expect(storage.get('tutam_personal_lunar_events')).toBe(JSON.stringify([event('guest-upload')]));
    stop();
  });

  it('never reimports a transferred event into another account or resurrects a deleted event', () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('once-only')]));
    vi.stubGlobal('navigator', { onLine: false });
    let stop = startPersonalEventsSync(); stop();
    savePersonalLunarEvents([]);
    stop = startPersonalEventsSync();
    expect(loadPersonalLunarEvents()).toEqual([]); stop();
    session = { authenticated: true, user: { id: 'B' } };
    stop = startPersonalEventsSync();
    expect(loadPersonalLunarEvents()).toEqual([]); stop();
  });

  it('preserves both events when a guest ID collides with a different account event', () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('same-id')]));
    savePersonalLunarEvents([{ ...event('same-id'), title: 'Account version' }], false);
    vi.stubGlobal('navigator', { onLine: false });
    const stop = startPersonalEventsSync();
    try {
      expect(loadPersonalLunarEvents().map(item => item.title).sort()).toEqual(['Account version', 'same-id']);
      expect(new Set(loadPersonalLunarEvents().map(item => item.id)).size).toBe(2);
    } finally { stop(); }
  });

  it('retains a failed import for its intended account and retries safely', () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('quota-retry')]));
    vi.stubGlobal('navigator', { onLine: false });
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith('user:A')) throw new Error('QuotaExceededError');
      storage.set(key, value);
    });
    let stop = startPersonalEventsSync(); stop();
    expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:guest')!).events).toEqual([event('quota-retry')]);
    write.mockRestore();
    session = { authenticated: true, user: { id: 'B' } };
    stop = startPersonalEventsSync(); expect(loadPersonalLunarEvents()).toEqual([]); stop();
    session = { authenticated: true, user: { id: 'A' } };
    stop = startPersonalEventsSync(); expect(loadPersonalLunarEvents()).toEqual([event('quota-retry')]); stop();
  });

  it('recovers interrupted guest cleanup without reimporting or losing newer guest edits', async () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('original')]));
    vi.stubGlobal('navigator', { onLine: false });
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key.endsWith(':guest') && !JSON.parse(value).guestTransfer) throw new Error('Cleanup interrupted');
      storage.set(key, value);
    });
    let stop = startPersonalEventsSync(); stop();
    expect(loadPersonalLunarEvents()).toEqual([event('original')]);
    write.mockRestore();
    // The account copy can already be edited/deleted before cleanup resumes.
    savePersonalLunarEvents([]);
    session = { authenticated: false, user: null };
    savePersonalLunarEvents([event('original'), event('new-guest')]);
    session = { authenticated: true, user: { id: 'A' } };
    await syncPersonalLunarEventsWithServer();
    expect(loadPersonalLunarEvents()).toEqual([]);
    const guest = JSON.parse(storage.get('tutam_personal_lunar_events:v2:guest')!);
    expect(guest.events).toEqual([event('new-guest')]);
    // The next transfer processes only genuinely new guest records.
    stop = startPersonalEventsSync();
    expect(loadPersonalLunarEvents()).toEqual([event('new-guest')]); stop();
  });

  it('keeps imported events pending after a server failure and retries the transfer once', async () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('offline-import')]));
    mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({}, { status: 503 }) : Response.json({ events: [], revision: 0 }));
    const stop = startPersonalEventsSync();
    try {
      await syncPersonalLunarEventsWithServer();
      expect(loadPersonalLunarEvents()).toEqual([event('offline-import')]);
      expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!).pending).toBe(true);
      expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:guest')!).recovery).toContainEqual(event('offline-import'));
      mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST'
        ? Response.json({ ok: true, revision: 1 }) : Response.json({ events: [], revision: 0 }));
      await syncPersonalLunarEventsWithServer();
      expect(loadPersonalLunarEvents()).toEqual([event('offline-import')]);
      expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!).pending).toBe(false);
    } finally { stop(); }
  });

  it('imports the same ID only once when it already exists in the account', () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('already-there')]));
    savePersonalLunarEvents([event('already-there')], false);
    vi.stubGlobal('navigator', { onLine: false });
    const stop = startPersonalEventsSync();
    expect(loadPersonalLunarEvents()).toEqual([event('already-there')]); stop();
  });

  it('retains the outbox and a safe diagnostic when native writes fail', async () => {
    let failed = false;
    mocks.fetch.mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return Response.json({ events: [], revision: 0 });
      if (failed) return Response.json({ ok: true, revision: 1 });
      failed = true;
      return Response.json({ error: { code: 'invalid_csrf', message: 'private detail' } }, { status: 403 });
    });
    savePersonalLunarEvents([event('keep-on-device')]);
    await syncPersonalLunarEventsWithServer();
    const saved = JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!);
    expect(saved.pending).toBe(true);
    expect(saved.events).toEqual([event('keep-on-device')]);
    expect(saved.lastHttpError).toEqual({ status: 403, code: 'invalid_csrf' });
    expect(JSON.stringify(saved)).not.toContain('private detail');
    await syncPersonalLunarEventsWithServer();
    expect(JSON.parse(storage.get('tutam_personal_lunar_events:v2:user:A')!).lastHttpError).toBeUndefined();
  });
  it('preserves edits made while waiting for session CSRF refresh', async () => {
    await pullPersonalLunarEventsFromServer();
    let complete!: (token: string) => void;
    mocks.csrf.mockImplementationOnce(() => new Promise<string>((resolve) => { complete = resolve; }));
    savePersonalLunarEvents([event('first')]);
    const flush = syncPersonalLunarEventsWithServer();
    await vi.advanceTimersByTimeAsync(0);
    savePersonalLunarEvents([event('first'), event('added-during-refresh')]);
    complete('csrf-A');
    await flush;
    expect(loadPersonalLunarEvents()).toEqual([event('first'), event('added-during-refresh')]);
    const post = mocks.fetch.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body).events).toEqual([event('first'), event('added-during-refresh')]);
  });
  it('does not interpret damaged storage as an empty reminder calendar', () => {
    const key = 'tutam_personal_lunar_events:v2:user:A';
    storage.set(key, '{interrupted');
    expect(() => loadPersonalLunarEvents(true)).toThrow();
    expect(storage.get(key)).toBe('{interrupted');
    session = { authenticated: false, user: null };
    storage.set('tutam_personal_lunar_events', '{damaged legacy');
    expect(() => loadPersonalLunarEvents(true)).toThrow();
    expect(storage.get('tutam_personal_lunar_events')).toBe('{damaged legacy');
  });
  it('isolates account data and retains unknown legacy data without assigning it to the next account', () => {
    storage.set('tutam_personal_lunar_events', JSON.stringify([event('legacy-A')]));
    expect(loadPersonalLunarEvents()).toEqual([]);
    savePersonalLunarEvents([event('A-private')], false);
    session = { authenticated: true, user: { id: 'B' } };
    expect(loadPersonalLunarEvents()).toEqual([]);
    savePersonalLunarEvents([event('B-private')], false);
    session = { authenticated: true, user: { id: 'A' } };
    expect(loadPersonalLunarEvents()).toEqual([event('A-private')]);
    expect(storage.get('tutam_personal_lunar_events')).toContain('legacy-A');
  });
  it('keeps failed writes pending and retries them with real CSRF and owner binding', async () => {
    mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST' ? Response.json({}, { status: 500 }) : Response.json({ events: [], revision: 0 }));
    savePersonalLunarEvents([event('pending')]);
    await syncPersonalLunarEventsWithServer();
    expect(loadPersonalLunarEvents()).toEqual([event('pending')]);
    expect([...storage.values()].some((raw) => raw.includes('pending') && raw.includes('"pending":true'))).toBe(true);
    const post = mocks.fetch.mock.calls.find((call) => call[1]?.method === 'POST');
    expect(post?.[1]).toMatchObject({ credentials: 'include', headers: expect.objectContaining({ 'x-csrf-token': 'csrf-A' }) });
    expect(JSON.parse(post?.[1]?.body)).toMatchObject({ ownerId: 'A', events: [event('pending')] });
  });
  it('deduplicates unchanged snapshots and debounces typing', async () => {
    for (let i = 0; i < 10; i++) savePersonalLunarEvents([{ ...event('typing'), title: `Title ${i}` }]);
    await vi.advanceTimersByTimeAsync(900);
    expect(mocks.fetch.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
    savePersonalLunarEvents([{ ...event('typing'), title: 'Title 9' }]);
    await vi.advanceTimersByTimeAsync(900);
    expect(mocks.fetch.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  });
  it('accepts an empty server snapshot and prevents a late A response from modifying B', async () => {
    savePersonalLunarEvents([event('old')], false);
    await pullPersonalLunarEventsFromServer();
    expect(loadPersonalLunarEvents()).toEqual([]);
    let complete!: (value: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const pending = pullPersonalLunarEventsFromServer();
    await vi.advanceTimersByTimeAsync(0);
    session = { authenticated: true, user: { id: 'B' } };
    savePersonalLunarEvents([event('B')], false);
    complete(Response.json({ events: [event('A')], revision: 2 }));
    await pending;
    expect(loadPersonalLunarEvents()).toEqual([event('B')]);
  });
  it('never uploads guest data or sends requests while offline', async () => {
    session = { authenticated: false, user: null };
    savePersonalLunarEvents([event('guest')]);
    await syncPersonalLunarEventsWithServer();
    session = { authenticated: true, user: { id: 'A' } };
    vi.stubGlobal('navigator', { onLine: false });
    savePersonalLunarEvents([event('offline')]);
    await syncPersonalLunarEventsWithServer();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('serializes a pending pull before a write so an older response cannot erase an acknowledged edit', async () => {
    await pullPersonalLunarEventsFromServer();
    let complete!: (value: Response) => void;
    mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({ ok: true, revision: 1 })
      : new Promise<Response>((resolve) => { complete = resolve; }));
    const pull = pullPersonalLunarEventsFromServer();
    savePersonalLunarEvents([event('new-edit')]);
    const flush = syncPersonalLunarEventsWithServer();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.fetch.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(0);
    complete(Response.json({ events: [], revision: 0 }));
    await Promise.all([pull, flush]);
    expect(loadPersonalLunarEvents()).toEqual([event('new-edit')]);
  });
  it('keeps both copies on conflicting device edits without overwriting the server', async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ events: [event('same-id')], revision: 1 }));
    await pullPersonalLunarEventsFromServer();
    savePersonalLunarEvents([{ ...event('same-id'), title: 'Local change' }]);
    mocks.fetch.mockImplementation(async (_url, init) => init?.method === 'POST'
      ? Response.json({}, { status: 409 })
      : Response.json({ events: [{ ...event('same-id'), title: 'Other device change' }], revision: 2 }));
    await syncPersonalLunarEventsWithServer();
    expect(loadPersonalLunarEvents()[0].title).toBe('Local change');
    expect([...storage.values()].some((raw) => raw.includes('Other device change') && raw.includes('"status":"conflict"'))).toBe(true);
    expect(mocks.fetch.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
    await resolvePersonalEventsConflict('server');
    expect(loadPersonalLunarEvents()[0].title).toBe('Other device change');
    expect([...storage.values()].some((raw) => raw.includes('Local change') && raw.includes('"recovery":'))).toBe(true);
  });
});
