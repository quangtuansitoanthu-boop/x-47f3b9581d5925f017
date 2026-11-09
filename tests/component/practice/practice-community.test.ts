import { existsSync, readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PracticeCampaigns from '../../../src/lib/components/practice/community/PracticeCampaigns.svelte';
import PracticeHeatmap from '../../../src/lib/components/practice/community/PracticeHeatmap.svelte';
import PracticeLeaderboard from '../../../src/lib/components/practice/community/PracticeLeaderboard.svelte';
import { buildPracticeHeatmap } from '../../../src/lib/domain/practice/progress-achievements';

describe('practice progress and community UI', () => {
  it('offers profile safety actions only for identifiable other members and preserves ranking metrics', () => {
    const member = {
      displayName: 'Tên đã duyệt', avatarUrl: '', selectedBadge: null, activeDays: 1,
      acceptedCount: 108, acceptedDurationSeconds: 600, currentStreak: 1, sessions: 2,
    };
    const body = render(PracticeLeaderboard, { props: {
      leaderboard: {
        generatedAt: '2026-11-04T00:00:00.000Z',
        metric: { key: 'accepted_count', windowDays: 30, description: 'Số biến hợp lệ' },
        ranking: [
          { ...member, rank: 1, authorId: 'public-other', isOwnProfile: false },
          { ...member, rank: 2, displayName: 'Hồ sơ của tôi', authorId: 'public-self', isOwnProfile: true },
          { ...member, rank: 3, displayName: 'Dữ liệu phiên bản cũ' },
        ],
      },
      presence: { enabled: true, activeCount: 1, practitioners: [{
        displayName: 'Người đang tu', activity: 'meditation', startedAt: null,
        authorId: 'public-live', isOwnProfile: false,
      }] },
    } as any }).body;
    expect(body).toContain('aria-label="Báo cáo hồ sơ Tên đã duyệt"');
    expect(body).toContain('aria-label="Chặn Tên đã duyệt"');
    expect(body).not.toContain('Người đang tu');
    expect(body).not.toContain('aria-label="Báo cáo hồ sơ Hồ sơ của tôi"');
    expect(body).not.toContain('aria-label="Chặn Hồ sơ của tôi"');
    expect(body).not.toContain('aria-label="Chặn Dữ liệu phiên bản cũ"');
    expect(body).toContain('Hồ sơ của tôi');
    expect(body).toContain('Dữ liệu phiên bản cũ');
    expect(body).toContain('108');
    expect(body).toContain('biến hợp lệ');
  });
  it('renders a complete timezone-labelled 365-day journal with non-color marks', () => {
    const days = buildPracticeHeatmap([{
      acceptedCount: 108,
      acceptedDurationSeconds: 1_200,
      date: '2026-09-04',
      sessionCount: 1,
    }], '2026-09-04');
    const body = render(PracticeHeatmap, { props: { days, timeZone: 'Asia/Ho_Chi_Minh' } }).body;

    expect(body).toContain('Nhật lịch 365 ngày');
    expect(body).toContain('Asia/Ho_Chi_Minh');
    expect(body).not.toContain('role="grid"');
    expect(body).not.toContain('role="gridcell"');
    expect(body).toContain('Chi tiết từng ngày');
    expect(body).toContain('aria-label="Chi tiết nhật lịch theo ngày"');
    expect(body.match(/<th scope="row"/gu)).toHaveLength(365);
    expect(body).toContain('04/09/2026');
    expect(body).toContain('05/09/2025');
    expect(body.match(/tabindex="0"/gu)).toHaveLength(2);
    expect(body).toContain('✓');
    expect(body).toContain('·');
    expect(body).toContain('108 biến');
  });

  it('renders the server-described ranking metric with accepted counts and sessions', () => {
    const description = 'Xếp theo số biến công phu hợp lệ trong cửa sổ kiểm thử.';
    const body = render(PracticeLeaderboard, {
      props: {
        leaderboard: {
          generatedAt: '2026-09-04T00:00:00.000Z',
          metric: { key: 'accepted_count', windowDays: 30, description },
          ranking: [{
            rank: 1,
            displayName: 'Phật tử An',
            avatarUrl: '',
            selectedBadge: 'streak-7',
            activeDays: 4,
            acceptedCount: 12_345,
            acceptedDurationSeconds: 3_600,
            currentStreak: 3,
            sessions: 8,
          }],
        },
      },
    }).body;

    expect(body).toContain(description);
    expect(body).toContain('12.345');
    expect(body).toContain('biến hợp lệ');
    expect(body).toMatch(/<b[^>]*>8<\/b><small[^>]*>phiên<\/small>/u);
    expect(body).not.toContain('active_days');
  });

  it('shows campaign contribution and the principal-specific join state', () => {
    const body = render(PracticeCampaigns, {
      props: {
        campaigns: [{
          id: 'goal-1',
          title: '21 ngày cùng tinh tấn',
          description: 'Cùng nhau duy trì công phu.',
          metric: 'sessions',
          goalValue: 100,
          contributionValue: 42,
          memberCount: 12,
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-09-30T23:59:59.000Z',
          status: 'active',
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          joined: true,
        }],
        onMembership: () => undefined,
      },
    }).body;

    expect(body).toContain('21 ngày cùng tinh tấn');
    expect(body).toContain('42');
    expect(body).toContain('Đã tham gia');
    expect(body).toContain('Rời chiến dịch');
    expect(body).toContain('id="practice-campaign-title-goal-1"');
    expect(body).toContain('aria-labelledby="practice-campaign-title-goal-1"');
    expect(body).toContain('aria-valuetext="42 trên 100 phiên"');
  });

  it('offers campaign aggregates to guests without enabling a membership mutation', () => {
    const body = render(PracticeCampaigns, {
      props: {
        authenticated: false,
        campaigns: [{
          id: 'goal-public', title: 'Mục tiêu công khai', description: '', metric: 'sessions',
          goalValue: 100, contributionValue: 42, memberCount: 12,
          startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-30T23:59:59.000Z',
          status: 'active', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
          joined: false,
        }],
        onMembership: () => undefined,
      },
    }).body;
    expect(body).toContain('Mục tiêu công khai');
    expect(body).toContain('Đăng nhập để tham gia');
  });

  it('provides an honest empty state in the daily detail table', () => {
    const body = render(PracticeHeatmap, { props: { days: [], timeZone: 'Asia/Ho_Chi_Minh' } }).body;

    expect(body).toContain('Chi tiết từng ngày');
    expect(body).toContain('Chưa có dữ liệu nhật lịch.');
    expect(body).not.toContain('<th scope="row"');
  });

  it('keeps private/admin routing, privacy controls and practice presence discoverable', () => {
    const dashboard = readFileSync('src/lib/components/practice/community/PracticeProgressDashboard.svelte', 'utf8');
    const privateLoaderPath = existsSync('src/routes/tien-do-tu-tap/+page.server.ts')
      ? 'src/routes/tien-do-tu-tap/+page.server.ts'
      : 'src/routes/tien-do-tu-tap/+page.ts';
    const privateLoader = readFileSync(privateLoaderPath, 'utf8');
    const admin = readFileSync('src/lib/components/admin/practice/AdminPracticeCampaigns.svelte', 'utf8');
    const practicePage = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    const sessionStatus = readFileSync('src/lib/components/auth/SessionStatus.svelte', 'utf8');

    const guestBoundary = privateLoader.indexOf('progress: null');
    expect(guestBoundary).toBeGreaterThan(0);
    expect(privateLoader).not.toContain('/api/practice/progress');
    expect(dashboard).toContain('serverStateKeys.practiceCommunity.progress(user.id)');
    expect(dashboard).toContain('fetchPracticeProgress(fetchWithSessionRefresh, signal)');
    expect(privateLoader).not.toContain('setHeaders');

    const rootLoader = readFileSync('src/routes/+layout.server.ts', 'utf8');
    const hooks = readFileSync('src/hooks.server.ts', 'utf8');
    const adminLoader = readFileSync('src/routes/admin/practice/+page.ts', 'utf8');
    expect(rootLoader).toContain('publicSession(locals.session ?? null)');
    expect(hooks).toContain("if (event.locals.session) response.headers.set('Cache-Control', 'private, no-store')");
    expect(adminLoader).toContain('/api/practice/campaigns?includeDrafts=1');
    expect(dashboard).toContain('leaderboardOptIn');
    expect(dashboard).not.toContain('presenceOptIn');
    expect(dashboard).toContain('selectedBadge');
    expect(dashboard).toContain('@media(prefers-reduced-motion:reduce)');
    expect(admin).toContain('{member.displayName}');
    expect(admin).toContain('!member.identityVisible');
    expect(admin).toContain('campaign-anonymous-badge');
    expect(practicePage).toContain('setPracticePresence(activity ?');
    expect(sessionStatus).toContain('href="/tien-do-tu-tap"');
    expect(sessionStatus).not.toContain('href="/admin/practice"');
    expect(readFileSync('src/lib/components/admin/layout/AdminSidebar.svelte', 'utf8')).toContain("href: '/admin/practice'");
    expect(sessionStatus).not.toContain("localStorage.getItem('tt_practice_logs_v1')");
  });
});
