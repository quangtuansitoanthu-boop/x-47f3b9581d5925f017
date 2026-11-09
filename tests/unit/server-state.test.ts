import { QueryClient } from '@tanstack/svelte-query';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateArticleState,
  invalidateTalkState,
  serverStateKeys,
  transitionTalkCatalogQueryPrincipal,
} from '../../src/lib/browser/server-state';

// Dùng biểu thức key thật tại consumer: key helper đúng nhưng caller gắn nhầm guest vẫn phải thất bại.
function mountedTalkCatalogKey(consumer: 'talks' | 'dashboard', role: string, principalId: string | null): readonly unknown[] {
  const source = readFileSync(consumer === 'talks'
    ? 'src/routes/phap-thoai/+page.svelte'
    : 'src/lib/components/practice/community/PracticeProgressDashboard.svelte', 'utf8');
  const expression = /queryKey:\s*(serverStateKeys\.talks\.[^\r\n]+),/u.exec(source)?.[1];
  if (!expression) throw new Error(`Missing actual ${consumer} talk query key`);
  return new Function('serverStateKeys', 'role', 'catalogRole', 'catalogPrincipalId', 'user', `return (${expression});`)(
    serverStateKeys, role, role, principalId, { id: principalId, role },
  ) as readonly unknown[];
}

describe('mounted talk catalog query isolation', () => {
  it('does not reuse fresh account A private talks for account B with the same role', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 600_000, retry: false } } });
    const accountA = mountedTalkCatalogKey('talks', 'admin', 'account-a');
    const accountB = mountedTalkCatalogKey('talks', 'admin', 'account-b');
    client.setQueryData(accountA, [{ id: 'private-a' }]);
    const loadB = vi.fn(async () => [{ id: 'private-b' }]);
    expect(await client.fetchQuery({ queryKey: accountB, queryFn: loadB })).toEqual([{ id: 'private-b' }]);
    expect(loadB).toHaveBeenCalledOnce();
    client.clear();
  });

  it('does not reuse privileged dashboard album titles as the guest talk catalog', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 600_000, retry: false } } });
    client.setQueryData(mountedTalkCatalogKey('dashboard', 'admin', 'account-a'), [{ id: 'private-a' }]);
    const loadGuest = vi.fn(async () => [{ id: 'public-talk' }]);
    expect(await client.fetchQuery({ queryKey: mountedTalkCatalogKey('talks', 'guest', null), queryFn: loadGuest }))
      .toEqual([{ id: 'public-talk' }]);
    expect(loadGuest).toHaveBeenCalledOnce();
    client.clear();
  });

  it('keeps same-principal refresh cache and clears only the previous scoped catalog on transition', () => {
    const client = new QueryClient();
    const previous = { role: 'admin', principalId: 'account-a' };
    const next = { role: 'admin', principalId: 'account-b' };
    const oldKey = serverStateKeys.talks.catalogForPrincipal(previous.role, previous.principalId);
    const newKey = serverStateKeys.talks.catalogForPrincipal(next.role, next.principalId);
    const guestKey = serverStateKeys.talks.catalogForPrincipal('guest', null);
    client.setQueryData(oldKey, [{ id: 'private-a' }]);
    client.setQueryData(newKey, [{ id: 'private-b' }]);
    client.setQueryData(guestKey, [{ id: 'public-talk' }]);
    const cancel = vi.spyOn(client, 'cancelQueries');
    transitionTalkCatalogQueryPrincipal(client, previous, { ...previous });
    expect(cancel).not.toHaveBeenCalled();
    expect(client.getQueryData(oldKey)).toEqual([{ id: 'private-a' }]);
    transitionTalkCatalogQueryPrincipal(client, previous, next);
    expect(cancel).toHaveBeenCalledWith({ queryKey: oldKey, exact: true });
    expect(client.getQueryData(oldKey)).toBeUndefined();
    expect(client.getQueryData(newKey)).toEqual([{ id: 'private-b' }]);
    expect(client.getQueryData(guestKey)).toEqual([{ id: 'public-talk' }]);
    transitionTalkCatalogQueryPrincipal(client, next, { role: 'guest', principalId: null });
    expect(client.getQueryData(newKey)).toBeUndefined();
    expect(client.getQueryData(guestKey)).toEqual([{ id: 'public-talk' }]);
    client.clear();
  });
});

describe('server state query families', () => {
  it('invalidates every article projection without touching talks', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(serverStateKeys.articles.homepage('guest'), []);
    queryClient.setQueryData(serverStateKeys.articles.adminPractice('admin-1'), []);
    queryClient.setQueryData(serverStateKeys.talks.catalog('guest'), []);

    await invalidateArticleState(queryClient);

    expect(queryClient.getQueryState(serverStateKeys.articles.homepage('guest'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(serverStateKeys.articles.adminPractice('admin-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(serverStateKeys.talks.catalog('guest'))?.isInvalidated).toBe(false);
  });

  it('invalidates public and admin talk projections together', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(serverStateKeys.talks.catalog('guest'), []);
    queryClient.setQueryData(serverStateKeys.talks.admin('admin-1'), []);

    await invalidateTalkState(queryClient);

    expect(queryClient.getQueryState(serverStateKeys.talks.catalog('guest'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(serverStateKeys.talks.admin('admin-1'))?.isInvalidated).toBe(true);
  });

  it('keeps admin caches isolated by authenticated user', () => {
    expect(serverStateKeys.articles.admin('admin-1')).not.toEqual(serverStateKeys.articles.admin('admin-2'));
    expect(serverStateKeys.talks.admin('admin-1')).not.toEqual(serverStateKeys.talks.admin('admin-2'));
  });

  it('keeps role-filtered catalogs and personalized campaign membership isolated', () => {
    expect(serverStateKeys.talks.catalog('ctv')).not.toEqual(serverStateKeys.talks.catalog('guest'));
    expect(serverStateKeys.articles.practice('ctv')).not.toEqual(serverStateKeys.articles.practice('guest'));
    expect(serverStateKeys.practiceCommunity.campaigns('user-a')).not.toEqual(
      serverStateKeys.practiceCommunity.campaigns('user-b'),
    );

    const queryClient = new QueryClient();
    queryClient.setQueryData(serverStateKeys.talks.catalog('ctv'), [{ id: 'private-talk' }]);
    queryClient.setQueryData(serverStateKeys.talks.catalog('guest'), []);
    queryClient.setQueryData(serverStateKeys.articles.practice('ctv'), [{ id: 'review-article' }]);
    queryClient.setQueryData(serverStateKeys.articles.practice('guest'), []);
    expect(queryClient.getQueryData(serverStateKeys.talks.catalog('guest'))).toEqual([]);
    expect(queryClient.getQueryData(serverStateKeys.articles.practice('guest'))).toEqual([]);
  });

  it('reuses the complete offline homepage result only for the same principal', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    const userAKey = serverStateKeys.articles.homepageForPrincipal('admin', 'user-a');
    const userBKey = serverStateKeys.articles.homepageForPrincipal('admin', 'user-b');
    const guestKey = serverStateKeys.articles.homepageForPrincipal('guest', null);
    const userADownloads = {
      articles: [{ id: 'user-a-downloaded-pdf', title: 'User A private download' }],
      offline: true,
    };
    const userBCatalog = {
      articles: [{ id: 'user-b-article', title: 'User B catalog' }],
      offline: false,
    };
    const guestCatalog = {
      articles: [{ id: 'public-article', title: 'Public catalog' }],
      offline: false,
    };
    const loaderCalls = { userA: 0, userB: 0, guest: 0 };
    const loadUserA = async () => {
      loaderCalls.userA += 1;
      return { articles: [], offline: false };
    };

    try {
      queryClient.setQueryData(userAKey, userADownloads);

      const remountedA = await queryClient.fetchQuery({ queryKey: userAKey, queryFn: loadUserA });
      expect(remountedA).toEqual(userADownloads);
      expect(remountedA.offline).toBe(true);
      expect(loaderCalls.userA).toBe(0);

      const loadedB = await queryClient.fetchQuery({
        queryKey: userBKey,
        queryFn: async () => {
          loaderCalls.userB += 1;
          return userBCatalog;
        },
      });
      expect(loaderCalls.userB).toBe(1);
      expect(loadedB).toEqual(userBCatalog);
      expect(loadedB.articles.map(({ id }) => id)).not.toContain(userADownloads.articles[0].id);
      expect(loadedB.articles.map(({ title }) => title)).not.toContain(userADownloads.articles[0].title);

      const loadedGuest = await queryClient.fetchQuery({
        queryKey: guestKey,
        queryFn: async () => {
          loaderCalls.guest += 1;
          return guestCatalog;
        },
      });
      expect(loaderCalls.guest).toBe(1);
      expect(loadedGuest).toEqual(guestCatalog);
      expect(loadedGuest.articles.map(({ id }) => id)).not.toContain(userADownloads.articles[0].id);
      expect(loadedGuest.articles.map(({ title }) => title)).not.toContain(userADownloads.articles[0].title);

      expect(await queryClient.fetchQuery({ queryKey: userAKey, queryFn: loadUserA })).toEqual(userADownloads);
      expect(loaderCalls).toEqual({ userA: 0, userB: 1, guest: 1 });
      expect(queryClient.getQueryData(userBKey)).toEqual(userBCatalog);
      expect(queryClient.getQueryData(guestKey)).toEqual(guestCatalog);
    } finally {
      queryClient.clear();
    }
  });

  it('invalidates and removes principal homepages through existing article prefixes without touching talks', async () => {
    const queryClient = new QueryClient();
    const homepagePrefix = serverStateKeys.articles.homepage('admin');
    const userAKey = serverStateKeys.articles.homepageForPrincipal('admin', 'user-a');
    const userBKey = serverStateKeys.articles.homepageForPrincipal('admin', 'user-b');
    const guestKey = serverStateKeys.articles.homepageForPrincipal('guest', null);
    const practiceKey = serverStateKeys.articles.practice('admin');
    const talksKey = serverStateKeys.talks.catalog('admin');

    try {
      for (const key of [homepagePrefix, userAKey, userBKey, guestKey, practiceKey, talksKey]) {
        queryClient.setQueryData(key, { articles: [], offline: false });
      }

      await queryClient.invalidateQueries({ queryKey: homepagePrefix });
      for (const key of [homepagePrefix, userAKey, userBKey]) {
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
      }
      for (const key of [guestKey, practiceKey, talksKey]) {
        expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
      }

      queryClient.removeQueries({ queryKey: homepagePrefix });
      for (const key of [homepagePrefix, userAKey, userBKey]) {
        expect(queryClient.getQueryState(key)).toBeUndefined();
      }
      for (const key of [guestKey, practiceKey, talksKey]) {
        expect(queryClient.getQueryData(key)).toEqual({ articles: [], offline: false });
      }

      await invalidateArticleState(queryClient);
      expect(queryClient.getQueryState(guestKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(practiceKey)?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(talksKey)?.isInvalidated).toBe(false);

      queryClient.removeQueries({ queryKey: serverStateKeys.articles.all });
      expect(queryClient.getQueryState(guestKey)).toBeUndefined();
      expect(queryClient.getQueryState(practiceKey)).toBeUndefined();
      expect(queryClient.getQueryData(talksKey)).toEqual({ articles: [], offline: false });
    } finally {
      queryClient.clear();
    }
  });
});
