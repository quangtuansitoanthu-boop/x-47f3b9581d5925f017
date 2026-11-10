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
  <dialog use:modalDialog class="anniversary-delete-dialog" aria-labelledby="anniversary-delete-title"
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
  dialog{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(var(--dialog-compact-width),calc(100% - var(--space-page) * 2));max-height:calc(100dvh - var(--space-page) * 2 - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));overflow:auto;padding:var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--card);color:var(--text);box-shadow:var(--shadow-xl);text-align:center}
  dialog::backdrop{background:var(--practice-dialog-backdrop)}
  h2{margin:0 0 var(--dialog-action-space);font-size:var(--font-size-dialog-title);line-height:1.4}
  p{margin:0;color:var(--text2);font-size:var(--font-size-body);line-height:1.6;overflow-wrap:anywhere}
  .actions{display:flex;gap:var(--dialog-action-gap);margin-top:var(--space-page)}
  button{flex:1;min-width:0;min-height:calc(var(--touch-target-size) + var(--dialog-action-gap) / 2);padding:var(--dialog-action-gap);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);font:inherit;font-size:var(--font-size-body);font-weight:600;cursor:pointer}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .delete{background:var(--gold);border-color:var(--gold);color:var(--on-gold)}
</style>
