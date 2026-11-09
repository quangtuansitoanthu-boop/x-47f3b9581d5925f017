import { describe, expect, it, vi } from 'vitest';
import { createPersonalSettingsSync, type PersonalSettingsSyncSession } from '../../../src/lib/browser/personal-settings-sync';
import { PERSONAL_SYNC_INTERVAL_MS as interval } from '../../../src/lib/domain/practice/personal-sync-policy';
import { normalizePersonalSettings, type PersonalSettingsSnapshot } from '../../../src/lib/domain/practice/personal-settings';

const empty: PersonalSettingsSnapshot = { routines: [], nickname: '' };
function harness() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  let time = 0; let session: PersonalSettingsSyncSession = { authenticated: true, user: { id: 'a' }, csrfToken: 'csrf' };
  const transport = { read: vi.fn(async () => new Response(JSON.stringify({ snapshot: empty, revision: 0, updatedAt: null }))),
    write: vi.fn(async (input: { snapshot: PersonalSettingsSnapshot; revision: number }) => new Response(JSON.stringify({ snapshot: input.snapshot, revision: input.revision + 1, updatedAt: '2026-11-07T12:00:00Z' }))) };
  const status = vi.fn();
  const options = { storage, transport, getSession: () => session, now: () => time, onStatus: status };
  const sync = createPersonalSettingsSync(options);
  return { sync, options, transport, status, values, setTime: (value: number) => { time = value; }, setSession: (value: PersonalSettingsSyncSession) => { session = value; } };
}
describe('personal settings request budget and durable sync', () => {
  it('has0GET/PUT on activation unchanged and coalesces edits into1PUT after48hours', async () => {
    const h = harness(); await h.sync.active(); h.sync.changed(empty); await h.sync.active();
    expect(h.transport.read).not.toHaveBeenCalled(); expect(h.transport.write).not.toHaveBeenCalled();
    h.sync.changed({ ...empty, nickname: 'first' }); h.setTime(1000); h.sync.changed({ ...empty, nickname: 'latest' });
    h.setTime(interval - 1); await h.sync.active(); expect(h.transport.write).not.toHaveBeenCalled();
    h.setTime(interval); await h.sync.active(); await h.sync.active();
    expect(h.transport.write).toHaveBeenCalledOnce(); expect(h.transport.write.mock.calls[0][0].snapshot.nickname).toBe('latest');
    expect(h.transport.read).not.toHaveBeenCalled();
  });
  it('persists metadata across remount, debounces concurrent activation, and keeps in-flight edits pending', async () => {
    const h = harness(); h.sync.changed({ ...empty, nickname: 'first' }); h.sync.dispose();
    const sync = createPersonalSettingsSync(h.options); h.setTime(interval);
    let done!: (response: Response) => void;
    h.transport.write.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const pending = sync.active(); await sync.active(); sync.changed({ ...empty, nickname: 'second' });
    done(new Response(JSON.stringify({ snapshot: { ...empty, nickname: 'first' }, revision: 1, updatedAt: '2026-11-07T12:00:00Z' })));
    await pending; expect(h.transport.write).toHaveBeenCalledOnce(); expect(h.status).toHaveBeenLastCalledWith('pending');
    h.setTime(interval * 2); await sync.active(); expect(h.transport.write).toHaveBeenCalledTimes(2);
  });
  it('ignores late receipts after logout/account change and never sends a previous owner snapshot', async () => {
    const h = harness(); h.sync.changed({ ...empty, nickname: 'private-a' }); h.setTime(interval);
    let done!: (response: Response) => void; h.transport.write.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const pending = h.sync.active(); h.setSession({ authenticated: true, user: { id: 'b' }, csrfToken: 'other' }); h.sync.sessionChanged();
    h.sync.changed({ ...empty, nickname: 'private-b' });
    done(new Response(JSON.stringify({ snapshot: { ...empty, nickname: 'private-a' }, revision: 1, updatedAt: '2026-11-07T12:00:00Z' })));
    await pending; await h.sync.active(); expect(h.transport.write).toHaveBeenCalledOnce();
  });
  it('blocks conflict retries and restores only explicitly, preserving local choices for reconciliation', async () => {
    const h = harness(); h.sync.changed({ ...empty, nickname: 'local' }); h.setTime(interval);
    h.transport.write.mockResolvedValueOnce(new Response('{}', { status: 409 }));
    await h.sync.active(); h.setTime(interval * 4); await h.sync.active(); expect(h.transport.write).toHaveBeenCalledOnce();
    const remote = await h.sync.restore(); expect(h.transport.read).toHaveBeenCalledOnce(); expect(remote.snapshot).toEqual(empty);
    h.sync.reconcile({ ...empty, nickname: 'local' }); await h.sync.active(); expect(h.transport.write).toHaveBeenCalledOnce();
    h.setTime(interval * 5); await h.sync.active(); expect(h.transport.write).toHaveBeenCalledTimes(2);
  });
  it('backs off offline failures without dropping local changes or faking a successful upload', async () => {
    const h = harness(); h.sync.changed({ ...empty, nickname: 'local' }); h.setTime(interval);
    h.transport.write.mockRejectedValueOnce(new TypeError('offline')); await h.sync.active(); await h.sync.active();
    expect(h.transport.write).toHaveBeenCalledOnce(); h.setTime(interval + 30_000); await h.sync.active(); expect(h.transport.write).toHaveBeenCalledTimes(2);
  });
  it('rejects private journal fields at the synchronization boundary', () => {
    expect(() => normalizePersonalSettings({ ...empty, reflections: [{ repentance: 'private' }] })).toThrow('invalid_personal_settings');
  });
  it('replays an uncertain committed snapshot after local revert and remount, then keeps the revert pending', async () => {
    const h = harness(); h.sync.changed({ ...empty, nickname: 'B' }); h.setTime(interval);
    let fail!: (error: Error) => void;
    h.transport.write.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const pending = h.sync.active(); h.sync.changed(empty); fail(new TypeError('receipt lost after commit')); await pending;
    h.sync.dispose(); const sync = createPersonalSettingsSync(h.options); h.setTime(interval + 30_000);
    await sync.active(); expect(h.transport.write).toHaveBeenCalledTimes(2);
    expect(h.transport.write.mock.calls[1][0]).toEqual({ snapshot: { ...empty, nickname: 'B' }, revision: 0 });
    expect(h.status).toHaveBeenLastCalledWith('pending');
    h.setTime(interval * 2 + 30_000); await sync.active();
    expect(h.transport.write.mock.calls[2][0]).toEqual({ snapshot: empty, revision: 1 });
  });
});
