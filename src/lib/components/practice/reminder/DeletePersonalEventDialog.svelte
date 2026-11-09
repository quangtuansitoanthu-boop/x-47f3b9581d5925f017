<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getPersonalEventTypeName, type PersonalLunarEvent } from '$lib/browser/personal-lunar-events';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

  let { event, isEn, onCancel, onConfirm }: {
    event: PersonalLunarEvent | null;
    isEn: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  } = $props();

  const principal = () => {
    const session = getBrowserSessionSnapshot();
    return session.authenticated && session.user?.id ? String(session.user.id) : null;
  };
  let deleteOwner: string | null | undefined;
  let invalidated = false;
  $effect(() => {
    const target = event;
    deleteOwner = target ? untrack(principal) : undefined;
    invalidated = false;
  });

  function current(): boolean {
    if (!event || invalidated) return false;
    if (deleteOwner === principal()) return true;
    // Xác nhận cũ không được xóa dữ liệu của tài khoản vừa chuyển sang.
    invalidated = true;
    onCancel();
    return false;
  }
  function confirm(): void {
    if (current()) onConfirm();
  }
  onMount(() => {
    const sessionChanged = () => { current(); };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
  });
</script>

{#if event}
  <dialog use:modalDialog class="anniversary-delete-dialog" data-dialog-glass aria-labelledby="anniversary-delete-title"
    aria-describedby="anniversary-delete-description"
    oncancel={(e) => { e.preventDefault(); onCancel(); }}>
    <h2 id="anniversary-delete-title">{isEn ? 'Delete anniversary?' : 'Xóa lịch cá nhân?'}</h2>
    <p id="anniversary-delete-description">
      {isEn ? 'Delete' : 'Bạn có muốn xóa'} “{event.title.trim() || getPersonalEventTypeName(event.type, isEn)}”?
      {isEn ? 'This cannot be undone.' : 'Thao tác này không thể hoàn tác.'}
    </p>
    <div class="actions dialog-actions-balanced">
      <button type="button" data-modal-focus onclick={onCancel}>{isEn ? 'Keep anniversary' : 'Giữ lại'}</button>
      <button type="button" class="delete" onclick={confirm}>{isEn ? 'Delete anniversary' : 'Xóa lịch'}</button>
    </div>
  </dialog>
{/if}

<style>
  dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:calc(100% - 32px);max-width:360px;max-height:calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));overflow:auto;padding:24px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:22px;background:var(--dialog-surface-background,var(--card));color:var(--text);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  dialog::backdrop{background:#17120c66;backdrop-filter:blur(4px)}
  h2{margin:0 0 12px;font-size:20px;line-height:1.4}
  p{margin:0;color:var(--muted);font-size:15px;line-height:1.7;overflow-wrap:anywhere}
  .actions{display:flex;gap:10px;margin-top:24px}
  button{flex:1;min-width:0;min-height:46px;padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);color:var(--text);font:inherit;font-size:14px;font-weight:700;cursor:pointer}
  button:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
  .delete{background:#ad3939;border-color:#ad3939;color:#fff}
</style>
