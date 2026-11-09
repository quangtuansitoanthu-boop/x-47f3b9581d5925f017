// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import AdminMemberSuspendDialog from '../../src/lib/components/admin/members/AdminMemberSuspendDialog.svelte';
import { dismissTopModal } from '../../src/lib/browser/modal-dialog';
import type { AdminMember } from '../../src/lib/components/admin/members/admin-member-types';

const member: AdminMember = {
  kind: 'member', accountType: 'member', id: 'member-1', name: 'Thành viên', role: 'user',
  status: 'active', isSelf: false, email: null, username: null, suspendedAt: null,
  avatarUrl: null, createdAt: null, updatedAt: null,
};
let view: ReturnType<typeof AdminMemberSuspendDialog> | undefined;
const originalShow = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
afterEach(async () => {
  if (view) await unmount(view);
  view = undefined;
  for (const [name, original] of [['showModal', originalShow], ['close', originalClose]] as const) {
    if (original) Object.defineProperty(HTMLDialogElement.prototype, name, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
  document.body.innerHTML = '';
});

it.each([false, true])('uses the shared Back stack and protects a pending suspension (busy=%s)', async busy => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } });
  const onClose = vi.fn();
  view = mount(AdminMemberSuspendDialog, { target: document.body, props: {
    member, targetStatus: 'suspended', busy, onClose, onConfirm: vi.fn(),
  } });
  for (let index = 0; index < 5; index++) { await Promise.resolve(); flushSync(); }
  expect(document.querySelector('dialog[aria-labelledby="suspend-dialog-title"]')).not.toBeNull();
  expect(dismissTopModal()).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(busy ? 0 : 1);
});
