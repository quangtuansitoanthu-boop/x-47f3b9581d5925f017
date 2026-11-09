<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import {
    createReadingActivityClient,
    isReadingActivityCapacityError,
    type ReadingActivitySession,
    type ReadingAnnotationRecord,
  } from '$lib/browser/reading-activity-client';
  import { createPrivateReadingPrincipalGuard } from '$lib/browser/private-reading-principal-lifecycle';
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { extractPdfPageText, type PdfTextDocumentSource } from './pdf-page-text';
  import { resolveTextAnnotation } from '$lib/domain/reading/annotation-anchors';
  import type { HighlightColor, ReadingAnnotationWrite } from '$lib/domain/reading/activity';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { enqueueOrphanAnnotationReconciliation } from './orphan-annotation-reconciliation';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { quoteCardCopy } from '$lib/i18n/quote-card';

  interface Props {
    open?: boolean;
    articleId: string;
    contentVersion?: string | null;
    document: PdfTextDocumentSource | null;
    page: number;
    session?: ReadingActivitySession;
    onNotify?: (message: string) => void;
    targetAnnotationId?: string | null;
  }

  interface Segment {
    annotation: ReadingAnnotationRecord | null;
    text: string;
  }

  let {
    open = $bindable(false),
    articleId,
    contentVersion = null,
    document,
    page,
    session = { authenticated: false, csrfToken: null, user: null },
    onNotify = () => {},
    targetAnnotationId = null,
  }: Props = $props();
  const locale = getLocaleContext();
  let handledTarget = '';

  let text = $state('');
  let textStatus = $state<'idle' | 'loading' | 'ready' | 'empty' | 'error'>('idle');
  let annotations = $state<ReadingAnnotationRecord[]>([]);
  let textArea = $state<HTMLElement | null>(null);
  let draft = $state<ReadingAnnotationWrite | null>(null);
  let active = $state<ReadingAnnotationRecord | null>(null);
  let color = $state<HighlightColor>('yellow');
  let note = $state('');
  let saving = $state(false);
  let client: ReturnType<typeof createReadingActivityClient> | null = null;
  let generation = 0;
  const principalGuard = createPrivateReadingPrincipalGuard(untrack(() => session));

  const pageAnnotations = $derived(annotations.filter((annotation) => Number(annotation.locator.page) === page));
  const segments = $derived(buildSegments(text, pageAnnotations));

  function clearPrivateState(): void {
    handledTarget = '';
    generation += 1;
    open = false;
    text = '';
    textStatus = 'idle';
    annotations = [];
    textArea = null;
    draft = null;
    active = null;
    color = 'yellow';
    note = '';
    saving = false;
    window.getSelection()?.removeAllRanges();
  }

  function createId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `pdf-quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function buildSegments(content: string, rows: ReadingAnnotationRecord[]): Segment[] {
    const ranges = rows.flatMap((annotation) => {
      const resolved = resolveTextAnnotation({
        content,
        contextAfter: annotation.contextAfter,
        contextBefore: annotation.contextBefore,
        locator: annotation.locator,
        quoteText: annotation.quoteText,
      });
      return resolved.status === 'active' && resolved.startOffset !== null && resolved.endOffset !== null
        ? [{ annotation, start: resolved.startOffset, end: resolved.endOffset }]
        : [];
    }).sort((left, right) => left.start - right.start);
    const output: Segment[] = [];
    let cursor = 0;
    for (const range of ranges) {
      if (range.start < cursor) continue;
      if (range.start > cursor) output.push({ annotation: null, text: content.slice(cursor, range.start) });
      output.push({ annotation: range.annotation, text: content.slice(range.start, range.end) });
      cursor = range.end;
    }
    if (cursor < content.length) output.push({ annotation: null, text: content.slice(cursor) });
    return output;
  }

  async function load(): Promise<void> {
    if (!document || !client || !open) return;
    const request = ++generation;
    const principalToken = principalGuard.capture();
    textStatus = 'loading';
    try {
      const cached = client.cachedAnnotations().filter(row => row.contentKind === 'pdf' && row.contentId === articleId);
      const cachedTarget = targetAnnotationId && targetAnnotationId !== handledTarget && cached.some(row => row.id === targetAnnotationId);
      const [pageText, rows] = await Promise.all([
        extractPdfPageText(document, page),
        cachedTarget ? Promise.resolve(cached) : client.listAnnotations({ contentKind: 'pdf', contentId: articleId, limit: 200 }),
      ]);
      if (request !== generation || !principalGuard.isCurrent(principalToken)) return;
      text = pageText;
      annotations = rows;
      textStatus = pageText ? 'ready' : 'empty';
      markOrphans(pageText, rows);
      await tick();
      if (request !== generation || !principalGuard.isCurrent(principalToken) || !targetAnnotationId || handledTarget === targetAnnotationId) return;
      handledTarget = targetAnnotationId;
      const annotation = rows.find(row => row.id === targetAnnotationId && Number(row.locator.page) === page);
      const copy = quoteCardCopy[locale.current];
      if (!annotation) { onNotify(copy.targetMissing); return; }
      const resolved = resolveTextAnnotation({ content: pageText, locator: annotation.locator, quoteText: annotation.quoteText,
        contextBefore: annotation.contextBefore, contextAfter: annotation.contextAfter });
      if (annotation.anchorStatus === 'orphaned' || resolved.status !== 'active') { onNotify(copy.targetOrphaned); return; }
      const mark = Array.from(textArea?.querySelectorAll<HTMLElement>('[data-quote-id]') ?? [])
        .find(element => element.dataset.quoteId === targetAnnotationId);
      if (!mark) { onNotify(copy.targetInvalid); return; }
      mark?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
      mark?.focus({ preventScroll: true });
    } catch (cause) {
      if (request !== generation || !principalGuard.isCurrent(principalToken)) return;
      textStatus = cause instanceof DOMException && cause.name === 'AbortError' ? 'idle' : 'error';
    }
  }

  function markOrphans(content: string, rows: ReadingAnnotationRecord[]): void {
    if (!client || !content) return;
    let changed = false;
    for (const annotation of rows.filter((row) => Number(row.locator.page) === page)) {
      const resolved = resolveTextAnnotation({
        content,
        contextAfter: annotation.contextAfter,
        contextBefore: annotation.contextBefore,
        locator: annotation.locator,
        quoteText: annotation.quoteText,
      });
      if (resolved.status === 'orphaned' && annotation.anchorStatus !== 'orphaned') {
        const reconciliation = enqueueOrphanAnnotationReconciliation(client, annotation, contentVersion);
        if (!reconciliation.queued) {
          onNotify(`❌ ${reconciliation.error}`);
          break;
        }
        changed = reconciliation.queued;
      }
    }
    if (changed) void client.flush().catch(() => {});
  }

  function selectionData(): { end: number; rectangles: Array<{ x: number; y: number; width: number; height: number }>; start: number } | null {
    if (!textArea) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!textArea.contains(range.commonAncestorContainer)) return null;
    const prefix = documentRange(textArea, range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    const bounds = textArea.getBoundingClientRect();
    const rectangles = [...range.getClientRects()].slice(0, 100).map((rectangle) => ({
      x: bounds.width ? (rectangle.left - bounds.left) / bounds.width : 0,
      y: bounds.height ? (rectangle.top - bounds.top) / bounds.height : 0,
      width: bounds.width ? rectangle.width / bounds.width : 0,
      height: bounds.height ? rectangle.height / bounds.height : 0,
    })).filter((rectangle) => rectangle.width > 0 && rectangle.height > 0);
    return end > start ? { start, end, rectangles } : null;
  }

  function documentRange(root: HTMLElement, endNode: Node, endOffset: number): Range {
    const range = window.document.createRange();
    range.selectNodeContents(root);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function captureSelection(): void {
    const selection = selectionData();
    if (!selection) return;
    const quoteText = text.slice(selection.start, selection.end);
    if (!quoteText.trim()) return;
    const id = createId();
    draft = {
      anchorStatus: 'active', color: 'yellow', contentId: articleId, contentKind: 'pdf', contentVersion,
      contextAfter: text.slice(selection.end, selection.end + 80),
      contextBefore: text.slice(Math.max(0, selection.start - 80), selection.start), id,
      idempotencyKey: id,
      locator: { page, startOffset: selection.start, endOffset: selection.end, rectangles: selection.rectangles },
      note: '', quoteText,
    };
    active = null;
    color = 'yellow';
    note = '';
  }

  function edit(annotation: ReadingAnnotationRecord): void {
    active = annotation;
    draft = null;
    color = annotation.color;
    note = annotation.note;
  }

  function closeEditor(): void {
    active = null;
    draft = null;
    window.getSelection()?.removeAllRanges();
  }

  async function save(): Promise<void> {
    if (!client || (!draft && !active)) return;
    const principalToken = principalGuard.capture();
    saving = true;
    try {
      if (active) {
        client.enqueueAnnotationUpdate(active.id, {
          anchorStatus: active.anchorStatus, baseUpdatedAt: active.updatedAt, color,
          contentVersion, locator: active.locator, note,
        });
      } else if (draft) client.enqueueAnnotationCreate({ ...draft, color, note });
      await client.flush();
      if (!principalGuard.isCurrent(principalToken)) return;
      annotations = client.cachedAnnotations().filter((row) => row.contentKind === 'pdf' && row.contentId === articleId);
      closeEditor();
      onNotify('✓ Đã lưu trích dẫn PDF');
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify(isReadingActivityCapacityError(cause)
        ? '❌ Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ rồi thử lại.'
        : '⚠️ Trích dẫn PDF đang được giữ để thử đồng bộ lại.');
    } finally {
      if (principalGuard.isCurrent(principalToken)) saving = false;
    }
  }

  async function remove(): Promise<void> {
    if (!client || !active) return;
    const principalToken = principalGuard.capture();
    const annotationId = active.id;
    const currentClient = client;
    if (!await confirmInApp('Xóa trích dẫn này?')) return;
    if (!principalGuard.isCurrent(principalToken) || client !== currentClient || active?.id !== annotationId) return;
    try {
      client.enqueueAnnotationDelete(active.id);
      annotations = client.cachedAnnotations().filter((row) => row.contentKind === 'pdf' && row.contentId === articleId);
      closeEditor();
      await client.flush().catch(() => 0);
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify('Đã xóa trích dẫn PDF');
    } catch (cause) {
      if (!principalGuard.isCurrent(principalToken)) return;
      onNotify(isReadingActivityCapacityError(cause)
        ? '❌ Hàng đợi đọc ngoại tuyến đã đầy; trích dẫn chưa bị xóa.'
        : '⚠️ Chưa thể xóa trích dẫn PDF lúc này.');
    }
  }

  function toggle(): void {
    open = !open;
    closeEditor();
    if (open) void load();
  }

  $effect(() => {
    page;
    document;
    if (open) {
      closeEditor();
      void load();
    }
  });

  onMount(() => {
    client = createReadingActivityClient(fetch, localStorage);
    client.setSession(session);
    const sessionChanged = (event: Event) => {
      const next = (event as CustomEvent<ReadingActivitySession>).detail;
      const principalChanged = principalGuard.transition(next);
      if (principalChanged) clearPrivateState();
      client?.setSession(next);
      if (!principalChanged && open) void load();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    return () => {
      generation += 1;
      principalGuard.invalidate();
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    };
  });
</script>

<div class="pdf-annotation-host">
  {#if open}
    <section data-dialog-glass id="pdf-annotation-panel" class="pdf-annotation-panel" aria-label={`Văn bản và trích dẫn trang ${page}`}>
      <header><div><strong>Trích dẫn PDF</strong><small>Trang {page}</small></div><button type="button" aria-label="Đóng bảng trích dẫn" onclick={toggle}>✕</button></header>
      {#if textStatus === 'loading'}<p class="panel-state" role="status">Đang đọc lớp văn bản…</p>
      {:else if textStatus === 'empty'}<p class="panel-state">Trang này không có lớp văn bản để tô sáng. Tài liệu quét cần OCR.</p>
      {:else if textStatus === 'error'}<p class="panel-state" role="alert">Không thể đọc văn bản của trang này.</p>
      {:else if textStatus === 'ready'}
        <p class="selection-help">Chọn một đoạn bằng chuột, cảm ứng hoặc bàn phím để tô sáng.</p>
        <div class="pdf-selectable-text" bind:this={textArea} role="textbox" aria-label="Văn bản trang PDF để chọn trích dẫn" aria-readonly="true" tabindex="0" onmouseup={() => requestAnimationFrame(captureSelection)} ontouchend={() => requestAnimationFrame(captureSelection)} onkeyup={(event) => { if (event.shiftKey) requestAnimationFrame(captureSelection); }}>
          {#each segments as segment}
            {#if segment.annotation}<button type="button" class="text-highlight" data-quote-id={segment.annotation.id} data-color={segment.annotation.color} onclick={() => edit(segment.annotation!)}>{segment.text}</button>{:else}{segment.text}{/if}
          {/each}
        </div>
        {#if pageAnnotations.some((annotation) => annotation.anchorStatus === 'orphaned')}<p class="orphan-message">⚠ Có trích dẫn không còn khớp với trang này. Bản gốc vẫn được giữ trong “Trích dẫn của tôi”.</p>{/if}
      {/if}
      {#if draft || active}
        <div class="pdf-annotation-editor">
          <blockquote>{active?.quoteText || draft?.quoteText}</blockquote>
          <fieldset><legend>Màu</legend><label><input type="radio" bind:group={color} value="yellow" /> Vàng</label><label><input type="radio" bind:group={color} value="green" /> Xanh</label></fieldset>
          <label>Ghi chú<textarea bind:value={note} maxlength="12000" rows="3"></textarea></label>
          <div class:dialog-actions-balanced={!active}>{#if active}<button class="danger" type="button" onclick={() => void remove()}>Xóa</button>{/if}<button type="button" onclick={closeEditor}>Hủy</button><button class="primary" type="button" disabled={saving} onclick={() => void save()}>{saving ? 'Đang lưu…' : 'Lưu'}</button></div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .pdf-annotation-host{display:contents}.pdf-annotation-panel{position:fixed;z-index:770;top:116px;right:10px;bottom:12px;display:flex;width:min(410px,calc(100vw - 20px));overflow:hidden;flex-direction:column;border:1px solid var(--dialog-surface-border,var(--border));border-radius:12px;background:var(--dialog-surface-background,var(--card));color:var(--text);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));font-family:var(--font-app)}.pdf-annotation-panel>header{display:flex;min-height:48px;align-items:center;justify-content:space-between;padding:5px 7px 5px 13px;border-bottom:1px solid var(--border2)}.pdf-annotation-panel header div{display:flex;flex-direction:column}.pdf-annotation-panel header small{color:var(--muted);font-size:10px}.pdf-annotation-panel header button{width:34px;height:34px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer}.panel-state{margin:0;padding:24px;color:var(--muted);font-size:var(--font-size-body);line-height:1.6}.selection-help{margin:0;padding:9px 12px;border-bottom:1px solid var(--border2);color:var(--muted);font-size:var(--font-size-meta)}.pdf-selectable-text{min-height:0;overflow:auto;flex:1;padding:16px;outline:none;color:var(--text);font-family:var(--font-reader);font-size:15px;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}.pdf-selectable-text:focus-visible{box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--gold) 45%,transparent)}.pdf-selectable-text .text-highlight{display:inline;margin:0;padding:.04em .08em;border:0;border-radius:3px;color:var(--highlight-ink);cursor:pointer;font:inherit;line-height:inherit;white-space:inherit;user-select:text}.pdf-selectable-text .text-highlight[data-color='yellow']{background:#ffe68a}.pdf-selectable-text .text-highlight[data-color='green']{background:#b8e7b0}.pdf-selectable-text .text-highlight:focus-visible{outline:3px solid var(--gold)}.orphan-message{margin:0;padding:8px 12px;border-top:1px solid #ddc27d;background:#fff8df;color:#604812;font-size:var(--font-size-meta)}.pdf-annotation-editor{max-height:45%;overflow:auto;padding:12px;border-top:1px solid var(--border);background:var(--bg2);font-size:11px}.pdf-annotation-editor blockquote{max-height:78px;overflow:auto;overflow-wrap:anywhere;margin:0 0 9px;font:13px/1.5 var(--font-reader)}.pdf-annotation-editor fieldset{display:flex;gap:12px;margin:0 0 8px;padding:0;border:0}.pdf-annotation-editor legend{font-weight:700}.pdf-annotation-editor>label{display:flex;flex-direction:column;gap:4px;font-weight:700}.pdf-annotation-editor textarea{box-sizing:border-box;width:100%;padding:7px;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--text);font:12px var(--font-app);resize:vertical}.pdf-annotation-editor>div{display:flex;justify-content:flex-end;gap:5px;margin-top:8px}.pdf-annotation-editor button{min-height:34px;padding:5px 10px;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--text);cursor:pointer;font:700 var(--font-size-label) var(--font-app)}.pdf-annotation-editor button.primary{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}.pdf-annotation-editor button.danger{margin-right:auto;color:var(--danger-text)}.pdf-annotation-panel button:focus-visible,.pdf-annotation-panel textarea:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}@media(max-width:540px){.pdf-annotation-panel{top:104px;bottom:max(70px,calc(env(safe-area-inset-bottom) + 62px));right:5px;width:calc(100vw - 10px)}}
</style>
