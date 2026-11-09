import { render } from 'svelte/server';
import { afterEach, expect, it, vi } from 'vitest';
import GuideConfirmModal from '../../../src/lib/components/guide/GuideConfirmModal.svelte';
import { guideConfirmState } from '../../../src/lib/components/guide/guide-confirm-store.svelte';

vi.mock('../../../src/lib/stores/locale.svelte', () => ({
  getLocaleContext: () => ({ current: 'vi', t: { guidePage: { confirmModal: {} } } }),
}));

afterEach(() => guideConfirmState.close());

it('releases the pending destination when the modal owner is destroyed', () => {
  guideConfirmState.open({ href: '/tu-tap?mode=le-phat', label: 'Lễ Phật', text: 'Nội dung đang chờ xác nhận' });
  const html = render(GuideConfirmModal).body;
  expect(html).toContain('Nội dung đang chờ xác nhận');
  // render() cũng kết thúc lifecycle của cây component, gọi cùng onDestroy như khi rời route.
  expect(guideConfirmState.isOpen).toBe(false);
  expect(guideConfirmState.item).toBeNull();
});

it('does not resurrect the old confirmation when the guide owner is created again', () => {
  guideConfirmState.open({ href: '/phap-thoai', label: 'Pháp thoại cũ', text: 'Bài cũ' });
  expect(render(GuideConfirmModal).body).toContain('Pháp thoại cũ');
  const revisited = render(GuideConfirmModal).body;
  expect(revisited).not.toContain('guide-confirm-scrim');
  expect(revisited).not.toContain('Pháp thoại cũ');
});
