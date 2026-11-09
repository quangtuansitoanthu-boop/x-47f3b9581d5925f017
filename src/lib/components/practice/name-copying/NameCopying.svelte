<script lang="ts">
  import { recordCompletedNameCopyingRound } from '$lib/browser/name-copying-storage';
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { createInterfaceTranslator } from '$lib/i18n/copying-interface';
  import { NAME_COPYING_PHRASES, NAME_COPYING_ROUND_SIZE, matchesNameCopyingPhrase, type NameCopyingPhrase } from '$lib/domain/practice/name-copying';
  import { NAME_COPYING_COPY as copy } from '$lib/domain/practice/name-copying-copy';
  import { createNameCopyingDraft, readNameCopyingDraft, saveNameCopyingDraft, completeNameCopyingRound, nameCopyingTotal, completeNameCopyingSession, resetNameCopyingData, type NameCopyingDraft } from '$lib/browser/name-copying-storage';
  import PracticeConfirmDialog from '$lib/components/practice/dialog/PracticeConfirmDialog.svelte';

  let { principal }: { principal: string | null } = $props();
  const t = createInterfaceTranslator();
  const localeStore = getLocaleContext();
  let draft = $state(createNameCopyingDraft());
  let ready = $state(false);
  let storageBlocked = $state(false);
  let notice = $state('');
  let saveError = $state(false);
  const inputs: HTMLInputElement[] = [];
  let composing = false;
  let roundNotice = $state('');
  let showCompleteConfirm = $state(false);
  let resetCounter = $state(0);
  const target = $derived(draft.selected);
  const lines = $derived(draft.lines[draft.selected]);
  const valid = $derived(lines.map(line => matchesNameCopyingPhrase(line, draft.selected)));
  const count = $derived(valid.filter(Boolean).length);
  const total = $derived(nameCopyingTotal(draft));

  onMount(() => {
    try { draft = readNameCopyingDraft(localStorage, principal); }
    catch { storageBlocked = true; notice = copy.unreadable; saveError = true; }
    ready = true;
    if (!storageBlocked) void finishRound();
  });
  $effect(() => {
    if (!ready) return;
    document.dispatchEvent(new CustomEvent('qts:practice-header', {
      detail: { active: true, title: localeStore.t.header.practiceMode, onBack: () => void goto('/tu-tap') },
    }));
    return () => document.dispatchEvent(new CustomEvent('qts:practice-header', { detail: { active: false } }));
  });

  function save(value: NameCopyingDraft = draft): boolean {
    if (storageBlocked) return false;
    try { saveNameCopyingDraft(localStorage, principal, value); saveError = false; notice = copy.saved; return true; }
    catch { saveError = true; notice = copy.unavailable; return false; }
  }

  async function finishRound() {
    if (count !== NAME_COPYING_ROUND_SIZE) return;
    const next = { ...draft, completed: { ...draft.completed }, lines: { ...draft.lines } };
    if (!completeNameCopyingRound(next)) return;
    try { recordCompletedNameCopyingRound(localStorage, principal, draft.selected, next.completed[draft.selected], undefined, next.completionEpoch); }
    catch { saveError = true; notice = copy.unavailable; return; }
    if (!save(next)) return;
    draft = next;
    roundNotice = copy.roundComplete;
    await tick();
    inputs[0]?.focus();
  }

  async function advanceFromCompletedLine(index: number) {
    const currentDraft = draft;
    const currentTarget = target;
    if (count === NAME_COPYING_ROUND_SIZE) { await finishRound(); return; }
    await tick();
    if (draft !== currentDraft || target !== currentTarget || document.activeElement !== inputs[index]) return;
    inputs[Math.min(index + 1, NAME_COPYING_ROUND_SIZE - 1)]?.focus();
  }

  function inputLine(value: string, index: number, compositionCommitted = false) {
    const previouslyComplete = matchesNameCopyingPhrase(draft.lines[draft.selected][index], target);
    draft.lines[draft.selected][index] = composing ? value : value.toLocaleUpperCase('vi-VN');
    roundNotice = '';
    save();
    // Không ngắt bộ gõ Telex/IME khi người dùng còn đang hoàn thiện dấu.
    if (!composing && matchesNameCopyingPhrase(value, target) && (compositionCommitted || !previouslyComplete)) {
      void advanceFromCompletedLine(index);
    }
  }

  function choose(kind: NameCopyingPhrase) {
    if (draft.selected === kind) return;
    composing = false;
    draft.selected = kind;
    roundNotice = '';
    save();
  }

  function focusNext(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (!matchesNameCopyingPhrase(lines[index], target)) return;
    if (count === NAME_COPYING_ROUND_SIZE) { void finishRound(); return; }
    inputs[Math.min(index + 1, NAME_COPYING_ROUND_SIZE - 1)]?.focus();
  }

  function blockPaste(event: Event) {
    event.preventDefault();
    if (!saveError) notice = copy.paste;
  }

  function handleCompleteConfirm() {
    if (storageBlocked) return;
    try {
      const result = completeNameCopyingSession(localStorage, principal, draft);
      draft = result.draft;
      resetCounter += 1;
      showCompleteConfirm = false;
      notice = result.recordedCount > 0
        ? t(copy.completeSuccessWithCount, result.recordedCount.toLocaleString(t.locale()))
        : t(copy.completeSuccessEmpty);
      roundNotice = '';
      saveError = false;
      void tick().then(() => inputs[0]?.focus());
    } catch {
      saveError = true;
      notice = copy.unavailable;
    }
  }
</script>

<main class="name-copying" data-practice-route-back>
  <header><h1>{t(copy.title)}</h1><p>{t(copy.intro)}</p></header>
  <div class="total-bar">
    <p class="total" role="status">{t(copy.total, total.toLocaleString(t.locale()))}</p>
    <button
      type="button"
      class="complete-btn"
      disabled={!ready || storageBlocked}
      onclick={() => (showCompleteConfirm = true)}
      title={t(copy.completeBtn)}
      aria-label={t(copy.completeBtn)}
    >
      <svg viewBox="0 0 24 24" class="complete-icon" aria-hidden="true">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      <span>{t(copy.completeBtn)}</span>
    </button>
  </div>
  <p class="local-note">{t(copy.local)}</p>
  <fieldset disabled={!ready || storageBlocked}>
    <legend id="name-copying-title-label">{t(copy.choose)}</legend>
    <select id="name-copying-title" aria-labelledby="name-copying-title-label" value={draft.selected} onchange={event => choose(event.currentTarget.value as NameCopyingPhrase)}>
      {#each NAME_COPYING_PHRASES as kind (kind)}
        <option value={kind}>{kind}</option>
      {/each}
    </select>
  </fieldset>
  <section class="paper" aria-label={target}>
    <div class="guide">
      <h2>{target}</h2>
      <strong>{t(copy.progress)}: {count} / {NAME_COPYING_ROUND_SIZE}</strong>
      <progress max={NAME_COPYING_ROUND_SIZE} value={count} aria-label={t(copy.progress)}></progress>
      <p>{t(copy.guidance)}</p>
      <p class:error={saveError} role="status">{t(notice)}</p>
      {#if roundNotice}<p class="complete" role="status">{t(roundNotice)}</p>{/if}
    </div>
    {#key `${target}:${draft.completed[target]}:${resetCounter}`}
    <form onsubmit={event => event.preventDefault()}>
      <fieldset disabled={!ready || storageBlocked}>
        {#each lines as line, index (index)}
          <div class="line" class:valid={valid[index]}>
            <label for={`name-line-${index}`}><span aria-hidden="true">{index + 1}.</span><span class="sr-only">{t(copy.line, index + 1)}</span></label>
            <input bind:this={inputs[index]} id={`name-line-${index}`} name={`name-line-${index}`} bind:value={() => draft.lines[draft.selected][index], (value: string) => inputLine(value, index)} maxlength="200" autocomplete="off" spellcheck="false" placeholder={target}
              oncompositionstart={() => composing = true} oninput={event => { composing = event instanceof InputEvent && event.isComposing; }} oncompositionend={event => { composing = false; inputLine(event.currentTarget.value, index, true); }} onblur={() => void finishRound()}
              onkeydown={event => focusNext(event, index)} onpaste={blockPaste} ondrop={blockPaste}
              aria-describedby={line.trim() ? `name-status-${index}` : undefined} />
            <span id={`name-status-${index}`} class="status" class:checked={valid[index]}>
              {#if valid[index]}
                <svg viewBox="0 0 24 24" role="img" aria-label={t(copy.valid)}><polyline points="20 6 9 17 4 12" /></svg>
              {:else if line.trim()}
                <span role="img" aria-label={t(copy.invalid)}>○</span>
              {/if}
            </span>
          </div>
        {/each}
      </fieldset>
    </form>
    {/key}
  </section>

  <PracticeConfirmDialog
    open={showCompleteConfirm}
    title={t(copy.completeDialogTitle)}
    description={count > 0 ? t(copy.completeDialogDescWithCount, count.toLocaleString(t.locale())) : t(copy.completeDialogDescEmpty)}
    cancelLabel={t(copy.completeCancel)}
    confirmLabel={count > 0 ? t(copy.completeConfirmWithCount) : t(copy.completeConfirmEmpty)}
    practiceTheme="KINH PHẬT"
    icon="✨"
    onCancel={() => (showCompleteConfirm = false)}
    onConfirm={handleCompleteConfirm}
  />
</main>

<style>
  .name-copying{max-width:var(--practice-dialog-width);margin:auto;padding:var(--radius-card);padding-bottom:var(--radius-card);color:var(--text)}
  header{text-align:center}h1{font-size:1.5rem}h2{font-size:1.1rem;color:var(--brown);overflow-wrap:anywhere}p{line-height:1.7}
  .local-note{color:var(--text2);font-size:.875rem}fieldset{border:0;padding:0;min-width:0}legend{font-weight:600;margin-bottom:var(--radius-sm)}
  select{width:100%;min-width:0;min-height:44px;padding:var(--radius) var(--radius-sm);margin-bottom:var(--radius-card);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);font:inherit;font-size:.875rem;cursor:pointer}
  .paper{background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow);overflow:hidden}
  .guide{padding:var(--radius-card);background:var(--gold-light)}.guide p{margin-bottom:0;font-size:.875rem}.guide strong{color:var(--brown)}
  .total-bar{position:sticky;top:var(--nav-h);z-index:2;display:flex;align-items:center;gap:var(--radius-sm);margin-bottom:var(--radius-sm)}
  .total-bar .total{flex:1;min-width:0;margin:0;position:static;text-align:center;font-weight:700;color:var(--brown);padding:var(--radius-control);background:var(--gold-light);border:1px solid var(--border);border-radius:var(--radius-control)}
  .complete-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:0 var(--radius-card);border:1px solid color-mix(in srgb,var(--border) 60%,rgba(255,255,255,.35));border-radius:var(--radius-control);background:color-mix(in srgb,var(--card) 65%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:var(--brown);font:inherit;font-size:.875rem;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.06),inset 0 1px 1px rgba(255,255,255,.4);white-space:nowrap;transition:opacity .15s ease,background .15s ease,border-color .15s ease,transform .15s ease}
  .complete-btn:hover{background:color-mix(in srgb,var(--gold-light) 65%,transparent);border-color:color-mix(in srgb,var(--gold) 50%,rgba(255,255,255,.4))}
  .complete-btn:active{background:color-mix(in srgb,var(--gold-light) 85%,transparent);transform:scale(.97)}
  .complete-btn:disabled{opacity:.5;cursor:not-allowed}
  .complete-icon{width:16px;height:16px;stroke:currentColor;stroke-width:2.4;fill:none;stroke-linecap:round;stroke-linejoin:round}
  progress{display:block;width:100%;height:var(--radius);margin-top:var(--radius);accent-color:var(--gold)}
  .line{display:flex;align-items:center;gap:var(--radius-sm);padding:var(--radius-sm);border-top:1px solid var(--border2)}
  .line label{flex:0 0 2.25em;text-align:right;color:var(--muted);font-size:.8rem}
  input{min-width:0;flex:1;min-height:44px;padding:var(--radius-sm);border:1px solid var(--border2);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font:inherit;font-size:1.125rem;text-transform:uppercase;scroll-margin-top:calc(var(--nav-h) + var(--radius-feature) + var(--radius-feature));scroll-margin-bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--radius-card))}
  input::placeholder{color:var(--text2);opacity:1;font-size:inherit}.status{flex:0 0 var(--radius-feature);width:var(--radius-feature);height:var(--radius-feature);display:grid;place-items:center;color:var(--muted)}.status.checked{border-radius:var(--radius-feature);background:var(--green-ok);color:var(--card)}.status svg{width:var(--radius-card);height:var(--radius-card);fill:none;stroke:currentColor;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}.complete{color:var(--green-ok)}.valid input{border-color:var(--green-ok)}
  .error{color:var(--danger-text)}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

  .name-copying{--copying-header-height:max(var(--practice-topbar-height,var(--nav-h)),calc(var(--nav-h) + var(--app-safe-top,0px)));padding-right:max(var(--radius-card),env(safe-area-inset-right));padding-left:max(var(--radius-card),env(safe-area-inset-left));padding-bottom:var(--radius-card)}
  input{scroll-margin-bottom:calc(var(--nav-h) + env(safe-area-inset-bottom) + var(--radius-card))}
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select{min-height:44px}
  /* Giữ tiêu đề, ô nhập và bộ đếm dưới thanh đầu trang khi bàn phím thay đổi viewport. */
  .name-copying{padding-top:calc(var(--copying-header-height) + var(--radius-card))}
  .total-bar{top:var(--copying-header-height)}
  input{scroll-margin-top:calc(var(--copying-header-height) + var(--radius-feature) + var(--radius-feature))}
  :global(body:has(.name-copying) .tt-topbar button){min-width:44px;min-height:44px}
</style>
