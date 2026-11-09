import { render } from 'svelte/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PracticeProgressDashboard from '../../../src/lib/components/practice/community/PracticeProgressDashboard.svelte';
import { translations } from '../../../src/lib/i18n/translations';
import type { PracticeProgressData } from '../../../src/lib/browser/practice-community';

const context = vi.hoisted(() => ({
  language: 'vi' as 'vi' | 'en',
  albums: [{ id: 'pt_drive_known', tieu_de: 'Bài pháp đã có trong thư viện' }],
}));

vi.mock('../../../src/lib/stores/locale.svelte', () => ({
  getLocaleContext: () => ({ get current() { return context.language; }, get t() { return translations[context.language]; } }),
}));
vi.mock('../../../src/lib/stores/session.svelte', () => ({
  SESSION_CHANGE_EVENT: 'quangtu:session-changed',
  getSessionContext: () => ({ value: { authenticated: true, user: { id: 'dashboard-test', role: 'user' } } }),
  getBrowserSessionSnapshot: () => ({ authenticated: true, user: { id: 'dashboard-test', role: 'user' } }),
}));
vi.mock('@tanstack/svelte-query', () => ({
  // SSR receives the existing route data and cached catalog; query functions are never executed.
  createQuery: (options: () => { queryKey: readonly unknown[]; initialData?: unknown }) => {
    const current = options();
    return { data: current.queryKey[0] === 'talks' ? context.albums : current.initialData, error: null };
  },
  createMutation: () => ({ isPending: false, variables: undefined }),
  useQueryClient: () => ({}),
}));

function progress(): PracticeProgressData {
  const row = { sourceKind: 'manual_log', sessionCount: 1, acceptedDurationSeconds: 0 };
  return {
    profile: { leaderboardOptIn: false, presenceOptIn: false, selectedBadge: null, timeZone: 'Asia/Ho_Chi_Minh' },
    heatmap: [], streaks: { current: 1, longest: 1 }, badges: [],
    totals: { acceptedCount: 310, acceptedDurationSeconds: 60, sessions: 6 },
    today: '2026-11-08',
    breakdown: [
      { ...row, activityType: 'rosary', sourceId: 'completed-tool:Lễ Phật', acceptedCount: 195 },
      { ...row, activityType: 'scripture', sourceId: 'completed-tool:Chép kinh', acceptedCount: 2 },
      { ...row, activityType: 'rosary', sourceId: 'completed-tool:Chép danh hiệu', acceptedCount: 108 },
      { ...row, activityType: 'scripture', sourceKind: 'article', sourceId: 'tt_1781742129070', title: 'tt_1781742129070', acceptedCount: 1 },
      { ...row, activityType: 'scripture', sourceKind: 'article', sourceId: 'tt_1781742129071', title: 'NGHI THỨC TỤNG KINH', acceptedCount: 3 },
      { ...row, activityType: 'dharma_talk', sourceKind: 'audio', sourceId: 'pt_drive_known:0', title: 'pt_drive_known:0', acceptedCount: 1, acceptedDurationSeconds: 60 },
    ],
  };
}

function dashboard(initialProgress: PracticeProgressData): string {
  return render(PracticeProgressDashboard, { props: {
    initialProgress,
    initialCampaigns: { enabled: false, campaigns: [] },
    initialLeaderboard: { enabled: false, generatedAt: '2026-11-08T06:00:00Z', metric: { key: 'accepted_count', windowDays: 30, description: 'Test metric' }, ranking: [] },
    user: { id: 'dashboard-test', email: 'test@example.invalid', displayName: 'Người kiểm thử', avatarUrl: '', role: 'user' },
  } }).body;
}

function table(html: string, label: string): string {
  const result = html.match(new RegExp(`<table\\b[^>]*aria-label="${label}"[^>]*>[\\s\\S]*?<\\/table>`, 'u'));
  expect(result, `Rendered table ${label}`).not.toBeNull();
  return result![0];
}

beforeEach(() => { context.language = 'vi'; });

describe('practice progress dashboard names and quantities', () => {
  it('removes live presence controls while retaining actual practice totals and history', () => {
    const html = dashboard(progress());
    expect(html).not.toContain('practice-live');
    expect(html).not.toContain('Chia sẻ hiện diện');
    expect(html).not.toContain('Đang cùng tu tập');
    expect(html).toContain('Tiến độ tu tập');
    expect(html).toContain('Chi tiết');
  });
  it.each([1, 2])('uses count-aware English labels without changing table headings (%s)', count => {
    context.language = 'en';
    const data = progress();
    data.streaks = { current: count, longest: count };
    data.totals.acceptedDurationSeconds = count * 60;
    data.breakdown = data.breakdown.slice(0, 3).map(row => ({ ...row, acceptedCount: count }));
    const before = JSON.stringify(data);
    const html = dashboard(data);
    expect(html).toContain(`${count} ${count === 1 ? 'day' : 'days'}</dd>`);
    expect(html).toContain(`${count} ${count === 1 ? 'min' : 'mins'}`);
    expect(html).toContain(`${count} ${count === 1 ? 'prostration' : 'prostrations'}`);
    expect(html).toContain(`${count} ${count === 1 ? 'session' : 'sessions'}`);
    expect(html).toContain(`${count} ${count === 1 ? 'phrase' : 'phrases'}`);
    expect(table(html, 'Details for Prostrations')).toContain('Prostrations');
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each([3600, 7200])('uses the correct whole-hour label (%s seconds)', seconds => {
    context.language = 'en';
    const data = progress();
    data.totals.acceptedDurationSeconds = seconds;
    expect(dashboard(data)).toContain(`${seconds / 3600} ${seconds === 3600 ? 'hour' : 'hours'}`);
  });
  it('never renders custom selection keys as practice names and keeps recorded counts', () => {
    const data = progress();
    data.breakdown = [{ activityType: 'rosary', sourceKind: 'guided_rosary', sourceId: 'custom:cp_1793419040777_wjlpf', title: 'custom:cp_1793419040777_wjlpf', acceptedCount: 7, acceptedDurationSeconds: 0, sessionCount: 2 }];
    const before = JSON.stringify(data);
    const html = dashboard(data);
    expect(html).not.toContain('custom:cp_');
    expect(table(html, 'Chi tiết Niệm danh hiệu')).toMatch(/>7<\/td>/u);
    expect(JSON.stringify(data)).toBe(before);
  });
  it.each(['vi', 'en'] as const)('renders actual completed-tool groups with their own units and preserves all saved counts (%s)', language => {
    context.language = language;
    const data = progress();
    const before = JSON.stringify(data);
    const html = dashboard(data);
    const english = language === 'en';
    const prefix = english ? 'Details for ' : 'Chi tiết ';
    const prostrations = table(html, prefix + (english ? 'Prostrations' : 'Lễ Phật'));
    const copies = table(html, prefix + (english ? 'Scripture Transcription' : 'Chép kinh'));
    const names = table(html, prefix + (english ? 'Name Transcription' : 'Chép danh hiệu'));

    expect(prostrations).toContain(english ? 'Prostrations' : 'Số lạy');
    expect(prostrations).toMatch(/>195<\/td>/u);
    expect(prostrations).not.toContain(english ? 'Counts' : 'Số biến');
    expect(copies).toContain(english ? 'Completions' : 'Số lượt');
    expect(copies).toMatch(/>2<\/td>/u);
    expect(names).toContain(english ? 'Phrases' : 'Số câu');
    expect(names).toMatch(/>108<\/td>/u);
    expect(html).toContain(english ? '195 prostrations' : '195 lạy');
    expect(html).toContain(english ? '2 sessions' : '2 lượt');
    expect(html).toContain(english ? '108 phrases' : '108 câu');
    expect(JSON.stringify(data)).toBe(before);
  });

  it('renders saved titles or existing catalog names, and a readable fallback when the original name is missing', () => {
    const html = dashboard(progress());
    expect(html).toContain('NGHI THỨC TỤNG KINH');
    expect(html).toContain('Bài pháp đã có trong thư viện');
    expect(html).toContain('NIỆM DANH HIỆU CÁC VỊ PHẬT BỒ TÁT');
    expect(table(html, 'Chi tiết Tụng kinh / Thọ giới')).toContain('Tụng kinh / Thọ giới');
    for (const id of ['tt_1781742129070', 'tt_1781742129071', 'completed-tool:', 'pt_drive_known']) expect(html).not.toContain(id);
  });

  it('uses additive legacy practice metadata without reclassifying ordinary recitation names', () => {
    const data = progress();
    data.breakdown = [
      { activityType: 'rosary', sourceKind: 'legacy_import', sourceId: 'Lễ Phật — A Di Đà', practiceType: 'Lễ Phật', acceptedCount: 9, acceptedDurationSeconds: 0, sessionCount: 1 },
      { activityType: 'rosary', sourceKind: 'guided_rosary', sourceId: 'Nam mô A Di Đà Phật', acceptedCount: 108, acceptedDurationSeconds: 0, sessionCount: 1 },
    ];
    const html = dashboard(data);
    expect(table(html, 'Chi tiết Lễ Phật')).toMatch(/>9<\/td>/u);
    const recitations = table(html, 'Chi tiết Niệm danh hiệu');
    expect(recitations).toContain('Nam mô A Di Đà Phật');
    expect(recitations).toMatch(/>108<\/td>/u);
    expect(recitations).not.toContain('Số lạy');
  });
});
