import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import RosaryScreen from '../../../src/lib/components/practice/rosary/RosaryScreen.svelte';
import { ROSARY_PHRASES } from '../../../src/lib/domain/practice/guided-sessions';

vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));

const props = {
  count: 0, dailyGoal: 1000 as const, direction: 'down' as const, open: true,
  phrase: 'Tùy chọn', progress: 0, sessionCount: 0, size: 108 as const, soundEnabled: false,
  onDailyGoalChange() {}, onDirectionChange() {}, onDelta() {}, onExitRequest() {},
  onPhraseChange() {}, onResetRequest() {}, onSizeChange() {}, onSoundToggle() {},
};

describe('rosary custom phrase controls', () => {
  it('locks manual input and phrase editing while an automatic session is paused', () => {
    const html = render(RosaryScreen, { props: {
      ...props, phrase: ROSARY_PHRASES[0], onAutoStart() {},
      autoState: { count: 12, target: 108, playing: false, completed: false, error: '' },
    } }).body;
    expect(html).toContain('12/108');
    expect(html).toContain('Đã tạm dừng');
    expect(html).toContain('Tiếp tục');
    expect(html).toMatch(/id="tt-rosary-options"[^>]*>\s*<div inert/u);
    expect(html).toMatch(/class="tt-rosary__auto-target[^>]*inert/u);
    expect(html).not.toMatch(/class="tt-rosary__auto-tempo[^>]*inert/u);
    expect(html).toMatch(/class="tt-rosary__swipe[^>]*aria-disabled="true"/u);
    expect(html).not.toContain('>Niệm một hạt</button>');
  });

  it('shows the selected automatic tempo with existing picker controls and no platform guidance', () => {
    const html = render(RosaryScreen, { props: {
      ...props, phrase: ROSARY_PHRASES[0], onAutoStart() {}, autoBusy: true,
    } }).body;
    expect(html).toContain('Đang chuẩn bị nhịp mõ');
    expect(html).toContain('Vừa · 60 nhịp/phút');
    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('Android/iOS');
  });

  it.each([
    { count: 28, sessionCount: 0, position: 28, cycles: 0 },
    { count: 29, sessionCount: 1, position: 29, cycles: 0 },
    { count: 115, sessionCount: 0, position: 7, cycles: 1 },
  ])('keeps the persisted daily cycle position after reopening: $count beads', ({ count, sessionCount, position, cycles }) => {
    const html = render(RosaryScreen, { props: {
      ...props, phrase: ROSARY_PHRASES[0], count, sessionCount,
    } }).body;
    const text = html.replace(/<[^>]+>/gu, '');
    expect(text).toContain(`${position}/108`);
    expect(text).toContain(`${cycles} chuỗi hoàn tất`);
  });

  it('renders the owner draft and selected practice type instead of a private draft', () => {
    const html = render(RosaryScreen, { props: { ...props, customText: 'Ôm ma ni', customType: 'Trì chú' } }).body;
    expect(html).toMatch(/value="Ôm ma ni"/u);
    expect(html).toMatch(/checked[^>]*>\s*<span[^>]*>Trì chú/u);
  });

  it.each(['Tùy chọn', 'custom:missing'])('disables counting for an unsaved or missing phrase: %s', (phrase) => {
    const html = render(RosaryScreen, { props: { ...props, phrase } }).body;
    expect(html).toContain('Chưa có danh hiệu hợp lệ để lần hạt.');
    expect(html).toContain('Lưu vào danh sách lựa chọn');
    expect(html).toContain('aria-describedby="tt-rosary-phrase"');
    expect(html).toMatch(/class="tt-rosary__count-button[^"]*"[^>]*disabled/u);
    expect(html).toMatch(/class="tt-rosary__swipe[^"]*"[^>]*aria-disabled="true"/u);
  });

  it('keeps counting available for a traditional phrase and a saved custom phrase', () => {
    const customPhrases = [{ id: 'cp_1730000000000_saved', text: 'Ôm ma ni', type: 'Trì chú' as const, createdAt: '2026-10-31T00:00:00Z' }];
    for (const phrase of [ROSARY_PHRASES[0], 'custom:cp_1730000000000_saved']) {
      const html = render(RosaryScreen, { props: { ...props, phrase, customPhrases } }).body;
      expect(html).not.toMatch(/class="tt-rosary__count-button[^"]*"[^>]*disabled/u);
    }
  });

  it('disables a saved entry whose corrupted practice type fails domain validation', () => {
    const customPhrases = [{ id: 'cp_1730000000000_bad', text: 'Ôm ma ni', type: 'invalid' as 'Trì chú' }];
    const html = render(RosaryScreen, { props: { ...props, phrase: 'custom:cp_1730000000000_bad', customPhrases } }).body;
    expect(html).toMatch(/class="tt-rosary__count-button[^"]*"[^>]*disabled/u);
    expect(html).toMatch(/class="tt-rosary__swipe[^"]*"[^>]*aria-disabled="true"/u);
  });
});
