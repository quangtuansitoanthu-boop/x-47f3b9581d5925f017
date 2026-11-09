import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { serverStateKeys } from '$lib/browser/server-state';
import type { MindfulPostPage } from '$lib/contracts/mindful-community';
import Harness from './mindful-query-harness.svelte';

const mocks = vi.hoisted(() => ({ read: vi.fn(), remove: vi.fn(), react: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: () => ({ user: { id: 'A' } }), SESSION_CHANGE_EVENT: 'session-changed' }));
vi.mock('$lib/browser/mindful-community-client', () => ({ fetchMindfulPosts: mocks.read, deleteMindfulPost: mocks.remove,
  sendMindfulReaction: mocks.react, MINDFUL_COMMUNITY_QUERY_POLICY: { staleTime: 15 * 60_000, retry: false } }));
const page: MindfulPostPage = { enabled: true, nextCursor: null, items: [{ id: 'p', kind: 'repentance', nickname: 'Đồng Tu',
  content: 'Bài gốc', createdAt: new Date().toISOString(), reactionCount: 0, viewerReacted: false, isOwn: true, status: 'published' }] };
const key = serverStateKeys.mindfulCommunity.posts('A', 'repentance');
let client: QueryClient; let component: ReturnType<typeof Harness>;
let finishRead: (value: MindfulPostPage) => void;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); };
beforeEach(async () => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(key, { pages: [page], pageParams: [null] }, { updatedAt: 1 });
  mocks.read.mockImplementation(() => new Promise<MindfulPostPage>(resolve => { finishRead = resolve; }));
  mocks.remove.mockResolvedValue(undefined);
  mocks.react.mockResolvedValue({ postId: 'p', reactionCount: 1, viewerReacted: true, templateId: 'tam-bao' });
  component = mount(Harness, { target: document.body, props: { client } }); await settle();
});
afterEach(async () => { await unmount(component); client.clear(); document.body.replaceChildren(); });

it.each(['remove', 'react'] as const)('does not let a delayed pre-mutation feed undo confirmed %s', async action => {
  expect(mocks.read).toHaveBeenCalledOnce();
  const button = document.querySelector<HTMLButtonElement>(action === 'remove' ? 'article .remove' : 'article .actions button');
  button!.click(); await settle();
  document.querySelector<HTMLButtonElement>('.practice-confirm__primary')!.click(); await settle();
  expect(action === 'remove' ? mocks.remove : mocks.react).toHaveBeenCalledOnce();
  finishRead(page); await settle();
  const items = client.getQueryData<{ pages: MindfulPostPage[] }>(key)!.pages[0].items;
  if (action === 'remove') expect(items).toEqual([]);
  else expect(items[0]).toMatchObject({ reactionCount: 1, viewerReacted: true });
  expect(mocks.read).toHaveBeenCalledOnce();
});
