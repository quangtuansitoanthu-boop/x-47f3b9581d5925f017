<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { countReflectionWords, REFLECTION_MINIMUM_WORDS } from '$lib/domain/practice/personal-practice';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import ReflectionGuide from './ReflectionGuide.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { followTextareaCaret } from '$lib/browser/copying-caret';

  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    onShare?: (kind: 'repentance' | 'good_deed', content: string, nickname: string) => Promise<void>;
    onSignIn?: () => void;
  }
  let { storage, onShare, onSignIn }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let date = $state(getVietnamIsoDate());
  let repentance = $state('');
  let goodDeeds = $state('');
  let nickname = $state('');
  let status = $state('');
  let failed = $state(false);
  let sharing = $state<'repentance' | 'good_deed' | null>(null);
  let busy = $state(false);
  let saveNoticeOpen = $state(false);
  let showGuide = $state(false);
  let zenTarget = $state<'repentance' | 'good_deed' | null>(null);
  let clearTarget = $state<'repentance' | 'good_deed' | null>(null);
  let clearTrigger = $state<HTMLButtonElement>();
  let repentanceEditor = $state<HTMLTextAreaElement>();
  let revision = 0;
  let reflectionBaseline = '';

  const repentanceWords = $derived(countReflectionWords(repentance));
  const goodDeedsWords = $derived(countReflectionWords(goodDeeds));

  function withSnippet(label: string, target = zenTarget): string {
    const snippet = `\n\n--- ${label} ---\n`;
    const content = target === 'repentance' ? repentance : goodDeeds;
    return content.trim() ? `${content.trimEnd()}${snippet}` : `--- ${label} ---\n`;
  }
  function insertSnippet(label: string, target = zenTarget) {
    if (!target) return;
    const next = withSnippet(label, target);
    if (next.length > 20_000) return;
    if (target === 'repentance') repentance = next;
    else goodDeeds = next;
  }

  async function startWriting(): Promise<void> {
    showGuide = false;
    await tick();
    repentanceEditor?.focus();
  }

  function openZen(target: 'repentance' | 'good_deed', trigger: HTMLButtonElement): void {
    // Safari không tự focus nút khi chạm; modal cần đúng điểm trả focus khi đóng.
    trigger.focus({ preventScroll: true });
    zenTarget = target;
  }

  async function copyEntry(target: 'repentance' | 'good_deed'): Promise<void> {
    const content = target === 'repentance' ? repentance : goodDeeds;
    if (!content || busy) return;
    const currentRevision = revision;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await navigator.clipboard.writeText(content);
      if (currentRevision !== revision) return;
      failed = false; status = copy.copiedEntry;
    } catch {
      if (currentRevision !== revision) return;
      failed = true; status = copy.copyEntryError;
    }
  }

  function requestClear(target: 'repentance' | 'good_deed', trigger: HTMLButtonElement): void {
    trigger.focus({ preventScroll: true });
    clearTrigger = trigger;
    clearTarget = target;
  }

  function clearEntry(): void {
    if (clearTarget === 'repentance') repentance = '';
    else if (clearTarget === 'good_deed') goodDeeds = '';
    clearTarget = null;
    status = ''; failed = false;
  }

  onMount(() => {
    try {
      showGuide = localStorage.getItem('tt_reflection_guide_seen_v1') !== '1';
    } catch {
      /* Local preference only */
    }
  });

  $effect(() => {
    const owner = storage;
    const selectedDate = date;
    revision += 1;
    sharing = null; clearTarget = null; busy = false; saveNoticeOpen = false; status = ''; failed = false;
    repentance = ''; goodDeeds = ''; nickname = '';
    try {
      const entry = owner.getReflections().find(item => item.date === selectedDate);
      repentance = entry?.repentance ?? ''; goodDeeds = entry?.goodDeeds ?? '';
      reflectionBaseline = JSON.stringify([selectedDate, entry?.repentance ?? '', entry?.goodDeeds ?? '']);
      // Lỗi cài đặt biệt danh không được làm trống bài quán chiếu đã đọc thành công.
      nickname = owner.getNickname();
    } catch { failed = true; status = untrack(() => copy.notReady); }
  });

  function save(): boolean {
    try {
      storage.saveReflection({ date, repentance, goodDeeds, updatedAt: new Date().toISOString() });
      if (nickname.trim()) nickname = storage.saveNickname(nickname);
      reflectionBaseline = JSON.stringify([date, repentance, goodDeeds]);
      failed = false; status = copy.saved; return true;
    } catch { failed = true; status = copy.saveError; return false; }
  }
  async function saveManually(kind: 'repentance' | 'good_deed', trigger: HTMLButtonElement): Promise<void> {
    if (busy || saveNoticeOpen) return;
    trigger.focus({ preventScroll: true });
    const currentRevision = revision;
    const words = kind === 'repentance' ? repentanceWords : goodDeedsWords;
    saveNoticeOpen = true;
    try {
      if (words < REFLECTION_MINIMUM_WORDS) {
        failed = true;
        status = copy.wordsMinimumHint
          .replace('{0}', String(REFLECTION_MINIMUM_WORDS))
          .replace('{1}', String(REFLECTION_MINIMUM_WORDS - words));
      } else {
        if (save()) recordPracticeParticipation('reflection','recorded',storage.ownerId);
      }
      await alertInApp(status);
    } finally {
      if (currentRevision === revision) saveNoticeOpen = false;
    }
  }
  /** Guard same-principal remounts: a failed local save must keep this draft on screen. */
  export function preserveDraft(): boolean {
    return JSON.stringify([date, repentance, goodDeeds]) !== reflectionBaseline ? save() : true;
  }
  function saveNickname(): void {
    if (!nickname.trim()) return;
    try { nickname = storage.saveNickname(nickname); failed = false; }
    catch { failed = true; status = copy.saveError; }
  }
  function changeDate(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.value || !input.validity.valid || busy) { input.value = date; return; }
    if (!preserveDraft()) { input.value = date; return; }
    date = input.value;
  }
  function requestShare(kind: 'repentance' | 'good_deed'): void {
    if (busy) return;
    if (!onShare) { if (onSignIn && save()) onSignIn(); return; }
    if (!nickname.trim()) { failed = true; status = copy.nicknameRequired; return; }
    if (!validPublicShare(kind)) return;
    if (save()) sharing = kind;
  }
  function validPublicShare(kind: 'repentance' | 'good_deed'): boolean {
    const name = nickname.normalize('NFC').trim();
    if (!name || name.length > 40 || /[\u0000-\u001f\u007f@]/u.test(name)) {
      failed = true; status = copy.nicknameInvalid; return false;
    }
    const content = (kind === 'repentance' ? repentance : goodDeeds).normalize('NFC').trim();
    if (!content || content.length > 3000 || content.includes('\u0000')) {
      failed = true; status = copy.publicContentInvalid; return false;
    }
    const words = countReflectionWords(content);
    if (words < REFLECTION_MINIMUM_WORDS) {
      failed = true;
      status = copy.wordsMinimumHint
        .replace('{0}', String(REFLECTION_MINIMUM_WORDS))
        .replace('{1}', String(REFLECTION_MINIMUM_WORDS - words));
      return false;
    }
    return true;
  }
  async function send(): Promise<void> {
    if (!sharing || !onShare || busy) return;
    const kind = sharing;
    if (!validPublicShare(kind)) { sharing = null; return; }
    const content = kind === 'repentance' ? repentance : goodDeeds;
    const currentRevision = revision;
    busy = true;
    try {
      await onShare(kind, content.normalize('NFC').trim(), nickname.normalize('NFC').trim());
      if (currentRevision !== revision) return;
      sharing = null; failed = false; status = copy.shared;
    } catch {
      if (currentRevision !== revision) return;
      sharing = null; failed = true; status = copy.shareError;
    } finally { if (currentRevision === revision) busy = false; }
  }
</script>

{#snippet editorTools(target: 'repentance' | 'good_deed')}
  <div class="editor-tools">
    <button type="button" class="editor-tool-btn" aria-label={copy.copyEntry} title={copy.copyEntry} disabled={busy || !(target === 'repentance' ? repentance : goodDeeds)} onclick={() => void copyEntry(target)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>
    </button>
    <button type="button" class="editor-tool-btn" aria-label={copy.clearEntry} title={copy.clearEntry} disabled={busy || !(target === 'repentance' ? repentance : goodDeeds)} onclick={(event) => requestClear(target, event.currentTarget)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></svg>
    </button>
    <button type="button" class="zen-open-btn" aria-label={copy.zenMode} title={copy.zenMode} onclick={(event) => openZen(target, event.currentTarget)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/></svg>
    </button>
  </div>
{/snippet}

{#snippet segmentSuggestions(target: 'repentance' | 'good_deed')}
    <div class="zen-quick-snippets" aria-label={copy.quickInsert}>
      <span class="snippet-label">{copy.quickInsert}</span>
      {#each (target === 'repentance' ? copy.repentanceSections : copy.goodDeedSections) as section (section.text)}
        <button type="button" class="snippet-pill" disabled={withSnippet(section.text, target).length > 20_000} onclick={() => insertSnippet(section.text, target)}>+ {section.label}</button>
      {/each}
    </div>
{/snippet}

<div class="personal-journal">
  <div class="journal-top-bar">
    <button
      type="button"
      class="guide-toggle-button"
      onclick={() => (showGuide = !showGuide)}
      aria-expanded={showGuide}
    >
      📖 {showGuide ? copy.hideGuide : copy.viewGuide}
    </button>
  </div>

  {#if showGuide}
    <div class="guide-banner">
      <ReflectionGuide onDismiss={() => void startWriting()} embedded={false} />
    </div>
  {:else}
    <div class="journal-card">
      <label>{copy.date}<input type="date" value={date} onchange={changeDate} max={getVietnamIsoDate()} disabled={busy} /></label>
      <label>{copy.nickname}<input bind:value={nickname} onchange={saveNickname} maxlength="40" autocomplete="off" disabled={busy} /></label>
    </div>
    <div class="journal-columns">
      <section class="journal-card">
        <div class="card-header">
          <h3>{copy.repentance}</h3>
          {@render editorTools('repentance')}
        </div>
        {@render segmentSuggestions('repentance')}
        <label><textarea use:followTextareaCaret aria-label={copy.repentance} bind:this={repentanceEditor} bind:value={repentance} maxlength="20000" placeholder={copy.repentancePlaceholder}></textarea></label>
        
        <div class="word-counter" class:word-counter--reached={repentanceWords >= REFLECTION_MINIMUM_WORDS}>
          {#if repentanceWords < REFLECTION_MINIMUM_WORDS}
            <span class="counter-badge counter-badge--warn">⚠️ {copy.wordsCount.replace('{0}', String(repentanceWords))}</span>
            <span class="counter-hint">{copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords))}</span>
          {:else}
            <span class="counter-badge counter-badge--success">✓ {copy.wordsCount.replace('{0}', String(repentanceWords))}</span>
            <span class="counter-hint">{copy.wordsReached.replace('{0}', String(repentanceWords))}</span>
          {/if}
        </div>

        <p class="reader">{copy.vow}</p>
        <div class="actions">
          <button onclick={(event) => void saveManually('repentance', event.currentTarget)} disabled={busy}>{copy.savePrivate}</button>
          <button
            onclick={() => requestShare('repentance')}
            disabled={(!onShare && !onSignIn) || busy || repentanceWords < REFLECTION_MINIMUM_WORDS}
            title={repentanceWords < REFLECTION_MINIMUM_WORDS ? copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords)) : undefined}
          >
            {copy.shareRepentance}
          </button>
        </div>
      </section>

      <section class="journal-card">
        <div class="card-header">
          <h3>{copy.goodDeeds}</h3>
          {@render editorTools('good_deed')}
        </div>
        {@render segmentSuggestions('good_deed')}
        <label><textarea use:followTextareaCaret aria-label={copy.goodDeeds} bind:value={goodDeeds} maxlength="20000" placeholder={copy.goodPlaceholder}></textarea></label>
        
        <div class="word-counter" class:word-counter--reached={goodDeedsWords >= REFLECTION_MINIMUM_WORDS}>
          {#if goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            <span class="counter-badge counter-badge--warn">⚠️ {copy.wordsCount.replace('{0}', String(goodDeedsWords))}</span>
            <span class="counter-hint">{copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords))}</span>
          {:else}
            <span class="counter-badge counter-badge--success">✓ {copy.wordsCount.replace('{0}', String(goodDeedsWords))}</span>
            <span class="counter-hint">{copy.wordsReached.replace('{0}', String(goodDeedsWords))}</span>
          {/if}
        </div>

        <p class="reader">{copy.merit}</p>
        <div class="actions">
          <button onclick={(event) => void saveManually('good_deed', event.currentTarget)} disabled={busy}>{copy.savePrivate}</button>
          <button
            onclick={() => requestShare('good_deed')}
            disabled={(!onShare && !onSignIn) || busy || goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            title={goodDeedsWords < REFLECTION_MINIMUM_WORDS ? copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords)) : undefined}
          >
            {copy.shareGood}
          </button>
        </div>
      </section>
    </div>
    {#if !onShare}<p class="notice">{onSignIn ? copy.signInToShare : copy.unavailable}</p>{/if}
    <p class:error={failed} role="status">{status}</p>
  {/if}
</div>

{#if zenTarget}
  <dialog class="zen-overlay" use:modalDialog oncancel={() => (zenTarget = null)} onclose={() => (zenTarget = null)} aria-label={zenTarget === 'repentance' ? copy.repentance : copy.goodDeeds}>
    <header class="zen-header">
      <div class="zen-title-group">
        <span class="zen-eyebrow">{copy.zenTitle} · {copy.date}: {date}</span>
        <h2>{zenTarget === 'repentance' ? copy.repentance : copy.goodDeeds}</h2>
      </div>
      <button type="button" class="zen-close-btn" onclick={() => (zenTarget = null)}>
        ✕ {copy.exitZenMode}
      </button>
    </header>

    {@render segmentSuggestions(zenTarget)}

    <div class="zen-editor-area">
      {#if zenTarget === 'repentance'}
        <textarea
          aria-label={copy.repentance}
          bind:value={repentance}
          maxlength="20000"
          placeholder={copy.repentancePlaceholder}
          class="zen-textarea"
          data-modal-focus
        ></textarea>
      {:else}
        <textarea
          aria-label={copy.goodDeeds}
          bind:value={goodDeeds}
          maxlength="20000"
          placeholder={copy.goodPlaceholder}
          class="zen-textarea"
          data-modal-focus
        ></textarea>
      {/if}
    </div>

    <footer class="zen-footer">
      <div class="zen-stats">
        {#if zenTarget === 'repentance'}
          <span class="zen-stat-count">📝 {copy.wordsCount.replace('{0}', String(repentanceWords))} ({copy.charCount.replace('{0}', String(repentance.length))})</span>
          {#if repentanceWords < REFLECTION_MINIMUM_WORDS}
            <span class="zen-stat-hint zen-stat-hint--warn">⚠️ {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - repentanceWords))}</span>
          {:else}
            <span class="zen-stat-hint zen-stat-hint--ok">✓ {copy.wordsReached.replace('{0}', String(repentanceWords))}</span>
          {/if}
          {#if repentance.length > 3000}
            <span class="zen-stat-notice">ℹ️ {copy.charLimitNotice}</span>
          {/if}
        {:else}
          <span class="zen-stat-count">📝 {copy.wordsCount.replace('{0}', String(goodDeedsWords))} ({copy.charCount.replace('{0}', String(goodDeeds.length))})</span>
          {#if goodDeedsWords < REFLECTION_MINIMUM_WORDS}
            <span class="zen-stat-hint zen-stat-hint--warn">⚠️ {copy.wordsMinimumHint.replace('{0}', String(REFLECTION_MINIMUM_WORDS)).replace('{1}', String(REFLECTION_MINIMUM_WORDS - goodDeedsWords))}</span>
          {:else}
            <span class="zen-stat-hint zen-stat-hint--ok">✓ {copy.wordsReached.replace('{0}', String(goodDeedsWords))}</span>
          {/if}
          {#if goodDeeds.length > 3000}
            <span class="zen-stat-notice">ℹ️ {copy.charLimitNotice}</span>
          {/if}
        {/if}
      </div>
      <p class:error={failed} role="status">{status}</p>
      <div class="zen-actions">
        <button type="button" class="zen-save-btn" onclick={(event) => zenTarget && void saveManually(zenTarget, event.currentTarget)} disabled={busy}>{copy.savePrivate}</button>
        <button type="button" class="zen-done-btn" onclick={() => (zenTarget = null)}>✓ {copy.exitZenMode}</button>
      </div>
    </footer>
  </dialog>
{/if}

<PracticeConfirmDialog open={sharing !== null} title={copy.confirmTitle} description={sharing === 'good_deed' ? copy.goodConsent : copy.repentanceConsent}
  cancelLabel={copy.cancel} confirmLabel={busy ? copy.sending : copy.confirm} {busy}
  onCancel={() => { if (!busy) sharing = null; }} onConfirm={() => { void send(); }} />

<PracticeConfirmDialog open={clearTarget !== null} title={copy.clearEntryTitle} description={copy.clearEntryConfirm}
  cancelLabel={copy.cancel} confirmLabel={copy.clearEntry} returnFocusTo={clearTrigger}
  onCancel={() => { clearTarget = null; }} onConfirm={clearEntry} />

<style>
  .personal-journal {
    min-width: 0;
  }
  .journal-top-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: calc(var(--space-page) * 0.5);
  }
  .guide-toggle-button {
    min-height: 44px;
    padding: calc(var(--space-page) * 0.4) calc(var(--space-page) * 0.7);
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
    border-radius: var(--radius-control);
    font: 700 var(--font-size-label) var(--font-app);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: var(--shadow-sm);
  }
  .guide-toggle-button:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
  .guide-banner {
    margin-bottom: var(--space-page);
  }
  .journal-card {
    min-width: 0;
    padding: var(--space-page);
    margin-bottom: var(--space-page);
    background: var(--dialog-glass-background, var(--card));
    border: 1px solid var(--border2);
    border-radius: var(--radius-card);
  }
  h3 {
    margin: 0 0 calc(var(--space-page) * 0.6);
    font-size: var(--font-size-card-title);
  }
  label {
    display: grid;
    gap: calc(var(--space-page) * 0.3);
    margin-block: calc(var(--space-page) * 0.6);
    font-weight: 700;
    font-size: var(--font-size-label);
  }
  input,
  textarea,
  button {
    font: inherit;
    box-sizing: border-box;
    min-height: 44px;
    min-width: 44px;
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--text);
    background: var(--card);
    padding: calc(var(--space-page) * 0.6);
  }
  input,
  textarea {
    width: 100%;
    min-width: 0;
    font-size: var(--font-size-input);
  }
  textarea {
    min-height: calc(var(--space-page) * 14);
    resize: vertical;
    font-family: var(--font-reader);
    line-height: 1.7;
  }
  /* WebView co lại khi mở bàn phím; chừa chỗ cho thanh điều hướng cố định. */
  :global(:root[data-native-app='true']) .journal-columns textarea {
    min-height: calc(var(--space-page) * 14 + var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
    padding-block-end: calc(var(--space-page) * .6 + var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
    scroll-margin-block-end: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px) + var(--space-page));
  }
  @media (max-width: 768px) {
    .journal-columns textarea {
      min-height: calc(var(--space-page) * 14 + var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
      padding-block-end: calc(var(--space-page) * .6 + var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
      scroll-margin-block-end: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px) + var(--space-page));
    }
  }
  button {
    cursor: pointer;
    box-shadow: var(--glass-button-shadow);
  }
  button:disabled {
    opacity: 0.55;
    cursor: default;
  }
  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }
  .word-counter {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block: calc(var(--space-page) * 0.3) calc(var(--space-page) * 0.6);
    font-size: 0.82rem;
    color: var(--text2);
    flex-wrap: wrap;
  }
  .counter-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: var(--radius-sm);
    font-weight: 700;
  }
  .counter-badge--warn {
    background: var(--gold-light);
    color: var(--brown, var(--gold));
    border: 1px solid var(--gold);
  }
  .counter-badge--success {
    background: var(--card);
    color: var(--green-ok);
    border: 1px solid var(--green-ok);
  }
  .counter-hint {
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--space-page) * 0.5);
  }
  .actions button:first-child {
    background: var(--gold);
    color: var(--on-gold);
  }
  p {
    line-height: 1.7;
    color: var(--text2);
  }
  .notice {
    padding: calc(var(--space-page) * 0.6);
    background: var(--gold-light);
    border-radius: var(--radius);
  }
  .reader {
    font-family: var(--font-reader);
    text-align: justify;
  }
  .error {
    color: var(--danger-text);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: calc(var(--space-page) * 0.4);
    margin-bottom: calc(var(--space-page) * 0.4);
  }
  .card-header h3 {
    margin: 0;
    flex: 1;
    min-width: calc(var(--space-page) * 8.75);
  }
  .editor-tools { display: flex; gap: calc(var(--space-page) * 0.3); margin-inline-start: auto; }
  .editor-tools svg { width: calc(var(--space-page) * 1.05); height: calc(var(--space-page) * 1.05); }
  .editor-tools button { width: 44px; height: 44px; padding: 0; justify-content: center; flex-shrink: 0; }
  .editor-tool-btn,
  .zen-open-btn {
    min-height: 44px;
    min-width: 44px;
    padding: 4px 10px;
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
    border-radius: var(--radius-sm);
    font-size: 0.8rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    box-shadow: none;
  }
  .zen-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    padding: calc(var(--space-page) * 0.75);
    padding-top: calc(env(safe-area-inset-top, 0px) + var(--space-page) * 0.5);
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--space-page) * 0.5);
    overflow: hidden;
    box-sizing: border-box;
    margin: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
  }
  .zen-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: calc(var(--space-page) * 0.4);
    border-bottom: 1px solid var(--border2);
    gap: var(--space-page);
  }
  .zen-title-group {
    display: grid;
    min-width: 0;
  }
  .zen-eyebrow {
    font-size: var(--font-size-meta, 0.75rem);
    font-weight: 700;
    color: var(--brown, var(--gold));
    letter-spacing: 0.05em;
  }
  .zen-header h2 {
    margin: 0;
    font-size: clamp(1.1rem, 2.5vw, 1.35rem);
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .zen-close-btn {
    flex-shrink: 0;
    min-height: 44px;
    padding: 6px 14px;
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-control);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .zen-quick-snippets {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-block: calc(var(--space-page) * 0.4);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .snippet-label {
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text2);
    white-space: nowrap;
  }
  .snippet-pill {
    flex-shrink: 0;
    min-height: 44px;
    padding: 4px 10px;
    background: var(--gold-light);
    border: 1px solid var(--gold);
    color: var(--brown, var(--text));
    border-radius: var(--radius-sm);
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: none;
  }
  .zen-editor-area {
    flex: 1;
    display: flex;
    min-height: 0;
    margin-block: calc(var(--space-page) * 0.3);
  }
  .zen-textarea {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 100%;
    box-sizing: border-box;
    font-family: var(--font-reader);
    font-size: clamp(1rem, 2vw, 1.15rem);
    line-height: 1.85;
    padding: var(--space-page);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--card);
    color: var(--text);
    resize: none;
  }
  .zen-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: calc(var(--space-page) * 0.5);
    padding-top: calc(var(--space-page) * 0.4);
    border-top: 1px solid var(--border2);
    background: var(--bg);
  }
  .zen-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.85rem;
  }
  .zen-stat-count {
    font-weight: 700;
    color: var(--text);
  }
  .zen-stat-hint {
    font-weight: 600;
    padding: 2px 7px;
    border-radius: var(--radius-sm);
  }
  .zen-stat-hint--warn {
    background: var(--gold-light);
    color: var(--brown, var(--gold));
  }
  .zen-stat-hint--ok {
    background: var(--card);
    color: var(--green-ok);
  }
  .zen-stat-notice {
    font-size: 0.8rem;
    color: var(--text2);
  }
  .zen-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  .zen-save-btn {
    background: var(--card);
    border: 1px solid var(--border);
    color: var(--text);
  }
  .zen-done-btn {
    background: var(--gold);
    color: var(--on-gold);
  }
  @media (min-width: 768px) {
    .journal-columns {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-page);
    }
  }
</style>

