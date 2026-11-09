import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import Harness from './blocked-users-harness.svelte';
import { COMMUNITY_BLOCKS_CHANGED_EVENT } from '../../../src/lib/contracts/community-moderation';
import { serverStateKeys } from '../../../src/lib/browser/server-state';

const mocks = vi.hoisted(() => ({ request: vi.fn(), csrf: vi.fn(), principal: 'owner-a' }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/session.svelte', () => ({
  SESSION_CHANGE_EVENT: 'quangtu:session-change',
  getBrowserSessionSnapshot: () => ({ authenticated: true, user: { id: mocks.principal } }),
}));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.request, requireBrowserCsrf: mocks.csrf }));

let component: ReturnType<typeof Harness> | undefined;
const dialogDescriptors = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const item = { authorId: 'blocked-author', displayName: 'Thành viên đã chặn', avatarUrl: '', blockedAt: '2026-11-04T00:00:00Z' };
async function settle() { await tick(); await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); }
function button(text: string) {
  const result = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === text);
  expect(result, `button ${text}`).toBeTruthy();
  return result!;
}
async function openList() {
  component = mount(Harness, { target: document.body }); flushSync();
  expect(mocks.request).not.toHaveBeenCalled();
  button('Người đã chặn').click(); await settle();
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.principal = 'owner-a';
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
  mocks.csrf.mockResolvedValue('csrf-a');
  mocks.request.mockImplementation(async () => Response.json({ items: [item], nextCursor: null }));
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; document.body.replaceChildren();
  for (const [name, descriptor] of dialogDescriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it('loads only on explicit open and reuses the same-principal list when reopened', async () => {
  await openList();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(mocks.request.mock.calls[0][0]).toBe('/api/community/blocks');
  expect(document.body.textContent).toContain(item.displayName);
  button('Người đã chặn').click(); await settle();
  button('Người đã chặn').click(); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it('confirms once, prevents duplicate DELETE and projects removal without a list refetch', async () => {
  await openList();
  let finish!: (response: Response) => void;
  mocks.request.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  button('Bỏ chặn').click(); await settle();
  const confirm = button('Xác nhận bỏ chặn');
  confirm.click(); confirm.click(); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request.mock.calls[1][0]).toBe('/api/community/blocks/blocked-author');
  expect(mocks.request.mock.calls[1][1].method).toBe('DELETE');
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect([...document.querySelectorAll('dialog button')].every(node => (node as HTMLButtonElement).disabled)).toBe(true);
  finish(Response.json({ blocked: false })); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).not.toContain(item.displayName);
  expect(document.body.textContent).toContain('Bạn chưa chặn ai');
});

it('marks only the unblocking principal leaderboard stale without fetching it from settings', async () => {
  await openList();
  const client = component!.queryClient();
  const ownKey = serverStateKeys.practiceCommunity.leaderboardForPrincipal('owner-a');
  const otherKey = serverStateKeys.practiceCommunity.leaderboardForPrincipal('owner-b');
  client.setQueryDefaults(ownKey, { staleTime: 15 * 60 * 1000 });
  client.setQueryDefaults(otherKey, { staleTime: 15 * 60 * 1000 });
  client.setQueryData(ownKey, { ranking: [] });
  const otherData = { ranking: [{ authorId: 'other-author' }] };
  client.setQueryData(otherKey, otherData);
  expect(client.getQueryState(ownKey)?.isInvalidated).toBe(false);
  const invalidations = vi.spyOn(client, 'invalidateQueries');
  mocks.request.mockResolvedValue(Response.json({ blocked: false }));
  button('Bỏ chặn').click(); await settle();
  button('Xác nhận bỏ chặn').click(); await settle();
  expect(client.getQueryState(ownKey)?.isInvalidated).toBe(true);
  expect(invalidations).toHaveBeenCalledWith({ queryKey: ownKey, exact: true, refetchType: 'none' });
  expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  expect(client.getQueryData(otherKey)).toEqual(otherData);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET')).toHaveLength(1);
});

it('does not issue DELETE after the principal changes while CSRF is pending', async () => {
  await openList();
  let finish!: (value: string) => void;
  mocks.csrf.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
  button('Bỏ chặn').click(); await settle(); button('Xác nhận bỏ chặn').click(); await settle();
  mocks.principal = 'owner-b'; component!.switchAccount(); await settle();
  finish('csrf-b'); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain(item.displayName);
  expect(document.querySelector('dialog')).toBeNull();
});

it('ignores a late list response after switching accounts and does not fetch automatically', async () => {
  let finish!: (response: Response) => void;
  mocks.request.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  component = mount(Harness, { target: document.body }); flushSync();
  button('Người đã chặn').click(); await settle();
  mocks.principal = 'owner-b'; component.switchAccount(); await settle();
  finish(Response.json({ items: [item], nextCursor: null })); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain(item.displayName);
});

it('keeps the selected user and confirmation available after an unblock failure', async () => {
  await openList();
  mocks.request.mockResolvedValue(Response.json({ error: 'unavailable' }, { status: 500 }));
  button('Bỏ chặn').click(); await settle(); button('Xác nhận bỏ chặn').click(); await settle();
  expect(document.querySelector('dialog')?.open).toBe(true);
  expect(document.querySelector('dialog [role="alert"]')).not.toBeNull();
  expect(document.body.textContent).toContain(item.displayName);
  expect(button('Xác nhận bỏ chặn').disabled).toBe(false);
});

it('loads the next bounded page only when requested explicitly', async () => {
  mocks.request.mockResolvedValueOnce(Response.json({ items: [item], nextCursor: 'cursor-next' }))
    .mockResolvedValueOnce(Response.json({ items: [{ ...item, authorId: 'second-author' }], nextCursor: null }));
  await openList();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  button('Xem thêm').click(); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request.mock.calls[1][0]).toBe('/api/community/blocks?after=cursor-next');
});

it('invalidates without a GET after a new block and reloads only on reopening', async () => {
  await openList();
  window.dispatchEvent(new CustomEvent(COMMUNITY_BLOCKS_CHANGED_EVENT, { detail: { principalId: 'owner-a', authorId: 'another-author', blocked: true } }));
  await settle();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  button('Người đã chặn').click(); await settle();
  button('Người đã chặn').click(); await settle();
  expect(mocks.request).toHaveBeenCalledTimes(2);
});
