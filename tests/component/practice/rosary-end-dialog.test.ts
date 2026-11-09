import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import { translations } from '../../../src/lib/i18n/translations';
const locale = vi.hoisted(() => ({ current: 'vi' as 'vi' | 'en' }));
vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ get current() { return locale.current; }, get t() { return translations[locale.current]; } }) }));
import RosaryEndDialog from '../../../src/lib/components/practice/dialog/RosaryEndDialog.svelte';

describe('approved rosary end dialog', () => {
  it.each(['vi', 'en'] as const)('keeps the confirmation heading hidden and preserves counts on save error (%s)', language => {
    locale.current = language;
    const html = render(RosaryEndDialog, { props: { count: 324, phrase: 'Nam mô A Di Đà Phật', completed: false, error: 'Save failed', onCancel() {}, onConfirm() {}, onClose() {} } }).body;
    expect(html).not.toContain('<h2');
    expect(html).toContain('324');
    expect(html).toContain('Nam mô A Di Đà Phật');
    expect(html).toContain('role="alert"');
    expect(html).toContain(language === 'vi' ? 'Chốt sổ và thoát' : 'Save and leave');
  });
  it('shows the zero-count result with one close action and no claim that a log was saved', () => {
    locale.current = 'vi';
    const html = render(RosaryEndDialog, { props: { count: 0, phrase: '', completed: true, error: '', onCancel() {}, onConfirm() {}, onClose() {} } }).body;
    expect(html).toContain('Phiên này chưa có biến niệm để ghi sổ.');
    expect(html).not.toContain('Đã chốt sổ công phu của phiên này.');
    expect((html.match(/<button\b/g) ?? [])).toHaveLength(1);
  });
});
