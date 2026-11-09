import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import CommentsPanel from '../../../src/lib/components/comments/CommentsPanel.svelte';
import { COMMUNITY_BLOCKS_CHANGED_EVENT } from '../../../src/lib/contracts/community-moderation';

const mocks = vi.hoisted(() => ({
  session: { authenticated: true, csrfToken: 'csrf-a', user: { id: 'owner-a', displayName: 'Owner A', email: 'a@example.test', role: 'user' }, expiresAt: null },
  fetch: vi.fn(), csrf: vi.fn(),
}));
vi.mock('$lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: mocks.fetch,
  getBrowserSession: async () => mocks.session,
  requireBrowserCsrf: mocks.csrf,
}));
vi.mock('$lib/stores/session.svelte', () => ({
  SESSION_CONTEXT: Symbol('test-session'), SESSION_CHANGE_EVENT: 'test:community-session-change',
  getBrowserSessionSnapshot: () => mocks.session,
}));

const publicComment = { id: 41, ten: 'Other Member', noi_dung: 'Public comment', tao_luc: '2026-11-04T00:00:00Z', parent_id: null, role: 'user', authorId: 'public-other', isOwnProfile: false, moderationStatus: 'approved' };
const reply = { ...publicComment, id: 42, noi_dung: 'Public reply', parent_id: 41 };
let component: ReturnType<typeof CommentsPanel> | undefined;
let cached: Map<string, Response>;
const descriptors = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const button = (label: string) => {
  const scope = document.querySelector('dialog[open]') ?? document;
  const result = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(node => !node.closest('[inert]') && (node.textContent?.trim() === label || node.getAttribute('aria-label') === label));
  expect(result, `button ${label}`).toBeDefined();
  return result!;
};
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
async function openComments() {
  component = mount(CommentsPanel, { target: document.body, props: { articleId: 'article-1' } });
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Public comment'); });
}
function openAction(label: string, id = 41) {
  button(`Tùy chọn bình luận ${id}`).click(); flushSync();
  button(label).click(); flushSync();
}
function submitDialog() {
  document.querySelector<HTMLDialogElement>('dialog')!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  localStorage.clear();
  mocks.session = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'owner-a', displayName: 'Owner A', email: 'a@example.test', role: 'user' }, expiresAt: null };
  mocks.csrf.mockReset().mockResolvedValue('csrf-a');
  mocks.fetch.mockReset().mockImplementation(async (_path: string, init?: RequestInit) => init?.method ? Response.json({ reported: true, blocked: true }) : Response.json([publicComment, reply]));
  cached = new Map();
  vi.stubGlobal('caches', { open: async () => ({
    match: async (path: string) => cached.get(path)?.clone(),
    put: async (path: string, response: Response) => { cached.set(path, response.clone()); },
  }) });
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); document.body.replaceChildren();
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});

it('reports a reply with retained details after an error and no menu lookup requests', async () => {
  await openComments();
  openAction('Báo cáo bình luận', 42); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  const details = document.querySelector<HTMLTextAreaElement>('dialog textarea')!;
  details.value = 'Please review this reply'; details.dispatchEvent(new Event('input', { bubbles: true }));
  mocks.fetch.mockResolvedValueOnce(Response.json({ error: { message: 'Unavailable' } }, { status: 503 }));
  submitDialog(); await settle();
  expect(details.value).toBe('Please review this reply');
  expect(document.querySelector('dialog [role="alert"]')?.textContent).toBeTruthy();
  mocks.fetch.mockResolvedValueOnce(Response.json({ reported: true }));
  submitDialog(); await vi.waitFor(() => { flushSync(); expect(document.querySelector('dialog')).toBeNull(); });
  const posts = mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1][0]).toBe('/api/community/reports');
  expect(JSON.parse(posts[1][1].body)).toEqual({ targetType: 'comment', targetId: '42', reason: 'offensive', details: 'Please review this reply' });
});

it('confirms a block once and removes that author and replies without another GET', async () => {
  await openComments();
  openAction('Chặn người dùng'); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  button('Hủy').click(); await settle();
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  openAction('Chặn người dùng'); await settle();
  let finishBlock: (response: Response) => void = () => {};
  mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finishBlock = resolve; }));
  const form = document.querySelector<HTMLDialogElement>('dialog')?.querySelector('form');
  expect(form).toBeTruthy();
  form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1));
  finishBlock(Response.json({ blocked: true }));
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).not.toContain('Public comment'); });
  expect(document.body.textContent).not.toContain('Public reply');
  expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1);
  expect(mocks.fetch.mock.calls.find(([, init]) => init?.method === 'PUT')?.[0]).toBe('/api/community/blocks/public-other');
  expect(mocks.fetch.mock.calls.filter(([, init]) => !init?.method || init.method === 'GET')).toHaveLength(1);
});

it('keeps pending submissions private and out of approved offline snapshots', async () => {
  await openComments();
  expect(mocks.fetch.mock.calls[0][0]).toBe('/api/articles/article-1/comments?includeOwn=1');
  button('Viết bình luận').click(); await settle();
  const textarea = document.querySelector<HTMLTextAreaElement>('.comment-form-panel textarea')!;
  textarea.value = 'My pending draft'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
  mocks.fetch.mockResolvedValueOnce(Response.json({ ...publicComment, id: 43, authorId: 'public-self', isOwnProfile: true, moderationStatus: 'pending', noi_dung: 'My pending draft' }));
  document.querySelector('.comment-form-panel')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Đang chờ duyệt'); });
  expect(document.body.textContent).toContain('My pending draft');
  for (const response of cached.values()) expect(JSON.stringify(await response.clone().json())).not.toContain('My pending draft');
  expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('does not send a report under another account after CSRF preparation resolves late', async () => {
  await openComments();
  openAction('Báo cáo bình luận'); await settle();
  let releaseCsrf: (value: string) => void = () => {};
  mocks.csrf.mockImplementationOnce(() => new Promise<string>(resolve => { releaseCsrf = resolve; }));
  submitDialog();
  await vi.waitFor(() => expect(mocks.csrf).toHaveBeenCalledOnce());
  mocks.session = { ...mocks.session, user: { ...mocks.session.user, id: 'owner-b', displayName: 'Owner B' } };
  window.dispatchEvent(new CustomEvent('test:community-session-change', { detail: mocks.session }));
  releaseCsrf('csrf-b'); await settle();
  expect(mocks.fetch.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  expect(document.querySelector('dialog')).toBeNull();
});

it('applies only same-principal block events without refetching comments', async () => {
  await openComments();
  window.dispatchEvent(new CustomEvent(COMMUNITY_BLOCKS_CHANGED_EVENT, { detail: { principalId: 'other-owner', authorId: 'public-other', blocked: true } }));
  await settle(); expect(document.body.textContent).toContain('Public comment');
  window.dispatchEvent(new CustomEvent(COMMUNITY_BLOCKS_CHANGED_EVENT, { detail: { principalId: 'owner-a', authorId: 'public-other', blocked: true } }));
  await settle(); expect(document.body.textContent).not.toContain('Public comment');
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('does not resurrect a blocked author from a list request already in flight', async () => {
  await openComments();
  let finishRead: (response: Response) => void = () => {};
  mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finishRead = resolve; }));
  window.dispatchEvent(new Event('online'));
  await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
  window.dispatchEvent(new CustomEvent(COMMUNITY_BLOCKS_CHANGED_EVENT, { detail: { principalId: 'owner-a', authorId: 'public-other', blocked: true } }));
  finishRead(Response.json([publicComment, reply])); await settle();
  expect(document.body.textContent).not.toContain('Public comment');
  expect(document.body.textContent).not.toContain('Public reply');
  for (const response of cached.values()) expect(JSON.stringify(await response.clone().json())).not.toContain('public-other');
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it('does not expose old shared offline comments or cache private review reasons', async () => {
  const privateRow = { ...publicComment, id: 43, isOwnProfile: true, moderationStatus: 'rejected', moderationReason: 'Private moderator reason', noi_dung: 'Private review draft' };
  mocks.fetch.mockResolvedValueOnce(Response.json([publicComment, privateRow]));
  await openComments(); await settle();
  expect(document.body.textContent).toContain('Private moderator reason');
  for (const response of cached.values()) {
    const saved = JSON.stringify(await response.clone().json());
    expect(saved).not.toContain('Private moderator reason');
    expect(saved).not.toContain('Private review draft');
  }
  await unmount(component!); component = undefined;
  cached.clear(); cached.set('/offline-comments/article-1', Response.json([publicComment]));
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  component = mount(CommentsPanel, { target: document.body, props: { articleId: 'article-1' } });
  await settle();
  expect(document.body.textContent).not.toContain('Public comment');
  expect(cached.has('/offline-comments/article-1')).toBe(true);
});
