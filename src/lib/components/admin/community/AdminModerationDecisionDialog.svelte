<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { adminModerationUi } from '$lib/i18n/admin-community-moderation';
  import type { ModerationDecision } from '$lib/contracts/community-moderation';
  interface Props {
    action: ModerationDecision['action']; locale: 'vi' | 'en'; busy: boolean; error: string; conflict: boolean;
    reason: string; onClose: () => void; onConfirm: () => void; onReload: () => void;
  }
  let { action, locale, busy, error, conflict, reason = $bindable(), onClose, onConfirm, onReload }: Props = $props();
  const t = $derived(adminModerationUi[locale]);
  const title = $derived(t[`${action}Title`]);
  const copy = $derived(t[`${action}Copy`]);
  function cancel(event: Event) { event.preventDefault(); if (!busy) onClose(); }
</script>

<dialog use:modalDialog class="admin-moderation-dialog" data-dialog-glass aria-labelledby="moderation-decision-title" oncancel={cancel}>
  <form onsubmit={(event) => { event.preventDefault(); if (!busy && !conflict) onConfirm(); }}>
    <h3 id="moderation-decision-title" tabindex="-1" data-modal-focus>{title}</h3>
    <p>{copy}</p>
    {#if action === 'reject'}
      <label for="moderation-reason">{t.reason}</label>
      <textarea id="moderation-reason" bind:value={reason} maxlength="1000" required disabled={busy}></textarea>
    {/if}
    {#if error}<p class="admin-moderation-error" role="alert">{error}</p>{/if}
    <footer class="dialog-actions-balanced">
      <button type="button" disabled={busy} onclick={onClose}>{t.cancel}</button>
      {#if conflict}<button type="button" onclick={onReload}>{t.reload}</button>
      {:else}<button type="submit" class="primary" disabled={busy}>{busy ? t.processing : t.confirm}</button>{/if}
    </footer>
  </form>
</dialog>
