import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { translations } from '../../src/lib/i18n/translations';
import CommentsPanel from '../../src/lib/components/comments/CommentsPanel.svelte';
import WeeklyLunarStrip from '../../src/lib/components/home/WeeklyLunarStrip.svelte';
import BuddhistDailyArtCard from '../../src/lib/components/home/BuddhistDailyArtCard.svelte';
import AudioResumePrompt from '../../src/lib/components/audio/AudioResumePrompt.svelte';
import { buildDayDetail, buildMonthCalendar, buildWeekCalendar } from '../../src/lib/components/lunar/lunar-week';

vi.mock('$lib/stores/locale.svelte', () => ({
  getLocaleContext: () => ({ current: 'en', t: translations.en }),
}));

describe('English user interface', () => {
  it('offers to resume listening in English while preserving the track title', () => {
    const html = render(AudioResumePrompt, { props: {
      trackTitle: 'Bài giảng', positionSeconds: 125, visible: true,
      onStartOver: () => {}, onResume: () => {}, onClose: () => {},
    } }).body;
    expect(html).toContain('Bài giảng');
    expect(html).toContain('Stopped at');
    expect(html).toContain('2:05');
    expect(html).toContain('Start from beginning');
    expect(html).toContain('Resume ▶');
    expect(html).not.toMatch(/Đang nghe dở|Đến phút|Bạn có muốn/);
  });
  it('renders comment controls and the sign-in prompt in English', () => {
    const html = render(CommentsPanel, { props: { articleId: 'test' } }).body;
    expect(html).toContain('Comments &amp; Feedback');
    expect(html).toContain('Loading comments...');
    expect(html).toContain('Sign in to comment');
    expect(html).toContain('Choose a sign-in method');
    expect(html).toContain('aria-label="Write a comment"');
    expect(html).not.toMatch(/Bình luận|Đăng nhập|Gửi bình luận|Thành viên/);
  });

  it('renders calendar navigation and cyclical dates in English', () => {
    const date = new Date(2026, 9, 22);
    const strip = render(WeeklyLunarStrip, { props: { selectedDate: date } }).body;
    const card = render(BuddhistDailyArtCard, { props: { currentDate: date } }).body;
    expect(strip).toContain('View month');
    expect(strip).not.toMatch(/Xem lịch|Thu gọn|Tháng/);
    expect(card).toContain('Fire Horse');
    expect(card).not.toMatch(/Bính Ngọ|Tháng|Ngày âm lịch/);
    for (const calendar of [buildWeekCalendar(date, date, 'en'), buildMonthCalendar(date, date, 'en')]) {
      for (const day of calendar.days) {
        const detail = buildDayDetail(day, 'en');
        expect(detail.solarWeekday).toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
        expect(detail.dayCanChiName).not.toMatch(/[À-ỹ]/);
        expect(detail.lunarYearCanChi).not.toMatch(/[À-ỹ]/);
      }
    }
  });
});
