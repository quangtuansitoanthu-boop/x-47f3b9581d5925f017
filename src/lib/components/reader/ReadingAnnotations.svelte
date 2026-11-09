<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    createReadingActivityClient,
    isReadingActivityCapacityError,
    type ReadingAnnotationRecord,
    type ReadingActivitySession,
  } from '$lib/browser/reading-activity-client';
  import { createPrivateReadingPrincipalGuard } from '$lib/browser/private-reading-principal-lifecycle';
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import {
    createTextAnnotationDraft,
    resolveTextAnnotation,
  } from '$lib/domain/reading/annotation-anchors';
  import type { HighlightColor, ReadingContentKind } from '$lib/domain/reading/activity';
  import { enqueueOrphanAnnotationReconciliation } from './orphan-annotation-reconciliation';
  import QuoteCardModal from './QuoteCardModal.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { quoteCardCopy } from '$lib/i18n/quote-card';

  interface Props {
    contentElement: HTMLElement | null;
    contentId: string;
    contentKind: ReadingContentKind;
    contentTitle?: string;
    sectionId?: string;
    contentVersion?: string | null;
    session?: ReadingActivitySession;
    onNotify?: (message: string) => void;
    targetAnnotationId?: string | null;
  }

  let {
    contentElement,
    contentId,
    contentKind,
    contentTitle = '',
    sectionId = 'root',
    contentVersion = null,
    session = { authenticated: false, csrfToken: null, user: null },
    onNotify = () => {},
    targetAnnotationId = null,
  }: Props = $props();
  const locale = getLocaleContext();
  let handledTarget = '';

  let annotations = $state<ReadingAnnotationRecord[]>([]);
  let active = $state<ReadingAnnotationRecord | null>(null);
  let pendingDraft = $state<ReturnType<typeof createTextAnnotationDraft> | null>(null);
  let floatingBtnPos = $state<{ top: number; left: number } | null>(null);
  let composerOpen = $state(false);
  let quoteCardModalOpen = $state(false);
  let quoteCardText = $state('');
  let color = $state<HighlightColor>('yellow');
  let note = $state('');
  let loading = $state(false);

  function openQuoteCard(text: string): void {
    if (!text.trim()) return;
    quoteCardText = text.trim();
    quoteCardModalOpen = true;
    floatingBtnPos = null;
  }
  let saving = $state(false);
  let client: ReturnType<typeof createReadingActivityClient> | null = null;
  let mounted = false;
  let loadGeneration = 0;
  let removeSelectionListeners = () => {};
  const principalGuard = createPrivateReadingPrincipalGuard(untrack(() => session));

  function uniqueId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function unwrapHighlights(): void {
    if (!contentElement) return;
    const marks = contentElement.querySelectorAll('mark[data-reading-annotation]');
    if (marks.length === 0) return;
    for (const mark of marks) {
      mark.replaceWith(document.createTextNode(mark.textContent || ''));
    }
    contentElement.normalize();
  }

  function clearPrivateState(): void {
    handledTarget = '';
    loadGeneration += 1;
    annotations = [];
    active = null;
    pendingDraft = null;
    floatingBtnPos = null;
    composerOpen = false;
    quoteCardModalOpen = false;
    quoteCardText = '';
    color = 'yellow';
    note = '';
    loading = false;
    saving = false;
    unwrapHighlights();
    window.getSelection()?.removeAllRanges();
  }

  function textNodes(): Text[] {
    if (!contentElement) return [];
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(contentElement, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => node.parentElement?.closest('script,style')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
    });
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    return nodes;
  }

  function wrapRange(annotation: ReadingAnnotationRecord, startOffset: number, endOffset: number): void {
    const nodes = textNodes();
    let cursor = 0;
    for (const node of nodes) {
      const nodeStart = cursor;
      const nodeEnd = cursor + node.data.length;
      cursor = nodeEnd;
      if (endOffset <= nodeStart || startOffset >= nodeEnd) continue;
      const localStart = Math.max(0, startOffset - nodeStart);
      const localEnd = Math.min(node.data.length, endOffset - nodeStart);
      if (localEnd <= localStart) continue;
      const range = document.createRange();
      range.setStart(node, localStart);
      range.setEnd(node, localEnd);
      const mark = document.createElement('mark');
      mark.dataset.readingAnnotation = annotation.id;
      mark.dataset.color = annotation.color;
      mark.tabIndex = 0;
      mark.setAttribute('role', 'button');
      mark.setAttribute('aria-label', annotation.note
        ? `Trích dẫn có ghi chú: ${annotation.note}`
        : 'Mở trích dẫn đã tô sáng');
      mark.addEventListener('click', () => editAnnotation(annotation));
      mark.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editAnnotation(annotation);
        }
      });
      range.surroundContents(mark);
    }
  }

  function renderHighlights(): void {
    if (!contentElement) return;
    unwrapHighlights();
    const content = contentElement.textContent || '';
    const resolved = annotations.map((annotation) => ({
      annotation,
      anchor: resolveTextAnnotation({
        content,
        contextAfter: annotation.contextAfter,
        contextBefore: annotation.contextBefore,
        locator: annotation.locator,
        quoteText: annotation.quoteText,
      }),
    }));
    for (const item of [...resolved].sort((left, right) =>
      Number(right.anchor.startOffset ?? -1) - Number(left.anchor.startOffset ?? -1))) {
      if (item.anchor.status === 'active' && item.anchor.startOffset !== null && item.anchor.endOffset !== null) {
        wrapRange(item.annotation, item.anchor.startOffset, item.anchor.endOffset);
      } else if (item.annotation.anchorStatus !== 'orphaned' && client) {
        const reconciliation = enqueueOrphanAnnotationReconciliation(client, item.annotation, contentVersion);
        if (!reconciliation.queued) {
          onNotify(`❌ ${reconciliation.error}`);
          break;
        }
      }
    }
    if (resolved.some((item) => item.anchor.status === 'orphaned')) void client?.flush().catch(() => {});
  }

  async function loadAnnotations(): Promise<void> {
    if (!client) return;
    const generation = ++loadGeneration;
    const principalToken = principalGuard.capture();
    loading = true;
    try {
      const loaded = await client.listAnnotations({ contentKind, contentId, limit: 200 });
      if (generation !== loadGeneration || !principalGuard.isCurrent(principalToken)) return;
      annotations = loaded
        .filter((row) => String(row.locator.sectionId || 'root') === sectionId);
      const cachedTarget = client.cachedAnnotations().find(row => row.id === targetAnnotationId
        && row.contentId === contentId && String(row.locator.sectionId || 'root') === sectionId);
      if (cachedTarget && !annotations.some(row => row.id === cachedTarget.id)) annotations = [...annotations, cachedTarget];
    } catch {
      if (generation !== loadGeneration || !principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations().filter((row) =>
        row.contentKind === contentKind && row.contentId === contentId
        && String(row.locator.sectionId || 'root') === sectionId);
      onNotify('⚠️ Đang dùng trích dẫn lưu trên thiết bị');
    } finally {
      if (generation === loadGeneration && principalGuard.isCurrent(principalToken)) loading = false;
    }
    if (generation === loadGeneration && principalGuard.isCurrent(principalToken)) {
      await tick();
      if (generation !== loadGeneration || !principalGuard.isCurrent(principalToken)) return;
      renderHighlights();
      focusRequestedQuote(true);
    }
  }

  function focusRequestedQuote(rendered = false): void {
    if (!targetAnnotationId || handledTarget === targetAnnotationId || !contentElement || loading) return;
    const annotation = annotations.find(row => row.id === targetAnnotationId);
    const copy = quoteCardCopy[locale.current];
    if (!annotation) { handledTarget = targetAnnotationId; onNotify(copy.targetMissing); return; }
    const resolved = resolveTextAnnotation({ content: contentElement.textContent || '', locator: annotation.locator,
      quoteText: annotation.quoteText, contextBefore: annotation.contextBefore, contextAfter: annotation.contextAfter });
    if (annotation.anchorStatus === 'orphaned' || resolved.status !== 'active') { handledTarget = targetAnnotationId; onNotify(copy.targetOrphaned); return; }
    const mark = Array.from(contentElement.querySelectorAll<HTMLElement>('mark[data-reading-annotation]'))
      .find(element => element.dataset.readingAnnotation === targetAnnotationId);
    if (!mark) {
      if (rendered) { handledTarget = targetAnnotationId; onNotify(copy.targetInvalid); }
      return;
    }
    handledTarget = targetAnnotationId;
    mark.scrollIntoView?.({ block: 'center', behavior: 'auto' });
    mark.focus({ preventScroll: true });
  }

  function selectionOffsets(): { start: number; end: number } | null {
    if (!contentElement) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!contentElement.contains(range.commonAncestorContainer)) return null;
    const before = document.createRange();
    before.selectNodeContents(contentElement);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const end = start + range.toString().length;
    return end > start ? { start, end } : null;
  }

  function captureSelection(): void {
    const offsets = selectionOffsets();
    if (!offsets || !contentElement) return;
    try {
      pendingDraft = createTextAnnotationDraft({
        content: contentElement.textContent || '',
        contentId,
        contentKind,
        contentVersion,
        endOffset: offsets.end,
        id: uniqueId(),
        startOffset: offsets.start,
      });
      pendingDraft.locator = { ...pendingDraft.locator, sectionId };
      active = null;
      color = 'yellow';
      note = '';
    } catch {
      pendingDraft = null;
    }
  }

  function checkTextSelection(): void {
    if (!contentElement) {
      floatingBtnPos = null;
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) {
      floatingBtnPos = null;
      return;
    }
    const text = selection.toString().trim();
    if (!text || text.length < 2) {
      floatingBtnPos = null;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!contentElement.contains(range.commonAncestorContainer)) {
      floatingBtnPos = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      floatingBtnPos = null;
      return;
    }

    captureSelection();
    if (!pendingDraft) {
      floatingBtnPos = null;
      return;
    }

    const isTouch = typeof window !== 'undefined' && (
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );

    const btnWidth = Math.min(320, window.innerWidth - 20);
    const btnHeight = 40;
    let top: number;
    if (isTouch) {
      // On touch devices, native browser selection menu appears above the selection.
      // Position our custom toolbar below the selection to avoid overlapping.
      top = rect.bottom + 12;
      if (top + btnHeight > window.innerHeight - 15) {
        top = Math.max(10, window.innerHeight - btnHeight - 20);
      }
    } else {
      top = rect.top - btnHeight - 8;
      if (top < 60) top = rect.bottom + 8;
    }
    let left = rect.left + rect.width / 2 - btnWidth / 2;
    left = Math.max(10, Math.min(window.innerWidth - btnWidth - 10, left));
    floatingBtnPos = { top, left };
  }

  let selectionTimer: ReturnType<typeof setTimeout> | null = null;
  function installSelectionListeners(): void {
    removeSelectionListeners();
    if (!contentElement) return;
    const onSelectionChange = () => {
      if (composerOpen || active) return;
      if (selectionTimer) clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        requestAnimationFrame(checkTextSelection);
      }, 120);
    };
    const pointer = () => {
      if (composerOpen || active) return;
      requestAnimationFrame(checkTextSelection);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        requestAnimationFrame(checkTextSelection);
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && contentElement?.contains(selection.anchorNode)) {
        event.preventDefault();
      }
    };
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('mouseup', pointer);
    window.addEventListener('touchend', pointer, { passive: true });
    contentElement.addEventListener('keyup', keyboard);
    contentElement.addEventListener('contextmenu', onContextMenu);
    removeSelectionListeners = () => {
      if (selectionTimer) clearTimeout(selectionTimer);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('mouseup', pointer);
      window.removeEventListener('touchend', pointer);
      contentElement?.removeEventListener('keyup', keyboard);
      contentElement?.removeEventListener('contextmenu', onContextMenu);
    };
  }

  function openComposerWithNote(): void {
    composerOpen = true;
    floatingBtnPos = null;
  }

  async function copySelectedText(): Promise<void> {
    const text = pendingDraft?.quoteText || window.getSelection()?.toString().trim() || '';
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      onNotify('✓ Đã sao chép đoạn văn');
    } catch {
      onNotify('⚠️ Không thể sao chép');
    }
    floatingBtnPos = null;
    window.getSelection()?.removeAllRanges();
  }

  async function quickSaveQuote(): Promise<void> {
    if (!client || !pendingDraft) return;
    const principalToken = principalGuard.capture();
    saving = true;
    try {
      client.enqueueAnnotationCreate({ ...pendingDraft, color: 'yellow', note: '' });
      await client.flush().catch(() => 0);
      if (!principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations().filter((row) =>
        row.contentKind === contentKind && row.contentId === contentId
        && String(row.locator.sectionId || 'root') === sectionId);
      closeComposer();
      await tick();
      if (!principalGuard.isCurrent(principalToken)) return;
      renderHighlights();
      onNotify('✓ Đã lưu trích dẫn');
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify(isReadingActivityCapacityError(cause)
        ? '❌ Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ rồi thử lại.'
        : '⚠️ Chưa thể lưu trích dẫn.');
    } finally {
      if (principalGuard.isCurrent(principalToken)) saving = false;
    }
  }

  function editAnnotation(annotation: ReadingAnnotationRecord): void {
    active = annotation;
    pendingDraft = null;
    floatingBtnPos = null;
    composerOpen = true;
    color = annotation.color;
    note = annotation.note;
  }

  function closeComposer(): void {
    active = null;
    pendingDraft = null;
    floatingBtnPos = null;
    composerOpen = false;
    note = '';
    window.getSelection()?.removeAllRanges();
  }

  async function saveAnnotation(): Promise<void> {
    if (!client || (!active && !pendingDraft)) return;
    const principalToken = principalGuard.capture();
    saving = true;
    try {
      if (active) {
        client.enqueueAnnotationUpdate(active.id, {
          anchorStatus: active.anchorStatus,
          baseUpdatedAt: active.updatedAt,
          color,
          contentVersion,
          locator: active.locator,
          note,
        });
      } else if (pendingDraft) {
        client.enqueueAnnotationCreate({ ...pendingDraft, color, note });
      }
      await client.flush().catch(() => 0);
      if (!principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations().filter((row) =>
        row.contentKind === contentKind && row.contentId === contentId
        && String(row.locator.sectionId || 'root') === sectionId);
      closeComposer();
      await tick();
      if (!principalGuard.isCurrent(principalToken)) return;
      renderHighlights();
      onNotify('✓ Đã lưu trích dẫn');
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify(isReadingActivityCapacityError(cause)
        ? '❌ Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ rồi thử lại.'
        : '⚠️ Chưa thể lưu trích dẫn. Nội dung đang soạn vẫn được giữ.');
    } finally {
      if (principalGuard.isCurrent(principalToken)) saving = false;
    }
  }

  async function deleteAnnotation(): Promise<void> {
    if (!client || !active) return;
    const principalToken = principalGuard.capture();
    const annotationId = active.id;
    const currentClient = client;
    if (!await confirmInApp('Xóa trích dẫn và ghi chú này?')) return;
    if (!principalGuard.isCurrent(principalToken) || client !== currentClient || active?.id !== annotationId) return;
    saving = true;
    try {
      client.enqueueAnnotationDelete(active.id);
      await client.flush().catch(() => 0);
      if (!principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations().filter((row) =>
        row.contentKind === contentKind && row.contentId === contentId
        && String(row.locator.sectionId || 'root') === sectionId);
      closeComposer();
      renderHighlights();
      onNotify('Đã xóa trích dẫn');
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify(isReadingActivityCapacityError(cause)
        ? '❌ Hàng đợi đọc ngoại tuyến đã đầy; trích dẫn chưa bị xóa.'
        : '⚠️ Chưa thể xóa trích dẫn lúc này.');
    } finally {
      if (principalGuard.isCurrent(principalToken)) saving = false;
    }
  }

  $effect(() => {
    targetAnnotationId;
    if (mounted && !loading) void tick().then(() => { if (mounted && !loading) focusRequestedQuote(); });
  });

  $effect(() => {
    contentElement;
    contentId;
    contentKind;
    sectionId;
    if (mounted) {
      installSelectionListeners();
      void loadAnnotations();
    }
  });

  onMount(() => {
    mounted = true;
    client = createReadingActivityClient(fetch, localStorage);
    client.setSession(session);
    installSelectionListeners();
    void loadAnnotations();
    const sessionChanged = (event: Event) => {
      const next = (event as CustomEvent<ReadingActivitySession>).detail;
      const principalChanged = principalGuard.transition(next);
      if (principalChanged) clearPrivateState();
      client?.setSession(next);
      void loadAnnotations();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      mounted = false;
      loadGeneration += 1;
      principalGuard.invalidate();
      removeSelectionListeners();
      unwrapHighlights();
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
</script>

{#if (pendingDraft && composerOpen) || active}
  <aside data-dialog-glass class="annotation-composer" aria-label={active ? 'Sửa trích dẫn' : 'Tạo trích dẫn'}>
    <header>
      <strong>{active ? 'Sửa trích dẫn' : 'Tô sáng đoạn đã chọn'}</strong>
      <button type="button" aria-label="Đóng" onclick={closeComposer}>✕</button>
    </header>
    <blockquote>{active?.quoteText || pendingDraft?.quoteText}</blockquote>
    <fieldset>
      <legend>Màu tô sáng</legend>
      <label><input type="radio" bind:group={color} value="yellow" /> <span class="swatch yellow"></span> Vàng</label>
      <label><input type="radio" bind:group={color} value="green" /> <span class="swatch green"></span> Xanh</label>
    </fieldset>
    <label class="note-label">Ghi chú riêng
      <textarea bind:value={note} maxlength="12000" rows="3" placeholder="Thêm suy ngẫm của bạn…"></textarea>
    </label>
    <div class="annotation-actions" class:dialog-actions-balanced={!active}>
      <button class="card-action-btn" type="button" onclick={() => openQuoteCard(active?.quoteText || pendingDraft?.quoteText || '')} title="Tạo ảnh chia sẻ mạng xã hội">🖼️ Tạo ảnh</button>
      {#if active}<button class="danger" type="button" disabled={saving} onclick={() => void deleteAnnotation()}>Xóa</button>{/if}
      <button type="button" disabled={saving} onclick={() => void saveAnnotation()}>{saving ? 'Đang lưu…' : 'Lưu trích dẫn'}</button>
    </div>
  </aside>
{/if}

{#if floatingBtnPos && pendingDraft && !composerOpen && !active}
  <div
    class="quote-floating-bar"
    style="top:{floatingBtnPos.top}px;left:{floatingBtnPos.left}px;"
    role="toolbar"
    aria-label="Thao tác đoạn văn"
    tabindex="-1"
    oncontextmenu={(e) => e.preventDefault()}
  >
    <button
      class="quote-floating-btn"
      type="button"
      onmousedown={(e) => e.preventDefault()}
      onclick={() => void quickSaveQuote()}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
      </svg>
      <span>Lưu trích dẫn</span>
    </button>
    <button
      class="quote-floating-btn secondary"
      type="button"
      title="Thêm ghi chú suy ngẫm"
      onmousedown={(e) => e.preventDefault()}
      onclick={openComposerWithNote}
    >
      <span>✍️ Ghi chú</span>
    </button>
    <button
      class="quote-floating-btn secondary"
      type="button"
      title="Tạo ảnh trích dẫn để chia sẻ"
      onmousedown={(e) => e.preventDefault()}
      onclick={() => openQuoteCard(pendingDraft?.quoteText || window.getSelection()?.toString().trim() || '')}
    >
      <span>🖼️ Tạo ảnh</span>
    </button>
    <button
      class="quote-floating-btn secondary"
      type="button"
      title="Sao chép đoạn văn vào bộ nhớ tạm"
      onmousedown={(e) => e.preventDefault()}
      onclick={() => void copySelectedText()}
    >
      <span>📋 Sao chép</span>
    </button>
  </div>
{/if}

{#if loading}<span class="sr-only" role="status">Đang tải trích dẫn…</span>{/if}
{#if annotations.some((annotation) => annotation.anchorStatus === 'orphaned')}
  <p class="annotation-orphan-notice" role="status">Có {annotations.filter((annotation) => annotation.anchorStatus === 'orphaned').length} trích dẫn không còn khớp với phiên bản nội dung này. Chúng vẫn được giữ trong “Trích dẫn của tôi”.</p>
{/if}

<QuoteCardModal
  open={quoteCardModalOpen}
  quoteText={quoteCardText}
  sourceTitle={contentTitle}
  onClose={() => (quoteCardModalOpen = false)}
/>

<style>
  .quote-floating-bar{position:fixed;z-index:850;display:inline-flex;align-items:center;gap:4px;padding:3px;border:1.5px solid var(--gold,#b37d22);border-radius:20px;background:var(--card,#fff);box-shadow:0 4px 18px rgba(0,0,0,.2),0 0 0 1px rgba(212,168,75,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation;animation:quoteFloatingPop .18s cubic-bezier(.34,1.3,.64,1)}
  @keyframes quoteFloatingPop{from{opacity:0;transform:scale(.88) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
  .quote-floating-btn{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 12px;border:0;border-radius:16px;background:var(--gold,#b37d22);color:#fff;font:700 var(--font-size-label) var(--font-app);cursor:pointer;user-select:none;transition:background .15s,transform .12s}
  .quote-floating-btn:hover{background:var(--brown,#8c6016);transform:scale(1.02)}
  .quote-floating-btn:active{transform:scale(.96)}
  .quote-floating-btn.secondary{background:transparent;color:var(--text,#1c1a15);padding:0 10px;font-weight:600}
  .quote-floating-btn.secondary:hover{background:var(--gold-light,rgba(179,125,34,.1));color:var(--gold,#b37d22)}
  :global([data-theme='dark']) .quote-floating-bar,:global(.bg-dark) .quote-floating-bar{background:#1e1914!important;border-color:#d4a84b!important;box-shadow:0 4px 22px rgba(0,0,0,.7),0 0 10px rgba(212,168,75,.2)!important}
  :global([data-theme='dark']) .quote-floating-btn.secondary,:global(.bg-dark) .quote-floating-btn.secondary{color:#ede8df!important}
  :global([data-theme='dark']) .quote-floating-btn.secondary:hover,:global(.bg-dark) .quote-floating-btn.secondary:hover{background:rgba(212,168,75,.2)!important;color:#d4a84b!important}
  .annotation-composer{box-sizing:border-box;max-height:calc(100dvh - 36px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow-y:auto;overscroll-behavior:contain;position:fixed;z-index:760;right:18px;bottom:max(18px,env(safe-area-inset-bottom));width:min(380px,calc(100vw - 28px));padding:14px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:14px;background:var(--dialog-surface-background,var(--card));color:var(--text);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));font:13px/1.5 var(--font-app)}
  .annotation-composer header{display:flex;align-items:center;justify-content:space-between;gap:10px}.annotation-composer header button{width:44px;height:44px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.annotation-composer blockquote{max-height:110px;overflow:auto;margin:10px 0;padding:10px 12px;border-left:4px solid var(--gold);background:var(--bg2);overflow-wrap:anywhere;font-family:var(--font-reader);font-size:14px}.annotation-composer fieldset{display:flex;gap:16px;margin:0 0 10px;padding:0;border:0}.annotation-composer legend{margin-bottom:5px;font-size:var(--font-size-label);font-weight:700}.annotation-composer fieldset label{display:flex;align-items:center;gap:5px;cursor:pointer}.swatch{width:18px;height:12px;border-radius:3px}.swatch.yellow{background:#ffe68a}.swatch.green{background:#b8e7b0}.note-label{display:flex;flex-direction:column;gap:5px;font-size:var(--font-size-label);font-weight:700}.note-label textarea{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font:13px/1.45 var(--font-app);resize:vertical}.annotation-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.annotation-actions button{min-height:44px;padding:7px 13px;border:1px solid var(--gold);border-radius:9px;background:var(--gold);color:var(--on-gold);cursor:pointer;font:700 var(--font-size-label) var(--font-app)}.annotation-actions button.danger{margin-right:auto;border-color:#b13b31;background:transparent;color:var(--danger-text)}.annotation-actions button.card-action-btn{border-color:var(--border);background:var(--bg2);color:var(--text)}.annotation-actions button.card-action-btn:hover{border-color:var(--gold);background:var(--bg3)}.annotation-actions button:disabled{cursor:wait;opacity:.65}.annotation-orphan-notice{margin:18px 0 0;padding:10px 12px;border:1px solid #ddc27d;border-radius:8px;background:#fff8df;color:#604812;font:var(--font-size-meta)/1.5 var(--font-app)}
  :global(mark[data-reading-annotation]){padding:.04em .08em;border-radius:.18em;color:var(--highlight-ink);box-decoration-break:clone;-webkit-box-decoration-break:clone;cursor:pointer}:global(mark[data-reading-annotation][data-color='yellow']){background:#ffe68acc}:global(mark[data-reading-annotation][data-color='green']){background:#b8e7b0d9}:global(mark[data-reading-annotation]:focus-visible){outline:3px solid var(--gold);outline-offset:2px}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;margin:-1px;clip:rect(0,0,0,0);white-space:nowrap}
  @media(max-width:600px){.annotation-composer{max-height:calc(100dvh - 88px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));right:8px;bottom:max(72px,calc(env(safe-area-inset-bottom) + 64px));width:calc(100vw - 16px)}}
</style>
