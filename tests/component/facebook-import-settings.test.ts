import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import FacebookImportSettings, {
  createFacebookAdminRequestLifecycle,
  redactFacebookAdminData,
} from '../../src/lib/components/admin/settings/FacebookImportSettings.svelte';
import type { FacebookAdminData } from '../../src/lib/server/services/facebook-integration';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, reject, resolve };
}

const adminSession = (id: string) => ({ authenticated: true, user: { id, role: 'admin' } });

const fixture = (): FacebookAdminData => ({
  configured: true,
  enabled: true,
  graphVersion: 'v26.0',
  settings: {
    sourceUrl: 'https://www.facebook.com/private-a',
    publishPolicy: 'auto',
    updatedAt: '2026-09-04T00:00:00.000Z',
  },
  connection: {
    id: 'connection-a', facebookUserId: 'facebook-a', displayName: 'Admin A', status: 'active',
    tokenExpiresAt: '2026-11-03T00:00:00.000Z', dataAccessExpiresAt: null,
    lastAttemptAt: null, lastSuccessAt: null, lastErrorCode: null,
  },
  imports: [{
    id: 'import-a', facebookPostId: 'post-a', articleId: 'article-a',
    permalinkUrl: 'https://www.facebook.com/private-a/posts/1', status: 'review',
    sourceManaged: true, sourceCreatedAt: null, lastErrorCode: null, updatedAt: '',
  }],
  importsPage: { nextOffset: 50, offset: 0 },
});

describe('Facebook import admin settings', () => {
  it('scrubs A synchronously and ignores deferred A refresh/mutation results after selecting B', async () => {
    let visible = fixture();
    let scrubCount = 0;
    const scrub = () => {
      scrubCount += 1;
      visible = redactFacebookAdminData();
    };
    const lifecycle = createFacebookAdminRequestLifecycle('admin-a', scrub);
    const refreshRequest = lifecycle.begin();
    const mutationRequest = lifecycle.begin();
    const refresh = deferred<FacebookAdminData>();
    const mutation = deferred<FacebookAdminData>();
    expect(refreshRequest).not.toBeNull();
    expect(mutationRequest).not.toBeNull();

    const apply = async (promise: Promise<FacebookAdminData>, request: NonNullable<typeof refreshRequest>) => {
      const next = await promise;
      if (lifecycle.isCurrent(request)) visible = next;
    };
    const pendingRefresh = apply(refresh.promise, refreshRequest!);
    const pendingMutation = apply(mutation.promise, mutationRequest!);

    expect(lifecycle.transition(adminSession('admin-b'))).toBe('/admin/settings');
    expect(scrubCount).toBe(1);
    expect(refreshRequest!.controller.signal.aborted).toBe(true);
    expect(mutationRequest!.controller.signal.aborted).toBe(true);
    expect(visible.connection).toBeNull();
    expect(visible.imports).toEqual([]);
    expect(visible.settings.sourceUrl).toBe('');

    refresh.resolve(fixture());
    mutation.resolve(fixture());
    await Promise.all([pendingRefresh, pendingMutation]);
    expect(visible).toEqual(redactFacebookAdminData());
    expect(lifecycle.begin()).toBeNull();
  });

  it('scrubs A for an anonymous session but preserves current requests on same-user refresh', () => {
    let visible = fixture();
    const lifecycle = createFacebookAdminRequestLifecycle('admin-a', () => { visible = redactFacebookAdminData(); });
    const request = lifecycle.begin();
    expect(request).not.toBeNull();

    expect(lifecycle.transition(adminSession('admin-a'))).toBeNull();
    expect(request!.controller.signal.aborted).toBe(false);
    expect(lifecycle.isCurrent(request!)).toBe(true);
    expect(visible.connection?.displayName).toBe('Admin A');

    expect(lifecycle.transition({ authenticated: false, user: null })).toBe('/?login=1');
    expect(request!.controller.signal.aborted).toBe(true);
    expect(visible).toEqual(redactFacebookAdminData());
  });

  it('wires synchronous scrub-before-redirect and private no-store SSR ownership', () => {
    const component = readFileSync('src/lib/components/admin/settings/FacebookImportSettings.svelte', 'utf8');
    const page = readFileSync('src/routes/admin/settings/+page.svelte', 'utf8');
    const loader = readFileSync('src/routes/admin/settings/+page.ts', 'utf8');
    const rootLoader = readFileSync('src/routes/+layout.ts', 'utf8');
    const handler = component.slice(component.indexOf('const sessionChanged'), component.indexOf('window.addEventListener', component.indexOf('const sessionChanged')));

    expect(component).toContain('{#if principalActive}');
    expect(handler.indexOf('lifecycle.transition(session)')).toBeLessThan(handler.indexOf('globalThis.location.replace(destination)'));
    expect(component).toContain('if (!request) return;');
    expect(page).toContain('{#key data.ownerId}');
    expect(rootLoader).toContain("export const ssr = import.meta.env.VITE_CAPACITOR_BUILD !== '1'");
    expect(loader).toContain("credentials: 'include'");
    expect(loader).not.toContain('setHeaders');
  });

  it('renders connection health, publishing policy, and ledger actions without credentials', () => {
    const data: FacebookAdminData = {
      configured: true,
      enabled: true,
      graphVersion: 'v26.0',
      settings: {
        sourceUrl: 'https://www.facebook.com/tranan.buhd',
        publishPolicy: 'review',
        updatedAt: '2026-09-04T00:00:00.000Z',
      },
      connection: {
        id: 'connection-1',
        facebookUserId: 'app-scoped-user',
        displayName: 'Trần An',
        status: 'active',
        tokenExpiresAt: '2026-11-03T00:00:00.000Z',
        dataAccessExpiresAt: '2026-11-03T00:00:00.000Z',
        lastAttemptAt: '2026-09-04T00:00:00.000Z',
        lastSuccessAt: '2026-09-04T00:00:00.000Z',
        lastErrorCode: null,
      },
      imports: [{
        id: 'import-1',
        facebookPostId: 'post-1',
        articleId: 'facebook-post-1',
        permalinkUrl: 'https://www.facebook.com/posts/1',
        status: 'review',
        sourceManaged: true,
        sourceCreatedAt: '2026-09-03T00:00:00.000Z',
        lastErrorCode: null,
        updatedAt: '2026-09-04T00:00:00.000Z',
      }],
      importsPage: { nextOffset: null, offset: 0 },
    };
    const body = render(FacebookImportSettings, { props: { initial: data, ownerId: 'admin-a' } }).body;
    expect(body).toContain('Nguồn nội dung có cấp quyền');
    expect(body).toContain('https://www.facebook.com/tranan.buhd');
    expect(body).toContain('Chờ duyệt');
    expect(body).toContain('Đồng bộ ngay');
    expect(body).toContain('Tách nguồn');
    expect(body).toContain('Trần An');
    expect(body).toContain('Đường dẫn trang Facebook');
    expect(body).toContain('aria-describedby="facebook-source-help"');
    expect(body).toContain('04/09/2026');
    expect(body).toContain('03/11/2026');
    expect(body).not.toContain('2026-11-03T00:00:00.000Z');
    for (const label of ['Bài Facebook', 'Bài TuTam', 'Trạng thái', 'Thao tác']) {
      expect(body).toContain(`data-label="${label}"`);
    }
    expect(body).not.toContain('access_token');
    expect(body).not.toContain('FACEBOOK_APP_SECRET');
  });

  it('renders per-item errors and pagination controls for a long ledger', () => {
    const data = {
      configured: true,
      enabled: true,
      graphVersion: 'v26.0',
      settings: { sourceUrl: 'https://www.facebook.com/tranan.buhd', publishPolicy: 'review', updatedAt: '' },
      connection: null,
      imports: [{
        id: 'failed-import', facebookPostId: 'failed-post', articleId: null, permalinkUrl: '',
        status: 'failed', sourceManaged: true, sourceCreatedAt: null,
        lastErrorCode: 'article_deleted', updatedAt: '',
      }],
      importsPage: { nextOffset: 50, offset: 0 },
    } satisfies FacebookAdminData;
    const body = render(FacebookImportSettings, { props: { initial: data, ownerId: 'admin-a' } }).body;
    expect(body).toContain('article_deleted');
    expect(body).toContain('Nhập thất bại');
    expect(body).toContain('Thử lại');
    expect(body).toContain('Trang sau');
  });

  it('keeps descriptive source semantics and explains connection health in Vietnamese', () => {
    const data = fixture();
    data.connection!.status = 'permission_missing';
    const body = render(FacebookImportSettings, { props: { initial: data, ownerId: 'admin-a' } }).body;

    expect(body).toContain('Thiếu quyền đọc bài viết');
    expect(body).toContain('Đường dẫn này chỉ để tham khảo.');
    expect(body).toContain('Nội dung được nhập từ tài khoản Facebook bạn kết nối.');
    expect(body).not.toContain('user_posts');
    expect(body).toContain('Chưa đồng bộ');
  });
});
