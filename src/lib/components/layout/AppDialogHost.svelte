<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { appDialogState, cancelAppDialogs, registerAppDialogHost, resolveAppDialog } from '$lib/browser/app-dialog';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { appDialogText } from '$lib/i18n/app-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

  const locale = getLocaleContext();
  const text = $derived(appDialogText[locale.current]);
  let promptValue = $state('');
  $effect(() => { promptValue = $appDialogState?.defaultValue ?? ''; });
  function selectPromptInput(input: HTMLInputElement) {
    let disposed = false;
    void tick().then(() => { if (!disposed && input.isConnected) input.select(); });
    return { destroy() { disposed = true; } };
  }
  onMount(() => {
    const unregister = registerAppDialogHost();
    const identity = () => {
      const session = getBrowserSessionSnapshot();
      return JSON.stringify(session.authenticated ? [session.user?.id ?? null, session.user?.role ?? 'guest'] : [null, 'guest']);
    };
    let principal = identity();
    let disposed = false;
    // Root đăng ký session trong cùng lượt mount, trước khi người dùng thao tác.
    void tick().then(() => { if (!disposed) principal = identity(); });
    const handleSessionChange = () => {
      const next = identity();
      if (next !== principal) { principal = next; cancelAppDialogs(); }
    };
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
    return () => {
      disposed = true;
      window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange);
      unregister();
    };
  });
</script>

{#if $appDialogState}
  {#key $appDialogState.id}
    {@const request = $appDialogState}
    <dialog
      use:modalDialog
      class="app-dialog"
      class:personal-event-dialog={request.presentation === 'personal-event'}
      data-dialog-glass={request.presentation === 'personal-event' ? undefined : ''}
      data-app-message
      aria-labelledby="app-dialog-title"
      aria-describedby="app-dialog-message"
      oncancel={(event) => { event.preventDefault(); resolveAppDialog(request.id, false); }}
      onkeydown={(event) => event.stopPropagation()}
    >
      <h2 id="app-dialog-title">{request.title ?? (request.kind === 'alert' ? text.alertTitle : text.confirmTitle)}</h2>
      <p id="app-dialog-message">{request.message}</p>
      {#if request.kind === 'prompt'}
        <input
          class="app-dialog-input"
          aria-labelledby="app-dialog-message"
          data-modal-focus
          bind:value={promptValue}
          use:selectPromptInput
          onkeydown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); resolveAppDialog(request.id, promptValue); }
          }}
        />
      {/if}
      <div class="app-dialog-actions" class:dialog-actions-balanced={request.kind !== 'alert'}>
        {#if request.kind !== 'alert'}
          <button type="button" data-modal-focus={request.kind === 'confirm' ? '' : undefined} onclick={() => resolveAppDialog(request.id, false)}>{text.cancel}</button>
          <button type="button" class="primary" onclick={() => resolveAppDialog(request.id, request.kind === 'prompt' ? promptValue : true)}>{text.confirm}</button>
        {:else}
          <button type="button" class="primary" data-modal-focus onclick={() => resolveAppDialog(request.id, true)}>{text.close}</button>
        {/if}
      </div>
    </dialog>
  {/key}
{/if}

<style>
  .app-dialog {
    width: min(var(--dialog-compact-width), calc(100% - var(--space-page) * 2));
    max-height: calc(100dvh - var(--space-page) * 2 - env(safe-area-inset-top) - env(safe-area-inset-bottom));
    margin: auto;
    padding: var(--space-page);
    overflow: auto;
    border: 1px solid var(--dialog-surface-border, var(--border));
    border-radius: var(--radius-card);
    background: var(--dialog-surface-background, var(--card));
    color: var(--text);
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    font: inherit;
  }
  .app-dialog::backdrop { background: var(--practice-dialog-backdrop); }
  .app-dialog h2 { margin: 0; font-size: var(--font-size-dialog-title); }
  .app-dialog p { margin: var(--dialog-action-space) 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .app-dialog-actions { display: flex; justify-content: flex-end; gap: var(--dialog-action-gap); }
  .app-dialog-input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 44px;
    margin-bottom: var(--dialog-action-space);
    padding: calc(var(--dialog-action-space) / 2);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg2);
    color: var(--text);
    font: inherit;
    font-size: var(--font-size-input);
  }
  .app-dialog-actions button {
    min-width: 44px;
    min-height: 44px;
    padding: calc(var(--dialog-action-space) / 2) var(--dialog-action-space);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    background: var(--bg2);
    color: var(--text);
    font: inherit;
    cursor: pointer;
    overflow-wrap: anywhere;
  }
  .app-dialog-actions button.primary { background: var(--gold); color: var(--on-gold); }
  .app-dialog.personal-event-dialog { background: var(--card); border-color: var(--border); text-align: center; }
  .personal-event-dialog p { color: var(--text2); font-size: var(--font-size-body); line-height: 1.6; }
  .personal-event-dialog .app-dialog-actions button { width: 100%; min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); font-weight: 600; }
</style>
