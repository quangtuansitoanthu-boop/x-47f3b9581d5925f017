import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
const testSession = vi.hoisted(() => ({ user: { id: 'admin-1', role: 'admin' } }));
vi.mock('$lib/stores/session.svelte', async (importOriginal) => ({ ...await importOriginal<object>(), getBrowserSessionSnapshot: () => testSession }));
import { load as talkAdminLoad } from '../../src/routes/admin/phap-thoai/+page.ts';
import { load as practiceAdminLoad } from '../../src/routes/admin/tu-tap/+page.ts';
import AdminPracticeManager from '../../src/lib/components/admin/practice/AdminPracticeManager.svelte';
import AdminTalkManager from '../../src/lib/components/admin/talks/AdminTalkManager.svelte';
import AdminMemberManager from '../../src/lib/components/admin/members/AdminMemberManager.svelte';
import QueryTestHarness from './query-test-harness.svelte';

const talkAlbums = [
  {
    id: 'empty-album',
    tieu_de: 'Album trống',
    mo_ta: '',
    chu_de: 'Pháp ngữ',
    dien_gia: null,
    archive_id: null,
    anh_dai_dien: null,
    visibility: 'public',
    ngay_dang: '2026-08-01',
    created_at: '2026-08-01T00:00:00.000Z',
    tracks: []
  },
  {
    id: 'drive-album',
    tieu_de: 'Album Drive',
    mo_ta: 'Album từ Drive',
    chu_de: 'Pháp ngữ',
    dien_gia: 'Thầy Minh Niệm',
    archive_id: null,
    anh_dai_dien: null,
    visibility: 'private',
    ngay_dang: '2026-08-02',
    created_at: '2026-08-02T00:00:00.000Z',
    tracks: [{ title: 'Bài 1', url: '/api/audio/drive/file-1', duration_sec: 9 }]
  }
] as const;

const practiceArticles = [
  {
    id: 'kinh-1',
    title: 'Kinh Phật',
    summary: '',
    content: '',
    category: 'KINH PHẬT',
    tags: ['tu tap'],
    author: 'Quang Từ',
    imageUrl: '',
    featured: false,
    publishedAt: '2026-08-01',
    hasTableOfContents: false,
    volumeCount: 0,
    status: 'Đang cập nhật',
    pdfUrl: '',
    externalUrl: '',
    viewCount: 0
  },
  {
    id: 'ritual-1',
    title: 'Nghi thức',
    summary: '',
    content: '',
    category: 'CÁC NGHI THỨC',
    tags: [],
    author: 'Quang Từ',
    imageUrl: '',
    featured: false,
    publishedAt: '2026-08-02',
    hasTableOfContents: true,
    volumeCount: 2,
    status: 'Hoàn thành',
    pdfUrl: '',
    externalUrl: '',
    viewCount: 0
  }
] as const;

const practiceRows = [
  {
    id: 'kinh-1',
    tieu_de: 'Kinh Phật',
    tom_tat: '',
    noi_dung: '',
    danh_muc: 'KINH PHẬT',
    tags: 'tu tap',
    tac_gia: 'Quang Từ',
    anh_url: '',
    noi_bat: 0,
    ngay_dang: '2026-08-01',
    has_muc_luc: false,
    so_tap: 0,
    trang_thai: 'Đang cập nhật',
    pdf_url: '',
    link_ngoai: ''
  },
  {
    id: 'ritual-1',
    tieu_de: 'Nghi thức',
    tom_tat: '',
    noi_dung: '',
    danh_muc: 'CÁC NGHI THỨC',
    tags: '',
    tac_gia: 'Quang Từ',
    anh_url: '',
    noi_bat: 0,
    ngay_dang: '2026-08-02',
    has_muc_luc: true,
    so_tap: 2,
    trang_thai: 'Hoàn thành',
    pdf_url: '',
    link_ngoai: ''
  }
] as const;

describe('admin content manager contracts', () => {
  it('keeps the dedicated admin talk page and load contract aligned', async () => {
    const page = readFileSync('src/routes/admin/phap-thoai/+page.svelte', 'utf8');
    const server = readFileSync('src/routes/admin/phap-thoai/+page.ts', 'utf8');
    const manager = readFileSync('src/lib/components/admin/talks/AdminTalkManager.svelte', 'utf8');

    expect(page).toContain('<title>Quản lý Pháp thoại — Quang Từ</title>');
    expect(page).toContain('name="robots" content="noindex,nofollow"');
    expect(page).toContain('<AdminTalkManager initialAlbums={data.albums} role={data.role} userId={data.userId} />');
    expect(server).toContain('fetchAdminTalkAlbums(fetch)');
    expect(server).toContain("session.user?.role === 'admin'");
    expect(manager).toContain('Cần thêm track');
    expect(manager).toContain('showManualAction={false}');
    expect(manager).toContain('editorAlbumId={null}');
    expect(manager).toContain('getBrowserSession({ force: true })');
    expect(manager).toContain('SESSION_CHANGE_EVENT');
    expect(manager).toContain('Làm mới');
    expect(manager).toContain('Tạo album');
  });

  it('keeps the dedicated admin practice page and load contract aligned', async () => {
    const page = readFileSync('src/routes/admin/tu-tap/+page.svelte', 'utf8');
    const server = readFileSync('src/routes/admin/tu-tap/+page.ts', 'utf8');
    const manager = readFileSync('src/lib/components/admin/practice/AdminPracticeManager.svelte', 'utf8');

    expect(page).toContain('<title>Quản lý Tu tập — Quang Từ</title>');
    expect(page).toContain('name="robots" content="noindex,nofollow"');
    expect(page).toContain('<AdminPracticeManager initialArticles={data.articles} role={data.role} userId={data.userId} />');
    expect(server).toContain('fetchAdminPracticeArticles(fetch)');
    expect(server).toContain("session.user?.role === 'admin'");
    expect(manager).toContain('allowedCategories={PRACTICE_CATEGORIES}');
    expect(manager).toContain('defaultCategory="KINH PHẬT"');
    expect(manager).toContain('getBrowserSession({ force: true })');
    expect(manager).toContain('SESSION_CHANGE_EVENT');
    expect(manager).toContain('Mở trang Tu tập');
    expect(manager).toContain('Tạo bài tu tập');
  });

  it('fetches the admin route data and maps session role correctly', async () => {
    const talkFetch = vi.fn(async () => new Response(JSON.stringify(talkAlbums), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    const talkResult = await talkAdminLoad({
      fetch: talkFetch,
      parent: async () => ({ session: { user: { id: 'admin-1', role: 'admin' } } })
    } as never);

    expect(talkFetch).toHaveBeenCalledWith('/api/talks?select=id,tieu_de,mo_ta,chu_de,dien_gia,archive_id,anh_dai_dien,visibility,ngay_dang,created_at,tracks&order=created_at.desc&limit=500&offset=0', expect.objectContaining({
      headers: { accept: 'application/json' },
      signal: undefined
    }));
    expect(talkResult).toEqual({
      albums: expect.arrayContaining([
        expect.objectContaining({ id: 'empty-album' }),
        expect.objectContaining({ id: 'drive-album' })
      ]),
      role: 'admin',
      userId: 'admin-1'
    });

    const practiceFetch = vi.fn(async () => new Response(JSON.stringify(practiceRows), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
    testSession.user = { id: 'ctv-1', role: 'ctv' };
    const practiceResult = await practiceAdminLoad({
      fetch: practiceFetch,
      parent: async () => ({ session: { user: { id: 'ctv-1', role: 'ctv' } } })
    } as never);

    expect(practiceFetch).toHaveBeenCalledWith('/api/articles?select=id,tieu_de,tom_tat,noi_dung,danh_muc,tags,tac_gia,anh_url,noi_bat,ngay_dang,has_muc_luc,so_tap,trang_thai,pdf_url,link_ngoai,created_at,updated_at&order=created_at.desc&limit=500&offset=0', expect.objectContaining({
      headers: { accept: 'application/json' },
      signal: undefined
    }));
    expect(practiceResult).toEqual({
      articles: expect.arrayContaining([
        expect.objectContaining({ id: 'kinh-1' }),
        expect.objectContaining({ id: 'ritual-1' })
      ]),
      role: 'ctv',
      userId: 'ctv-1'
    });
  });

  it('renders the admin talk manager with empty albums kept in the inventory', () => {
    const { body } = render(QueryTestHarness, {
      props: {
        Target: AdminTalkManager,
        targetProps: {
          initialAlbums: talkAlbums,
          role: 'admin',
          userId: 'admin-1'
        }
      }
    });

    expect(body).toContain('Pháp thoại');
    expect(body).toContain('Làm mới');
    expect(body).toContain('Tạo album');
    expect(body).toContain('admin-approval-tab');
    expect(body).toContain('Cần thêm track');
    expect(body).toContain('Album trống');
    expect(body).toContain('Thầy Minh Niệm');
    expect(body).toContain('Chưa có');
    expect(body).toContain('Google Drive');
  });

  it('renders the admin practice manager with the dedicated category and status controls', () => {
    const { body } = render(QueryTestHarness, {
      props: {
        Target: AdminPracticeManager,
        targetProps: {
          initialArticles: practiceArticles,
          role: 'admin',
          userId: 'admin-1'
        }
      }
    });

    expect(body).toContain('Nội dung tu tập');
    expect(body).toContain('Mở trang Tu tập');
    expect(body).toContain('Tạo bài tu tập');
    expect(body).toContain('Kinh Phật');
    expect(body).toContain('Nghi thức');
    expect(body).toContain('admin-approval-tab');
    expect(body).toContain('Danh sách bài tu tập');
  });

  it.each(['android', 'ios'])('keeps inventories and filters without content authoring in %s', (platform) => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true, getPlatform: () => platform });
    try {
      for (const [Target, targetProps] of [
        [AdminPracticeManager, { initialArticles: practiceArticles, role: 'admin', userId: 'admin-1' }],
        [AdminTalkManager, { initialAlbums: talkAlbums, role: 'admin', userId: 'admin-1' }],
      ] as const) {
        const { body } = render(QueryTestHarness, { props: { Target, targetProps } });
        expect(body).toContain('Làm mới');
        expect(body).toContain('<table');
        expect(body).not.toContain('Chỉnh sửa');
        expect(body).not.toContain('Tạo bài tu tập');
        expect(body).not.toContain('Tạo album');
        expect(body).not.toContain('Nhập dữ liệu');
      }
      const member = { kind: 'member' as const, accountType: 'member' as const, id: 'member', name: 'Thành viên', email: null, username: null, role: 'user' as const, status: 'active' as const, suspendedAt: null, avatarUrl: null, createdAt: null, updatedAt: null, isSelf: false };
      const { body } = render(AdminMemberManager, { props: { initialMembers: [
        member, { ...member, id: 'locked', status: 'suspended' },
        { ...member, id: 'admin', role: 'admin', accountType: 'admin' },
      ] } });
      expect(body).not.toContain('Chỉnh sửa');
      expect(body).not.toContain('Xoá');
      expect(body.match(/>\s*Khoá\s*</gu)).toHaveLength(1);
      expect(body.match(/>\s*Mở khoá\s*</gu)).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  });
});
