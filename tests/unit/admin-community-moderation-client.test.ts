import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), csrf: vi.fn() }));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.fetch, requireBrowserCsrf: mocks.csrf }));
import { decideModeration, fetchModerationQueue, ModerationApiError, suspendModerationMember } from '../../src/lib/browser/admin-community-moderation';

beforeEach(() => { vi.resetAllMocks(); mocks.csrf.mockResolvedValue('current-csrf'); });

it('loads one bounded context page with an encoded opaque cursor and cancellation', async () => {
  const controller = new AbortController();
  const result = { items: [], nextCursor: 'next' };
  mocks.fetch.mockResolvedValue(Response.json(result));
  expect(await fetchModerationQueue('reports', 'opaque/+?', controller.signal)).toEqual(result);
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const [url, init] = mocks.fetch.mock.calls[0];
  const parsed = new URL(url, 'https://local.invalid');
  expect(Object.fromEntries(parsed.searchParams)).toEqual({ kind: 'reports', limit: '20', after: 'opaque/+?' });
  expect(init.signal).toBe(controller.signal);
  expect(mocks.csrf).not.toHaveBeenCalled();
});

it('sends a single CSRF-protected target decision without replay or unrelated refetch', async () => {
  mocks.fetch.mockResolvedValue(Response.json({ updated: true }));
  const signal = new AbortController().signal;
  await decideModeration('comments', 'id/71', { action: 'hide', revision: 3 }, signal);
  expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith('/api/admin/community/moderation/comments/id%2F71', {
    method: 'PATCH', headers: { 'content-type': 'application/json', 'x-csrf-token': 'current-csrf' },
    body: JSON.stringify({ action: 'hide', revision: 3 }), signal,
  });
});

it.each([401, 403, 404, 409, 503])('preserves status %s for role-loss and stale-context handling without replay', async status => {
  mocks.fetch.mockResolvedValue(Response.json({ error: { message: 'private server details' } }, { status }));
  await expect(decideModeration('profiles', 'u1', { action: 'reject', revision: 2, reason: 'Edit' }, new AbortController().signal))
    .rejects.toMatchObject({ status, message: `moderation_${status}` });
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(new ModerationApiError(status)).toBeInstanceOf(Error);
});

it('reuses member suspension and cancels before write when the principal changes during CSRF lookup', async () => {
  const controller = new AbortController();
  mocks.csrf.mockImplementation(async () => { controller.abort(); return 'current-csrf'; });
  await expect(suspendModerationMember('member-1', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.csrf.mockResolvedValue('current-csrf');
  mocks.fetch.mockResolvedValue(Response.json({ member: {} }));
  await suspendModerationMember('member-1', new AbortController().signal);
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/admin/members/member-1');
  expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ status: 'suspended' });
});
