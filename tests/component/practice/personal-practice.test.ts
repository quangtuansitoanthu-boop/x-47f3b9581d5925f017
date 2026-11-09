import { render } from 'svelte/server';
import { describe, expect, it, vi } from 'vitest';
import PersonalJournal from '../../../src/lib/components/practice/personal/PersonalJournal.svelte';
import PersonalPracticePanel from '../../../src/lib/components/practice/personal/PersonalPracticePanel.svelte';
import { createPersonalPracticeStorage } from '../../../src/lib/browser/personal-practice-storage';
vi.mock('../../../src/lib/stores/locale.svelte', () => ({ getLocaleContext: () => ({ current: 'vi' }) }));

function storage() {
  const values = new Map<string, string>();
  return createPersonalPracticeStorage({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }, 'test-principal');
}
describe('personal practice surfaces', () => {
  it('keeps private writing usable when no community submit capability is provided', () => {
    const html = render(PersonalJournal, { props: { storage: storage() } }).body;
    expect(html).toContain('Lưu riêng tư');
    expect(html).toContain('Chia sẻ cộng đồng chưa sẵn sàng');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Gửi cộng đồng sám hối/u);
    expect(html).toContain('phước đức to lớn ngang bằng');
    expect(html).not.toContain('Android/iOS');
  });
  it('renders reflection without a nested routine tab or changing stored data', () => {
    const owner = storage();
    const html = render(PersonalPracticePanel, { props: { storage: owner } }).body;
    expect(html).toContain('Nhìn lại lỗi lầm');
    expect(html).not.toContain('Khóa lễ');
    expect(html).not.toContain('Tạo thời khóa mới');
    expect(owner.getReflections()).toEqual([]);
    expect(owner.getRoutines()).toEqual([]);
  });
});
