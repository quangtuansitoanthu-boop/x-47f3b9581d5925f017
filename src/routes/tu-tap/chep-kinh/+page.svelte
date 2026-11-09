<script lang="ts">
  import { confirmInApp } from '$lib/browser/app-dialog';
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { createReaderTextToSpeech, type ReaderSpeechState } from '$lib/components/reader/reader-text-to-speech';
  import { getNativeReaderSpeech } from '$lib/browser/native-reader-speech';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { copyingCarryStart, editCopyingPage } from '$lib/domain/practice/copying-pages';
  import { recordCompletedBookCopy } from '$lib/browser/copying-completion';
  import { createCopyBookRuns, type CopyBookRunSnapshot } from '$lib/browser/scripture-copying-book-runs';
  import { createPrincipalStorage } from '$lib/browser/principal-storage';
  import { createPracticeSyncClient } from '$lib/browser/practice-storage';
  import { canPasteCopy } from '$lib/domain/practice/copying-access';
  import RichCopyEditor from '$lib/components/RichCopyEditor.svelte';
  import CopyingPreparation from '$lib/components/practice/copying/CopyingPreparation.svelte';
  import { formatTypedCopy } from '$lib/domain/practice/copying-typed-format';
  import { formatGhostRuns, clipGhostRuns, alignGhostRuns } from '$lib/domain/practice/copying-ghost-format';
  import '$lib/styles/copying-fonts.css';
  import { copyingChapterProgress } from '$lib/domain/practice/copying-progress';
  import { copyingBlockCompleted, copyingChapterCompletion, copyingTextCompletion } from '$lib/domain/practice/copying-completion-progress';
  import { copySourceText, copySourceLayoutLines } from '$lib/domain/practice/copying-formatting';
  import sourceLayouts from '$lib/data/scripture-copying/layouts.json';
  import { Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, PenLine, Settings, Maximize, Minimize, ArrowDownUp, BookOpen, Volume2, Square, X } from '@lucide/svelte';
  import { copyingSentences, copyingCursorPosition, copyingSourceWordLines } from '$lib/domain/practice/copying-follow';
  import { createInterfaceTranslator } from '$lib/i18n/copying-interface';
  const localizeUi = createInterfaceTranslator();
  const locale = getLocaleContext();
  let speechState = $state<ReaderSpeechState>('idle');
  let speechRate = $state(1);
  let paper = $state<'white' | 'cream' | 'gray'>('cream');
  function choosePaper(value: typeof paper) {
    paper = value;
    try { localStorage.setItem('tt_copy_paper_v1', value); } catch { /* Nền giấy chỉ là tùy chọn thiết bị, không chặn chép kinh. */ }
  }
  let lineSpacing = $state(1.8);
  let nativeSpeechSettings = $state(false);
  let readingSentence = $state<number | null>(null);
  let readingWord = $state<number | undefined>(undefined);
  let advancingSpeech = false;
  let autoAdvanceTimer: ReturnType<typeof setTimeout> | undefined;
  let autoAdvancePending = $state(false);
  let autoAdvancingBlock = $state(false);
  let focusAfterChapter: { scope: string; book: string; chapter: number } | null = null;

  function cancelAutoAdvance() {
    if (autoAdvanceTimer !== undefined) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = undefined;
    }
    autoAdvancePending = false;
  }

  async function triggerAutoAdvanceBlock() {
    cancelAutoAdvance();
    if (step !== 'write' || loading || !chapter || restarting || networkBusy || composing || autoAdvancingBlock) return;
    const current = ticket;
    autoAdvancingBlock = true;
    try {
      if (block === chapter.blocks.length - 1) {
        if (!book || chapterNumber >= book.chapters.length || !chapterComplete) return;
        await workspace.flushLocal();
        if (current !== ticket || step !== 'write') return;
        focusAfterChapter = { scope, book: selected, chapter: chapterNumber + 1 };
        chapterNumber++;
        return;
      }
      const nextBlock = block + 1;
      await goBlock(nextBlock);
      await tick();
      if (current !== ticket || step !== 'write' || block !== nextBlock) return;
      if (sourceElement) sourceElement.scrollTop = 0;
      editor?.focus({ preventScroll: true });
      editor?.setSelectionRange(0, 0);
    } catch {
      if (current === ticket) {
        localError = true;
        localStatus = localizeUi("Không thể lưu trên máy. Hãy giữ màn hình này và thử lại.");
      }
    } finally {
      autoAdvancingBlock = false;
    }
  }

  function checkTypingAutoAdvance(currentText: string, inputType = '') {
    cancelAutoAdvance();
    if (step !== 'write' || loading || !chapter || composing || restarting) return;
    if (block === chapter.blocks.length - 1 && (!book || chapterNumber >= book.chapters.length || !chapterComplete)) return;
    const isFinished = copyingBlockCompleted(chapter.blocks[block], currentText);
    if (!isFinished) return;
    if (inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
      void triggerAutoAdvanceBlock();
      return;
    }
    autoAdvancePending = true;
    const current = ticket, expectedBlock = block;
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = undefined;
      autoAdvancePending = false;
      if (current !== ticket || block !== expectedBlock || !chapter || !copyingBlockCompleted(chapter.blocks[block], text)) return;
      void triggerAutoAdvanceBlock();
    }, 600);
  }

  async function handleAdvanceSpeech(): Promise<boolean> {
    if (step !== 'write' || loading || composing || networkBusy || restarting) return false;
    if (!chapter || block >= chapter.blocks.length - 1) {
      message = localizeUi('✓ Đã đọc xong đoạn cuối của phẩm/quyển này.');
      return false;
    }
    const current = ticket, currentScope = scope, currentBook = selected, currentChapter = chapterNumber, nextBlock = block + 1;
    advancingSpeech = true;
    try {
      await goBlock(nextBlock);
      await tick();
      if (current !== ticket || scope !== currentScope || selected !== currentBook || chapterNumber !== currentChapter || step !== 'write' || loading || block !== nextBlock) return false;
      if (sourceElement) sourceElement.scrollTop = 0;
      return true;
    } catch {
      return false;
    } finally {
      advancingSpeech = false;
    }
  }

  const sampleSpeech = createReaderTextToSpeech({
    minimumRate: 0.3,
    getChunks: () => {
      if (sourceSentences && sourceSentences.length) {
        return sourceSentences.map(line => line.parts.map(p => p.text).join(''));
      }
      return chapter ? [copySourceText(chapter.blocks[block])] : [];
    },
    getLocale: () => locale.current,
    getSpeechLocale: () => 'vi',
    initialRate: untrack(() => speechRate),
    onAdvance: handleAdvanceSpeech,
    onState: state => {
      speechState = state;
      if (state !== 'playing' && state !== 'paused') {
        readingSentence = null;
        readingWord = undefined;
      }
    },
    onNotify: text => { message = text; },
    onChunkStart: (index) => {
      readingSentence = index >= 0 ? index : null;
      readingWord = undefined;
    },
    onChunkBoundary: (info) => {
      if (info.chunkIndex < 0 || !sourceWordLines[info.chunkIndex]) return;
      readingSentence = info.chunkIndex;
      const words = sourceWordLines[info.chunkIndex];
      let offset = 0;
      for (const part of words) {
        const len = part.text.length;
        if (info.charIndex >= offset && info.charIndex < offset + len) {
          if (part.word !== undefined) {
            readingWord = part.word;
          }
          break;
        }
        offset += len;
      }
    },
    onChunkEnd: () => {
      readingWord = undefined;
    }
  });
  function toggleSampleSpeech() {
    if (speechState === 'playing') sampleSpeech.pause();
    else if (speechState !== 'loading') sampleSpeech.play();
  }
  async function openSpeechSettings() {
    sampleSpeech.pause();
    try { await getNativeReaderSpeech()?.openSettings(); }
    catch { message = localizeUi('Hãy mở Cài đặt Android → Chuyển văn bản thành giọng nói để tải giọng tiếng Việt.'); }
  }
  onMount(() => { nativeSpeechSettings = Boolean(getNativeReaderSpeech()); });
  $effect(() => {
    selected; chapterNumber; step; block;
    if (advancingSpeech) return;
    sampleSpeech.stop();
    readingSentence = null;
    readingWord = undefined;
  });
  import { onMount, onDestroy, tick, untrack } from 'svelte';
  onDestroy(() => {
    cancelAutoAdvance();
    sampleSpeech.destroy();
  });
  import { beforeNavigate, goto } from '$app/navigation';
  import { acquireScrollLock as lockBodyScroll } from '$lib/browser/scroll-lock';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { serverStateKeys } from '$lib/browser/server-state';
  import { createCopyStore, createCopyBookRunStore } from '$lib/browser/scripture-copying-storage';
  import { sendCopyingSnapshot } from '$lib/browser/scripture-copying-api';
  import { copyDraftKey, createCopyId, createCopyWorkspace, type CopyDraft, type CopyStore } from '$lib/browser/scripture-copying-workspace';
  import { COPYING_BOOKS, COPY_NOTICE, compareCopy, normalizeCopyText, isBlockedCopyInput, type CopyBook, type CopyBookId, type CopyIssue } from '$lib/domain/practice/scripture-copying';

  const session = getSessionContext();
  const queryClient = useQueryClient();
  let mounted = $state(false);
  let completionRun = $state('');
  let bookSnapshot = $state<CopyBookRunSnapshot | null>(null);
  let bookRuns: ReturnType<typeof createCopyBookRuns>;
  let completionCheck = '';
  let completionError = $state(false);
  let restarting = $state(false);
  let archivePreview = $state<CopyDraft | null>(null);
  let practiceSync: ReturnType<typeof createPracticeSyncClient> | undefined;
  let selected = $state<CopyBookId>('dia-tang');
  let chapterNumber = $state(1);
  let book = $state<CopyBook | null>(null);
  let block = $state(0);
  let sourceFontSize = $state(20);
  let editorFontSize = $state(20);
  async function changeEditorFontSize(delta: number) {
    pageTurnPending = false;
    editorFontSize = Math.max(14, Math.min(40, editorFontSize + delta));
    try { localStorage.setItem('tt_copy_font_size_v1', String(editorFontSize)); } catch { /* Device preference only. */ }
    await tick(); scheduleEditorReflow();
  }
  const fontOptions = [
    { id: 'reader', name: 'Mặc định (Bookerly)', family: 'Bookerly, Georgia, serif' },
    { id: 'mali', name: 'Mali (viết tay)', family: 'CopyMali, Bookerly, Georgia, serif' },
    { id: 'hipsteria', scale: 1.2, name: 'iCiel Hipsteria', family: 'CopyHipsteria, Bookerly, Georgia, serif' },
    { id: 'autogate', name: 'MTD Autogate Stamp', family: 'CopyAutogate, Bookerly, Georgia, serif' },
    { id: 'brignola', scale: 1.35, name: 'MTD Brignola Script', family: 'CopyBrignola, Bookerly, Georgia, serif' },
  ];
  let selectedFont = $state('reader');
  const editorFont = $derived(fontOptions.find(font => font.id === selectedFont)?.family ?? fontOptions[0].family);
  const editorScale = $derived(fontOptions.find(font => font.id === selectedFont)?.scale ?? 1);
  async function chooseFont(event: Event) {
    selectedFont = (event.currentTarget as HTMLSelectElement).value;
    await tick();
    try { await document.fonts.load(`${editorFontSize * editorScale}px ${editorFont}`); } catch { /* Keep the readable fallback. */ }
    scheduleEditorReflow();
  }

  let draft = $state<(CopyDraft & { dirty: boolean; saving: boolean }) | null>(null);
  let loading = $state(true);
  let localStatus = $state('');
  let localError = $state(false);
  let localSavePending = $state(false);
  let message = $state('');
  let networkBusy = $state(false);
  let showIntro = $state(true);
  let guestDraft = $state<CopyDraft | null>(null);
  let text = $state('');
  let editorPages = $state<number[]>([0]);
  let editorPage = $state(0);
  let continuousScroll = $state(true);
  function toggleEditorScroll() {
    caretPosition = editor ? editorPages[editorPage] + editor.getSelectionEnd() : caretPosition;
    continuousScroll = !continuousScroll;
    scheduleEditorReflow();
  }
  let ghostEnabled = $state(false);
  function toggleGhostMode() {
    ghostEnabled = !ghostEnabled;
    sourceVisible = !ghostEnabled;
    try {
      localStorage.setItem('tt_copy_ghost_v1', ghostEnabled ? '1' : '0');
    } catch { /* Device preference only. */ }
    scheduleEditorReflow();
  }
  let caretPosition = $state<number | null>(null);
  let pageTurnPending = false;
  const pageText = $derived(text.slice(editorPages[editorPage], editorPages[editorPage + 1] ?? text.length));
  async function goEditorPage(next: number) {
    if (next < 0 || next >= editorPages.length || composing || restarting) return;
    editorPage = next; pageTurnPending = false;
    await tick();
    editor?.focus({ preventScroll: true });
    editor?.setSelectionRange(0, 0);
    if (editor) editor.resetScroll();
    caretPosition = editorPages[next];
  }
  let issues = $state<CopyIssue[]>([]);
  let checked = $state(false);
  let cloudCursor = $state('');
  let composing = $state(false);
  let editor = $state<ReturnType<typeof RichCopyEditor>>();
  let store: CopyStore;
  let workspace: ReturnType<typeof createCopyWorkspace>;
  let ticket = 0;
  let editTicket = 0;
  let caretFollowFrame: number | undefined;
  let reflowFrame: number | undefined;
  let reflowPending = false;
  let reflowSequence = 0;
  function scheduleEditorReflow() {
    if (step !== 'write' || !editor) return;
    if (composing) { reflowPending = true; return; }
    if (reflowFrame !== undefined) cancelAnimationFrame(reflowFrame);
    reflowFrame = requestAnimationFrame(() => { reflowFrame = undefined; void reflowEditorPages(); });
  }
  async function reflowEditorPages() {
    const target = editor, current = ++reflowSequence;
    if (!target || composing || step !== 'write') return;
    const focused = target.hasFocus();
    const caret = Math.min(text.length, focused ? editorPages[editorPage] + target.getSelectionEnd() : caretPosition ?? text.length);
    const starts = continuousScroll ? [0] : target.pageStarts(text, formatTypedCopy(sourceSentences, text));
    if (starts.length === editorPages.length && starts.every((start, index) => start === editorPages[index])) return;
    editorPages = starts;
    editorPage = Math.max(0, starts.findIndex((start, index) => caret >= start && caret < (starts[index + 1] ?? Infinity)));
    pageTurnPending = false;
    await tick();
    if (current !== reflowSequence || editor !== target || composing || step !== 'write') return;
    caretPosition = caret;
    if (focused) {
      target.focus({ preventScroll: true });
      target.setSelectionRange(caret - starts[editorPage], caret - starts[editorPage]);
      target.followCaret();
    } else target.resetScroll();
  }
  function followEditorCaret() {
    if (composing || !editor || !editor.hasFocus()) return;
    if (caretFollowFrame !== undefined) cancelAnimationFrame(caretFollowFrame);
    const target = editor, current = ticket, currentBlock = block, currentPage = editorPage, pageStart = editorPages[editorPage];
    caretFollowFrame = requestAnimationFrame(async () => {
      caretFollowFrame = undefined;
      // Intercepted ghost input restores its selection during the Svelte render.
      await tick();
      if (current !== ticket || block !== currentBlock || editorPage !== currentPage || editorPages[editorPage] !== pageStart
        || composing || editor !== target || step !== 'write' || !target.hasFocus()) return;
      caretPosition = Math.min(text.length, pageStart + target.getSelectionEnd());
      const turn = pageTurnPending; pageTurnPending = false;
      const carry = !continuousScroll && turn && target.needsPage() ? copyingCarryStart(target.getValue()) : 0;
      if (carry > 0) {
        const nextStart = editorPages[editorPage] + carry;
        editorPages = [...editorPages.slice(0, editorPage + 1), nextStart, ...editorPages.slice(editorPage + 1)];
        editorPage++;
        await tick();
        if (current !== ticket || block !== currentBlock || editorPage !== currentPage + 1 || editorPages[editorPage] !== nextStart
          || editor !== target || composing || step !== 'write' || !target.hasFocus()) return;
        target.focus({ preventScroll: true });
        target.setSelectionRange(target.getValue().length, target.getValue().length);
        target.resetScroll();
        caretPosition = editorPages[editorPage] + target.getValue().length;
      } else target.followCaret();
    });
  }
  let rejectedInput = false;
  let acceptedText = '';
  let previousOwner = '';
  const canPaste = $derived(canPasteCopy(session.value.authenticated, session.value.user?.role));
  const owner = $derived(session.value.authenticated ? session.value.user?.id ?? '' : '');
  const scope = $derived(owner ? `account:${owner}` : 'guest');
  const chapter = $derived(book?.id === selected ? book.chapters[chapterNumber - 1] : undefined);
  const chapterCompletion = $derived(chapter && draft && draft.sutraId === selected && draft.chapter === chapterNumber ? copyingChapterCompletion(chapter.blocks, draft.texts) : { accepted: false, percent: 0 });

  const chapterComplete = $derived(chapterCompletion.accepted);
  const bookComplete = $derived(bookSnapshot?.complete ?? false);
  const bookChapterAccepted = $derived(book && bookSnapshot ? bookSnapshot.drafts.map((item, index) =>
    copyingChapterCompletion(book!.chapters[index].blocks, item.texts).accepted) : []);
  const completedChapters = $derived(bookChapterAccepted.filter((accepted, index) =>
    index === chapterNumber - 1 ? chapterComplete : accepted).length);
  const nextIncompleteChapter = $derived(bookChapterAccepted.findIndex((accepted, index) => index === chapterNumber - 1 ? !chapterComplete : !accepted) + 1);
  async function recordCompletion() {
    if (!mounted || loading || !book || !draft || !chapterComplete || draft.sutraId !== selected || draft.chapter !== chapterNumber) return;
    const current = ticket, selectedBook = book, principal = scope, userId = owner;
    try {
      await workspace.flushLocal();
      if (current !== ticket) return;
      const snapshot = await bookRuns.read(principal, selectedBook);
      if (current !== ticket || !snapshot) return;
      bookSnapshot = snapshot;
      if (snapshot.complete && !snapshot.legacyCompleted) recordCompletedBookCopy(createPrincipalStorage(window.localStorage, userId), selectedBook, snapshot.drafts, snapshot.runId);
      completionRun = snapshot.complete ? snapshot.runId : ''; completionError = false;
    } catch { if (current === ticket) completionError = true; }
  }
  $effect(() => {
    if (mounted) practiceSync?.setSession(session.value);
  });
  $effect(() => {
    if (!mounted || loading || !draft || !book) return;
    const check = `${scope}:${selected}:${chapterNumber}:${draft.bookRunId}:${chapterComplete}`;
    if (check === completionCheck) return;
    completionCheck = check;
    if (chapterComplete) void recordCompletion();
    else if (bookSnapshot?.complete) bookSnapshot = { ...bookSnapshot, complete: false };
  });
  async function restartCopy() {
    cancelAutoAdvance();
    if (restarting || networkBusy || composing || !draft || !book || !bookComplete || completionRun !== bookSnapshot?.runId) return;
    const current = ticket;
    restarting = true;
    try {
      await workspace.flushLocal();
      if (current !== ticket) return;
      const nextSnapshot = await bookRuns.startNewRun(scope, book);
      if (current !== ticket) return;
      bookSnapshot = nextSnapshot;
      completionRun = ''; archivePreview = null;
      focusAfterChapter = { scope, book: selected, chapter: 1 };
      if (chapterNumber === 1) await loadLocal(scope, selected, 1);
      else chapterNumber = 1;
      localStatus = localizeUi('Đã mở lượt chép mới trên máy');
      await tick(); editor?.focus({ preventScroll: true });
    } catch {
      if (current === ticket) message = localizeUi('Chưa mở được lượt mới. Bản chép đã hoàn thành vẫn được giữ nguyên.');
    } finally { if (current === ticket) restarting = false; }
  }
  async function previewPrevious(runId: string) {
    const current = ticket;
    try { const previous = await workspace.readPreviousRun(runId); if (current === ticket) archivePreview = previous; }
    catch { message = localizeUi('Không đọc được lượt chép trước trên máy.'); }
  }

  const cloud = createQuery(() => ({
    queryKey: [...serverStateKeys.scriptureCopying.chapter(owner, selected, chapterNumber), cloudCursor],
    enabled: false, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async ({ signal }) => {
      if (!owner) throw new Error(localizeUi("Vui lòng đăng nhập."));
      const response = await fetchWithSessionRefresh(`/api/practice/copying?sutra=${selected}&chapter=${chapterNumber}&cursor=${encodeURIComponent(cloudCursor)}`, { signal, credentials: 'include', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? localizeUi("Không đọc được bản hệ thống."));
      return body as { copies: Array<{ runId: string; sourceVersion: string; revision: number; savedAt: string; complete: boolean }>; nextCursor: string | null };
    },
  }));

  function syncView() { draft = workspace.snapshot(); }
  function refreshEditor() {
    if (!draft) return;
    composing = false; reflowPending = false;
    block = Math.max(0, Math.min(draft.block, draft.texts.length - 1));
    text = draft.texts[block] ?? ''; acceptedText = text; issues = []; checked = false;
    editorPages = [0]; editorPage = 0; pageTurnPending = false; archivePreview = null; caretPosition = null;
  }
  async function loadLocal(nextScope: string, id: CopyBookId, number: number) {
    cancelAutoAdvance();
    composing = false; reflowPending = false;
    const shouldFocus = focusAfterChapter?.scope === nextScope && focusAfterChapter.book === id && focusAfterChapter.chapter === number;
    focusAfterChapter = null;
    const current = ++ticket;
    cloudCursor = '';
    workspace.cancel(); loading = true; networkBusy = false; restarting = false; localSavePending = false; message = ''; guestDraft = null; issues = []; bookSnapshot = null; completionCheck = '';
     editTicket++;
    try {
      const sources = {
        'dia-tang': () => import('$lib/data/scripture-copying/dia-tang.json'),
        'phap-hoa': () => import('$lib/data/scripture-copying/phap-hoa.json'),
        'lang-nghiem': () => import('$lib/data/scripture-copying/lang-nghiem.json'),
      };
      const loaded = (await sources[id]()).default;
      if (current !== ticket) return;
      await workspace.flushLocal();
      if (current !== ticket) return;
      const snapshot = await bookRuns.ensure(nextScope, loaded);
      if (current !== ticket) return;
      await workspace.open(nextScope, id, number, loaded.version, loaded.chapters[number - 1].blocks.length);
      if (current !== ticket) return;
      book = loaded; bookSnapshot = snapshot; syncView(); refreshEditor();
      localError = false; localStatus = draft!.texts.some(Boolean) ? localizeUi("Đã lưu trên máy") : localizeUi("Sẵn sàng tự lưu trên máy");
      if (nextScope !== 'guest') {
        const candidate = await store.read(copyDraftKey('guest', id, number, loaded.version));
        if (current === ticket) guestDraft = candidate;
      }
    } catch {
      if (current !== ticket) return;
      draft = null; book = null; localError = true;
      localStatus = localizeUi("Không thể đọc bộ nhớ ứng dụng. Bản cũ được giữ nguyên. Hãy thử mở lại.");
    } finally { if (current === ticket) loading = false; }
    if (shouldFocus && current === ticket && step === 'write' && draft && !localError) {
      await tick();
      if (current !== ticket || step !== 'write') return;
      editor?.focus({ preventScroll: true });
      editor?.setSelectionRange(pageText.length, pageText.length);
      scheduleEditorReflow();
    }
  }
  $effect(() => {
    const currentScope = scope, currentBook = selected, currentChapter = chapterNumber;
    if (mounted) {
      void queryClient.cancelQueries({ queryKey: serverStateKeys.scriptureCopying.all });
      if (previousOwner !== currentScope) queryClient.removeQueries({ queryKey: serverStateKeys.scriptureCopying.all });
      previousOwner = currentScope;
      void loadLocal(currentScope, currentBook, currentChapter);
    }
  });

  function review(full = false) {
    if (!chapter || composing) return;
    issues = compareCopy(chapter.blocks[block], text, full).issues; checked = full;
  }
  function disallow(event: Event) {
    if (canPaste) return;
    event.preventDefault(); message = localizeUi("Chức năng chép kinh yêu cầu tự gõ; không hỗ trợ sao chép, dán hoặc kéo thả văn bản.");
  }
  function beforeInput(event: InputEvent) {
    if (restarting) { event.preventDefault(); return; }
    rejectedInput = !canPaste && isBlockedCopyInput(event.inputType);
    if (rejectedInput) disallow(event);
  }
  function input(value: string, inputType = '') {
    if (restarting) return;
    if (!canPaste && (rejectedInput || isBlockedCopyInput(inputType))) {
      text = acceptedText; rejectedInput = false; return;
    }
    const edited = editCopyingPage(text, editorPages, editorPage, value);
    text = edited.text; editorPages = edited.starts;
    acceptedText = text; checked = false; issues = []; pageTurnPending = true;
    followEditorCaret();
    const current = ticket, edit = ++editTicket;
    localStatus = localizeUi("Đang lưu trên máy…");
    localSavePending = true;
    const writing = workspace.edit(block, text); syncView();
    checkTypingAutoAdvance(text, inputType);
    void writing.then(() => {
      if (current === ticket && edit === editTicket) { localSavePending = false; localError = false; localStatus = localizeUi("Đã lưu trên máy"); }
    }, () => {
      if (current === ticket && edit === editTicket) { localSavePending = false; localError = true; localStatus = localizeUi("Không thể lưu trên máy. Phần vừa nhập có thể mất khi đóng ứng dụng."); }
    });
    // Review is explicit: never open an error panel or shrink the writing page while typing.
  }
  async function pointTo(issue: CopyIssue) {
    editorPage = Math.max(0, editorPages.findIndex((start, index) => issue.start >= start && issue.start < (editorPages[index + 1] ?? Infinity)));
    pageTurnPending = false;
    await tick();
    editor?.focus({ preventScroll: true });
    editor?.setSelectionRange(issue.start - editorPages[editorPage], issue.end - editorPages[editorPage]);
    caretPosition = issue.start;
  }
  async function goBlock(next: number) {
    cancelAutoAdvance();
    if (!chapter || next < 0 || next >= chapter.blocks.length || restarting || networkBusy || composing) return;
    const current = ticket;
    try {
      const selection = workspace.selectBlock(next);
      syncView();
      refreshEditor();
      if (sourceElement) sourceElement.scrollTop = 0;
      await selection;
      if (current !== ticket) return;
      await tick();
      scheduleEditorReflow();
    } catch {
      if (current !== ticket) return;
      localError = true;
      localStatus = localizeUi("Không thể lưu trên máy. Hãy giữ màn hình này và thử lại.");
    }
  }
  async function copyReference(all = false) {
    if (!canPaste || !chapter) return;
    try {
      await navigator.clipboard.writeText(copySourceText(all ? chapter.blocks.join('\n\n') : chapter.blocks[block]));
      message = localizeUi(all ? 'Đã sao chép toàn bộ kinh mẫu của phẩm/quyển.' : 'Đã sao chép đoạn kinh mẫu.');
    } catch { message = localizeUi('Không thể truy cập clipboard. Bạn có thể chọn kinh mẫu và sao chép trực tiếp.'); }
  }
  async function pasteReference(pasted: string): Promise<boolean> {
    if (!canPaste || !chapter || !draft || normalizeCopyText(pasted) !== normalizeCopyText(chapter.blocks.join('\n\n'))) return false;
    if (restarting || networkBusy || composing) return true;
    const current = ticket;
    if (draft.texts.some(Boolean) && !await confirmCopyAction(localizeUi('Dán toàn bộ kinh mẫu sẽ thay bản chép trên máy của phẩm/quyển này. Tiếp tục?'))) return true;
    if (current !== ticket || !canPaste || !draft || !chapter || restarting || networkBusy || composing) return true;
    restarting = true; localSavePending = true;
    try {
      await workspace.replaceLocal({ ...$state.snapshot(draft), texts: chapter.blocks.map(copySourceText), block: 0 });
      if (current !== ticket) return true;
      syncView(); refreshEditor(); localError = false; localStatus = localizeUi('Đã lưu trên máy');
      message = localizeUi('Đã dán toàn bộ kinh mẫu vào các đoạn tương ứng trên máy. Chưa lưu lên hệ thống.');
      await tick(); scheduleEditorReflow();
    } catch { if (current === ticket) { localError = true; message = localizeUi('Chưa dán được toàn bộ kinh mẫu. Bản chép cũ vẫn được giữ nguyên.'); } }
    finally { if (current === ticket) { restarting = false; localSavePending = false; } }
    return true;
  }
  function login() {
    message = localizeUi("Bản chép đang tự lưu trên thiết bị. Vui lòng đăng nhập để lưu lên hệ thống. Đăng nhập xong, hãy bấm lưu lại.");
    window.dispatchEvent(new CustomEvent('quangtu:login-required'));
  }
  async function save() {
    if (!draft || loading || networkBusy || restarting) return;
    if (!owner) { login(); return; }
    if (!navigator.onLine) { message = localizeUi("Chưa có mạng. Bản chép vẫn ở trên máy. Hãy kết nối mạng và bấm Lưu lên hệ thống."); return; }
    if (!draft.dirty) { message = draft.savedAt ? localizeUi("Bản hiện tại đã lưu lên hệ thống. Không có thay đổi mới.") : localizeUi("Chưa có nội dung mới để lưu lên hệ thống."); return; }
    const current = ticket, userId = owner;
    networkBusy = true; message = localizeUi("Đang lưu lên hệ thống…");
    try {
      const csrfToken = await requireBrowserCsrf();
      if (current !== ticket || owner !== userId) return;
      const ack = await workspace.save({ userId, csrfToken });
      if (current !== ticket) return;
      syncView(); localError = false; localStatus = localizeUi("Đã lưu trên máy");
      message = draft?.dirty
        ? localizeUi("Đã lưu bản đã gửi lên hệ thống. Có thay đổi mới chỉ lưu trên máy; bấm lưu lần nữa để lưu phần mới.")
        : ack ? localizeUi("Đã lưu lên hệ thống thành công.") : localizeUi("Bản hiện tại đã lưu lên hệ thống.");
      await queryClient.invalidateQueries({ queryKey: serverStateKeys.scriptureCopying.chapter(userId, selected, chapterNumber), refetchType: 'none' });
      if (ack && !draft?.dirty && chapterComplete) void practiceSync?.push(session.value).catch(() => {
        if (owner === userId) message = localizeUi('Bản chép đã lưu thành công; ghi nhận công phu vẫn ở trên máy.');
      });
    } catch (error) {
      if (current !== ticket) return;
      syncView();
      message = localizeUi("Chưa xác nhận lưu lên hệ thống. Bản chép vẫn được giữ trên máy. {0} Bấm lưu để thử lại.", error instanceof Error ? error.message : '');
    } finally { if (current === ticket) { networkBusy = false; restarting = false; } }
  }
  async function adoptGuest() {
    if (!guestDraft || !draft || !owner || networkBusy || restarting || composing) return;
    if (draft.texts.some(Boolean)) { message = localizeUi("Tài khoản đã có bản chép trên máy. Bản khách được giữ riêng để tránh ghi đè."); return; }
    const current = ticket;
    if (!await confirmCopyAction(localizeUi("Tiếp tục bản chép khách trong tài khoản này? Thao tác này chỉ lưu trên máy; chưa gửi lên hệ thống."))) return;
    if (current !== ticket || !guestDraft || !draft || !owner || networkBusy || restarting || composing || draft.texts.some(Boolean)) return;
    restarting = true;
    try {
      await workspace.replaceLocal({ ...$state.snapshot(guestDraft), bookRunId: draft.bookRunId, practiceRunId: guestDraft.practiceRunId ?? guestDraft.runId, runId: createCopyId(), revision: 0, savedTexts: [], savedAt: null, pending: null });
      if (current !== ticket) return;
      syncView(); refreshEditor(); guestDraft = null; message = localizeUi("Đã nhận bản khách trên máy. Bấm Lưu lên hệ thống khi bạn muốn lưu vào tài khoản.");
    } catch { if (current === ticket) message = localizeUi("Không thể lưu bản khách vào bộ nhớ tài khoản. Bản khách vẫn được giữ nguyên."); }
    finally { if (current === ticket) restarting = false; }
  }
  async function keepSeparateCopy() {
    if (!draft || networkBusy || restarting || composing) return;
    const current = ticket;
    if (!await confirmCopyAction(localizeUi("Giữ nguyên nội dung trên máy thành một lượt chép riêng? Bản hệ thống cũ được giữ nguyên. Chỉ gửi lượt mới khi bạn bấm Lưu lên hệ thống."))) return;
    if (current !== ticket || !draft || networkBusy || restarting || composing) return;
    restarting = true;
    try {
      await workspace.replaceLocal({ ...$state.snapshot(draft), practiceRunId: draft.practiceRunId ?? draft.runId, runId: createCopyId(), revision: 0, savedTexts: [], savedAt: null, pending: null });
      if (current !== ticket) return;
      syncView(); message = localizeUi("Đã giữ thành lượt riêng trên máy. Chưa gửi lên hệ thống.");
    } catch { if (current === ticket) { localError = true; localStatus = localizeUi("Không thể lưu lượt riêng trên máy. Nội dung đang chép vẫn được giữ trên màn hình."); } }
    finally { if (current === ticket) restarting = false; }
  }
  async function listCloud(cursor = '') {
    if (!owner) { login(); return; }
    message = ''; cloudCursor = cursor;
    await tick();
    await cloud.refetch();
  }
  async function restore(runId: string) {
    if (!owner || !draft || networkBusy || restarting || composing) return;
    const current = ticket;
    if (!await confirmCopyAction(localizeUi("Mở bản hệ thống để tiếp tục? Bản đang chép trên máy sẽ được thay thế sau khi bạn xác nhận bản đã tải."))) return;
    if (current !== ticket || !owner || !draft || networkBusy || restarting || composing) return;
    networkBusy = true; restarting = true;
    try {
      const response = await fetchWithSessionRefresh(`/api/practice/copying?sutra=${selected}&chapter=${chapterNumber}&run=${encodeURIComponent(runId)}`, { credentials: 'include', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok || !body.copy) throw new Error(body.error?.message ?? localizeUi("Không tìm thấy bản lưu."));
      if (current !== ticket) return;
      const copy = body.copy;
      if (copy.sourceVersion !== book?.version) throw new Error(localizeUi("Bản này dùng phiên bản kinh khác; không thay bản trên máy."));
      if (!chapter || !Array.isArray(copy.texts) || copy.texts.length !== chapter.blocks.length || !copy.texts.every((value: unknown) => typeof value === 'string')) throw new Error(localizeUi('Bản lưu không hợp lệ; bản đang chép được giữ nguyên.'));
      if (bookSnapshot?.previousRuns.some(run => run.chapterRunIds.includes(copy.runId))) {
        archivePreview = { ...draft, runId: copy.runId, texts: copy.texts };
        message = localizeUi('Đây là bản của lượt trước. Chỉ mở để xem, không thay bản đang chép hoặc cộng lại công phu.');
        return;
      }
      if (!await confirmCopyAction(localizeUi("Đã tải được bản hệ thống. Thay bản đang chép trên máy bằng bản này?")) || current !== ticket || !draft) return;
      await workspace.replaceLocal({ ...draft, runId: copy.runId, practiceRunId: copy.runId, texts: copy.texts, savedTexts: copy.texts, revision: copy.revision, savedAt: copy.savedAt, pending: null, block: 0 });
      syncView(); refreshEditor(); localStatus = localizeUi("Đã lưu trên máy"); localError = false; message = localizeUi("Đã mở bản hệ thống trên thiết bị này.");
    } catch (error) { if (current === ticket) message = error instanceof Error ? error.message : localizeUi("Không thể mở bản lưu."); }
    finally { if (current === ticket) { networkBusy = false; restarting = false; } }
  }
  function formatTime(value: string) { return new Date(value).toLocaleString(localizeUi.locale()); }
  let copyConfirmationPending = false;
  let approvedNavigationUrl: string | null = null;
  async function confirmCopyAction(prompt: string): Promise<boolean> {
    if (copyConfirmationPending) return false;
    copyConfirmationPending = true;
    try { return await confirmInApp(prompt); }
    finally { copyConfirmationPending = false; }
  }
  beforeNavigate(navigation => {
    if (approvedNavigationUrl && navigation.to?.url.href === approvedNavigationUrl) {
      approvedNavigationUrl = null;
      return;
    }
    if (!(localError || localSavePending) || !draft?.texts.some(Boolean)) return;
    navigation.cancel();
    // Trình duyệt sở hữu cảnh báo khi đóng/tải lại trang; không thể chờ hộp thoại bất đồng bộ.
    if (navigation.willUnload || !navigation.to) return;
    const current = ticket;
    const target = navigation.to.url.href;
    const delta = navigation.type === 'popstate' ? navigation.delta : undefined;
    void (async () => {
      if (!await confirmCopyAction(localizeUi("Bản chép chưa lưu xong trên thiết bị. Bạn vẫn muốn rời màn chép?")) || current !== ticket) return;
      approvedNavigationUrl = target;
      if (delta) window.history.go(delta);
      else {
        try { await goto(target); }
        catch { approvedNavigationUrl = null; }
      }
    })();
  });
  onMount(() => {
    // Each visit starts with Bookerly; font changes apply to the current session.
    try { const savedPaper = localStorage.getItem('tt_copy_paper_v1'); if (savedPaper === 'white' || savedPaper === 'cream' || savedPaper === 'gray') paper = savedPaper; } catch { /* Giữ nền giấy mặc định khi bộ nhớ không khả dụng. */ }
    try { const savedSize = Number(localStorage.getItem('tt_copy_font_size_v1') ?? 20); if (Number.isFinite(savedSize)) editorFontSize = Math.max(14, Math.min(40, savedSize)); } catch { /* Device preference only. */ }
    try { ghostEnabled = localStorage.getItem('tt_copy_ghost_v1') === '1'; if (ghostEnabled) sourceVisible = false; } catch { /* Device preference only. */ }
    try { practiceSync = createPracticeSyncClient(fetchWithSessionRefresh); }
    catch { /* Bộ nhớ công phu bị chặn không làm mất workspace IndexedDB độc lập. */ }
    store = createCopyStore();
    bookRuns = createCopyBookRuns(createCopyBookRunStore());
    workspace = createCopyWorkspace(store, sendCopyingSnapshot);
    try { showIntro = localStorage.getItem('tt_copy_notice_v1') !== '1'; } catch { /* The notice stays visible. */ }
    mounted = true;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if ((localError || localSavePending) && draft?.texts.some(Boolean)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      practiceSync?.setSession({ authenticated: false, user: null, csrfToken: null });
      ticket++; workspace.cancel(); 
      if (caretFollowFrame !== undefined) cancelAnimationFrame(caretFollowFrame);
      reflowSequence++;
      if (reflowFrame !== undefined) cancelAnimationFrame(reflowFrame);
      window.removeEventListener('beforeunload', beforeUnload);
      void queryClient.cancelQueries({ queryKey: serverStateKeys.scriptureCopying.all });
      queryClient.removeQueries({ queryKey: serverStateKeys.scriptureCopying.all });
    };
  });
  function dismissIntro() { showIntro = false; try { localStorage.setItem('tt_copy_notice_v1', '1'); } catch { /* Optional preference only. */ } }

  let step = $state<'choose' | 'guide' | 'write'>('choose');
  const selectedBookInfo = $derived(COPYING_BOOKS.find(item => item.id === selected));

  let progressRows = $state<Array<{ number: number; title: string } & ReturnType<typeof copyingChapterProgress>>>([]);
  let progressBusy = $state(false);
  let progressError = $state(false);
  const progressTotal = $derived(progressRows.reduce((sum, row) => sum + row.total, 0));
  const progressPercent = $derived(progressTotal ? Math.round(progressRows.reduce((sum, row) => sum + row.percent * row.total, 0) / progressTotal) : 0);
  $effect(() => {
    const selectedBook = book, principalScope = scope;
    progressRows = []; progressError = false; progressBusy = false;
    if (step !== 'choose' || !mounted || loading || !selectedBook || selectedBook.id !== selected) return;
    let cancelled = false;
    progressBusy = true;
    void (async () => {
      try {
        await workspace.flushLocal();
        const rows = await Promise.all(selectedBook.chapters.map(async item => {
          const stored = await store.read(copyDraftKey(principalScope, selectedBook.id, item.number, selectedBook.version));
          return { number: item.number, title: item.title, ...copyingChapterProgress(item.blocks, stored) };
        }));
        if (!cancelled) progressRows = rows;
      } catch { if (!cancelled) progressError = true; }
      finally { if (!cancelled) progressBusy = false; }
    })();
    return () => { cancelled = true; };
  });
  let sourceVisible = $state(true);
  let sourceElement = $state<HTMLDivElement>();
  let sourceLayoutVersion = $state(0);
  let lastFollowPanel: HTMLElement | undefined;
  let lastFollowTop = -1;
  $effect(() => {
    const panel = sourceElement;
    if (!panel || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { lastFollowTop = -1; sourceLayoutVersion++; });
    observer.observe(panel);
    return () => observer.disconnect();
  });
  const sourceSentences = $derived.by(() => {
    if (loading || !chapter || !draft || draft.sutraId !== selected || draft.chapter !== chapterNumber) return [];
    const source = chapter.blocks[block], layout = sourceLayouts[selected]?.[chapterNumber - 1]?.[block];
    if (typeof source !== 'string') return [];
    return copyingSentences(chapter.blocks, block, layout ? copySourceLayoutLines(source, layout) : undefined);
  });
  const sourceWordLines = $derived(copyingSourceWordLines(sourceSentences));
  const sourceSentenceGroups = $derived.by(() => {
    const groups: { line: (typeof sourceSentences)[number]; index: number }[][] = [];
    sourceSentences.forEach((line, index) => {
      const last = groups[groups.length - 1];
      if (last && last[0].line.paragraph === line.paragraph) last.push({ line, index });
      else groups.push([{ line, index }]);
    });
    return groups;
  });
  const typedRuns = $derived.by(() => {
    let offset = 0;
    const start = editorPages[editorPage], end = editorPages[editorPage + 1] ?? text.length;
    return formatTypedCopy(sourceSentences, text).flatMap(run => {
      const left = Math.max(start, offset), right = Math.min(end, offset + run.text.length);
      const clipped = right > left ? [{ ...run, text: run.text.slice(left - offset, right - offset) }] : [];
      offset += run.text.length; return clipped;
    });
  });
  const fullGhostRuns = $derived(formatGhostRuns(sourceSentences));
  const canonicalTraceEligible = $derived(fullGhostRuns.map(run => run.text).join('').startsWith(text));
  const ghostRuns = $derived.by(() => {
    if (!ghostEnabled) return [];
    const alignedRuns = alignGhostRuns(fullGhostRuns, text) ?? fullGhostRuns;
    if (continuousScroll) return alignedRuns;
    const start = editorPages[editorPage], end = editorPages[editorPage + 1] ?? Infinity;
    return clipGhostRuns(alignedRuns, start, end);
  });
  const followText = $derived(caretPosition === null ? text : text.slice(0, caretPosition));
  const currentPosition = $derived(copyingCursorPosition(sourceSentences, followText));
  const currentSentence = $derived(currentPosition.sentence);
  const currentWord = $derived(currentPosition.word);
  $effect(() => {
    void sourceLayoutVersion;
    const word = currentWord;
    const index = currentSentence, panel = sourceElement, fontSize = sourceFontSize, sentences = sourceSentences;
    if (step !== 'write' || !sourceVisible || composing || !panel || !sentences.length) return;
    let cancelled = false, frame: number | undefined;
    void tick().then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
      if (sourceElement !== panel || sourceSentences !== sentences || currentSentence !== index || currentWord !== word || composing || step !== 'write') return;
      const sentence = panel.querySelector<HTMLElement>('[data-copy-sentence="' + index + '"]');
      if (!sentence) return;
      const anchor = sentence.querySelector<HTMLElement>('[data-copy-word="' + word + '"]') ?? sentence;
      const bounds = panel.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
      const margin = Math.min(fontSize, panel.clientHeight * 0.15);
      if (rect.top >= bounds.top + margin && rect.bottom <= bounds.bottom - margin) return;
      const top = Math.max(0, Math.min(panel.scrollHeight - panel.clientHeight,
        panel.scrollTop + rect.top - bounds.top - panel.clientHeight * 0.25));
      if (Math.abs(panel.scrollTop - top) < 1) return;
      lastFollowPanel = panel; lastFollowTop = top;
      const instant = keyboardOpen || window.matchMedia('(max-width:700px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches || Math.abs(top - panel.scrollTop) > panel.clientHeight * 2;
      panel.scrollTo({ top, behavior: instant ? 'auto' : uiScrollBehavior() });
      });
    });
    return () => { cancelled = true; if (frame !== undefined) cancelAnimationFrame(frame); };
  });
  $effect(() => {
    if (speechState !== 'playing' || readingSentence === null || !sourceVisible || !sourceElement) return;
    const targetIdx = readingSentence;
    const panel = sourceElement;
    const sentence = panel.querySelector<HTMLElement>('[data-copy-sentence="' + targetIdx + '"]');
    if (!sentence) return;
    const anchor = readingWord !== undefined ? (sentence.querySelector<HTMLElement>('[data-copy-word="' + readingWord + '"]') ?? sentence) : sentence;
    const bounds = panel.getBoundingClientRect(), rect = anchor.getBoundingClientRect();
    if (rect.top >= bounds.top + bounds.height * 0.15 && rect.bottom <= bounds.bottom - bounds.height * 0.25) return;
    const top = Math.max(0, Math.min(panel.scrollHeight - panel.clientHeight, panel.scrollTop + rect.top - bounds.top - panel.clientHeight * 0.3));
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollTo({ top, behavior: reduced ? 'auto' : uiScrollBehavior() });
  });
  let optionsOpen = $state(false);
  let keyboardOpen = $state(false);
  let fullscreen = $state(false);
  let fullscreenAvailable = $state(false);
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { message = 'Trình duyệt chưa cho phép mở toàn màn hình.'; }
  }
  let authOpen = $state(false);
  async function toggleOptions() {
    optionsOpen = !optionsOpen;
    await tick();
    const target = optionsOpen ? document.querySelector<HTMLElement>('#copy-options button') : document.getElementById('copy-options-trigger');
    target?.focus({ preventScroll: true });
  }
  let selectionTitle = $state<HTMLHeadingElement>();
  let preparationTitle = $state<HTMLHeadingElement>();
  let writingTitle = $state<HTMLHeadingElement>();
  async function prepareCopying(id?: CopyBookId) {
    if (!mounted || networkBusy || restarting) return;
    if (id) { selected = id; chapterNumber = 1; }
    step = 'guide'; optionsOpen = false;
    await tick(); preparationTitle?.focus();
  }
  $effect(() => {
    if (!mounted || step === 'write') return;
    document.dispatchEvent(new CustomEvent('qts:practice-header', {
      detail: { active: true, title: localizeUi('Chép kinh'), onBack: step === 'guide' ? chooseAgain : () => void goto('/tu-tap') },
    }));
    return () => document.dispatchEvent(new CustomEvent('qts:practice-header', { detail: { active: false } }));
  });
  async function beginWriting() {
    if (loading || !chapter || !draft || networkBusy) return;
    // Request within the button gesture, before tick consumes user activation.
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
    step = 'write'; optionsOpen = false;
    await tick(); writingTitle?.focus({ preventScroll: true });
    scheduleEditorReflow();
  }
  async function chooseAgain() {
    if (networkBusy || restarting) return;
    cancelAutoAdvance();
    step = 'choose'; optionsOpen = false;
    await tick(); selectionTitle?.focus({ preventScroll: true });
  }
  function writingKeys(event: KeyboardEvent) {
    if (step !== 'write' || event.isComposing || authOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (optionsOpen) void toggleOptions(); else void chooseAgain();
      return;
    }
    if (event.key !== 'Tab') return;
    const root = (optionsOpen ? document.getElementById('copy-options') : event.currentTarget) as HTMLElement;
    const controls = [...root.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === writingTitle)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  $effect(() => {
    if (step !== 'write') return;
    const releaseScroll = lockBodyScroll();
    fullscreenAvailable = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
    const fullscreenChanged = () => { fullscreen = Boolean(document.fullscreenElement); };
    fullscreenChanged();
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.body.classList.add('copying-workspace-open');
    const shellElements = [...document.querySelectorAll<HTMLElement>('.qts-header,.qts-nav,.tt-topbar,.qts-bottom-nav,[data-guest-notice-banner],.qts-footer')];
    const previousInert = shellElements.map(node => node.inert);
    shellElements.forEach(node => { node.inert = true; });
    const authChanged = (event: Event) => {
      authOpen = Boolean((event as CustomEvent<{ open: boolean }>).detail?.open);
      document.body.classList.toggle('copying-auth-open', authOpen);
      shellElements.forEach((node, index) => {
        if (node.matches('.qts-header,.qts-nav,.tt-topbar')) node.inert = authOpen ? previousInert[index] : true;
      });
    };
    window.addEventListener('quangtu:login-modal-state', authChanged);
    const viewport = window.visualViewport;
    const coarsePointer = window.matchMedia('(pointer:coarse)');
    let fullHeight = Math.max(window.innerHeight, viewport?.height ?? 0);
    let lastViewport = '';
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const editing = Boolean(document.activeElement?.closest('#copy-text'));
      if (!editing) fullHeight = Math.max(fullHeight, window.innerHeight, height);
      const touchKeyboard = coarsePointer.matches || (document.documentElement.dataset.nativeApp === 'true' && navigator.maxTouchPoints > 0);
      const nextKeyboardOpen = touchKeyboard && editing && fullHeight - height > 120;
      const signature = `${height}:${viewport?.offsetTop ?? 0}:${window.innerWidth}:${nextKeyboardOpen}`;
      if (signature === lastViewport) return;
      lastViewport = signature;
      keyboardOpen = nextKeyboardOpen;
      document.documentElement.style.setProperty('--copy-viewport-height', (viewport?.height ?? window.innerHeight) + 'px');
      document.documentElement.style.setProperty('--copy-viewport-top', (viewport?.offsetTop ?? 0) + 'px');
      lastFollowTop = -1;
      sourceLayoutVersion++;
      void tick().then(() => { followEditorCaret(); scheduleEditorReflow(); });
    };
    untrack(update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    coarsePointer.addEventListener('change', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      releaseScroll();
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      if (document.fullscreenElement === document.documentElement) void document.exitFullscreen().catch(() => {});
      document.body.classList.remove('copying-workspace-open', 'copying-auth-open');
      window.removeEventListener('quangtu:login-modal-state', authChanged);
      shellElements.forEach((node, index) => { node.inert = previousInert[index]; });
      document.documentElement.style.removeProperty('--copy-viewport-height');
      document.documentElement.style.removeProperty('--copy-viewport-top');
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      coarsePointer.removeEventListener('change', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  });

</script>

<svelte:head><title>{localizeUi("Chép kinh — Tu tập Phật pháp")}</title><meta name="description" content={localizeUi("Tự tay chép kinh, rà soát sai thiếu và tự lưu trên thiết bị. Chỉ lưu lên tài khoản khi bạn bấm lưu.")} /></svelte:head>

<div class="copy-page" data-paper={paper} class:copy-writing={step === 'write'} class:keyboard-open={keyboardOpen} style:--copy-line-height={lineSpacing} data-testid="copying-page" data-practice-route-back={step !== 'write' ? true : undefined} role={step === 'write' ? 'dialog' : undefined} aria-modal={step === 'write' ? true : undefined} aria-label={step === 'write' ? localizeUi('Không gian chép kinh') : undefined} tabindex="-1" onkeydown={writingKeys}>
  {#if step === 'choose'}
    <header class="choose-header"><span class="eyebrow">{localizeUi("TỪNG CHỮ CHUYÊN TÂM")}</span><h1 bind:this={selectionTitle} tabindex="-1">{localizeUi("Chép kinh")}</h1><p>{localizeUi("Chọn một bộ kinh, dành một khoảng lặng để tự tay chép lời kinh.")}</p></header>
    <ol class="stepper" aria-label={localizeUi('Các bước chép kinh')}><li aria-current="step"><span>1</span>{localizeUi('Chọn kinh')}</li><li><span>2</span>{localizeUi('Hướng dẫn')}</li><li><span>3</span>{localizeUi('Chép kinh')}</li></ol>
    <section class="selection-section" aria-labelledby="choose-sutra-title">
      <h2 id="choose-sutra-title">{localizeUi('Bạn muốn chép bộ kinh nào?')}</h2>
      <nav class="books" aria-label={localizeUi("Chọn bộ kinh")}>
        {#each COPYING_BOOKS as item, index}
          <button type="button" class:active={selected === item.id} aria-pressed={selected === item.id} disabled={!mounted || networkBusy} onclick={() => void prepareCopying(item.id)}>
            <span class="book-number">0{index + 1}</span><strong>{item.title}</strong><small>{item.count} {localizeUi(item.unit)}</small>
            {#if selected === item.id}<Check size={18} class="selected-mark" aria-hidden="true" />{/if}
          </button>
        {/each}
      </nav>
      <div class="chapter-choice"><label for="copy-chapter">{localizeUi("Phẩm / quyển")}</label><select id="copy-chapter" disabled={loading || networkBusy} value={chapterNumber} onchange={e => chapterNumber = Number(e.currentTarget.value)}>{#if book}{#each book.chapters as item}<option value={item.number}>{item.title}</option>{/each}{/if}</select></div>
      {#if loading}<p role="status" class="muted">{localizeUi("Đang mở bản chép trên máy…")}</p>{:else if localError}<p role="alert" class="error">{localStatus}</p>{:else if draft?.texts.some(Boolean)}<p class="resume-note">{localizeUi('Có bản chép trên máy · Tiếp tục từ đoạn {0}', block + 1)}</p>{/if}
      <button class="primary start-copying" data-testid="start-copying" type="button" disabled={loading || !chapter || !draft || networkBusy} onclick={() => void prepareCopying()}><BookOpen size={20} aria-hidden="true" />{localizeUi('Xem hướng dẫn và tiếp tục')}<ChevronRight size={19} aria-hidden="true" /></button>
      <p class="selection-hint">{localizeUi('Tự lưu trên thiết bị. Đăng nhập khi bạn muốn lưu vào tài khoản.')}</p>
    </section>

    <section class="selection-progress" aria-labelledby="copy-progress-title" aria-busy={loading || progressBusy}>
      <h2 id="copy-progress-title" class="sr-only">{localizeUi('Tiến độ chép kinh')}</h2>
      <button class="progress-row" type="button" title={book?.title} disabled={loading || progressBusy || progressError || localError || !draft || networkBusy} onclick={() => void prepareCopying()}>
        <span>{book?.title || localizeUi('Tiến độ chép kinh')}</span><strong>{loading || progressBusy ? '…' : progressError || localError ? '—' : progressPercent + '%'}</strong>
      </button>
      {#if progressError || localError}<span class="sr-only" role="status">{localizeUi('Chưa đọc được tiến độ trên thiết bị. Bản chép được giữ nguyên.')}</span>{/if}
    </section>
    {#if showIntro}<aside class="notice" aria-labelledby="copy-notice-title"><h2 id="copy-notice-title">{localizeUi("Bản chép được lưu ở đâu?")}</h2><p>{localizeUi(COPY_NOTICE)}</p><button type="button" onclick={dismissIntro}>{localizeUi("Đã hiểu")}</button></aside>{/if}
  {:else if step === 'guide'}
    <header class="choose-header"><span class="eyebrow">{localizeUi('BƯỚC 2 · CHUẨN BỊ')}</span><h1 bind:this={preparationTitle} tabindex="-1">{localizeUi('Hướng dẫn trước khi chép kinh')}</h1><p>{selectedBookInfo?.title}</p></header>
    <ol class="stepper" aria-label={localizeUi('Các bước chép kinh')}><li><span>1</span>{localizeUi('Chọn kinh')}</li><li aria-current="step"><span>2</span>{localizeUi('Hướng dẫn')}</li><li><span>3</span>{localizeUi('Chép kinh')}</li></ol>
    <CopyingPreparation />
    <section class="selection-section" aria-labelledby="copy-preparation-book">
      <h2 id="copy-preparation-book">{selectedBookInfo?.title}</h2>
      <div class="chapter-choice"><label for="copy-chapter">{localizeUi('Phẩm / quyển')}</label><select id="copy-chapter" disabled={loading || networkBusy} value={chapterNumber} onchange={e => chapterNumber = Number(e.currentTarget.value)}>{#if book?.id === selected}{#each book.chapters as item}<option value={item.number}>{item.title}</option>{/each}{/if}</select></div>
      {#if loading}<p role="status" class="muted">{localizeUi('Đang mở bản chép trên máy…')}</p>{:else if localError}<p role="alert" class="error">{localStatus}</p>{:else if draft?.texts.some(Boolean)}<p class="resume-note">{localizeUi('Có bản chép trên máy · Tiếp tục từ đoạn {0}', block + 1)}</p>{/if}
      <button class="primary start-copying" data-testid="confirm-copying-guide" type="button" disabled={loading || !chapter || !draft || networkBusy} onclick={beginWriting}><PenLine size={20} aria-hidden="true" />{localizeUi('Tôi đã đọc, tiếp tục chép')}<ChevronRight size={19} aria-hidden="true" /></button>
      <p class="selection-hint">{localizeUi('Tự lưu trên thiết bị. Đăng nhập khi bạn muốn lưu vào tài khoản.')}</p>
    </section>
  {:else}
    <header class="writing-bar" inert={optionsOpen}>
      <button class="icon-button" type="button" aria-label={localizeUi('Đổi kinh hoặc phẩm')} title={localizeUi('Đổi kinh hoặc phẩm')} disabled={networkBusy} onclick={chooseAgain}><ChevronLeft size={23} aria-hidden="true" /></button>
      <div class="writing-title"><span class="eyebrow">{localizeUi('BƯỚC 2 · CHÉP KINH')}</span><h1 bind:this={writingTitle} tabindex="-1">{book?.title}</h1><p title={chapter?.title}>{chapter?.title}</p></div>
      {#if fullscreenAvailable}<button class="icon-button" type="button" title={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} aria-label={fullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'} onclick={toggleFullscreen}>{#if fullscreen}<Minimize size={19} aria-hidden="true" />{:else}<Maximize size={19} aria-hidden="true" />{/if}</button>{/if}
      <button class="icon-button" type="button" aria-label={localizeUi('Tùy chọn và bản đã lưu')} title={localizeUi('Tùy chọn và bản đã lưu')} id="copy-options-trigger" aria-expanded={optionsOpen} aria-controls="copy-options" onclick={toggleOptions}><Settings size={22} strokeWidth={1.8} aria-hidden="true" /></button>
      <button class="primary save-button" type="button" disabled={loading || !draft || networkBusy} onclick={save}>{networkBusy ? localizeUi("Đang xử lý…") : draft?.pending ? localizeUi("Thử lưu lại lên hệ thống") : localizeUi("Lưu lên hệ thống")}</button>
    </header>
    <div class="save-status" class:error={localError}><span role="status">{localStatus || localizeUi("Đang mở bộ nhớ ứng dụng…")}</span><span class="account-note">{draft?.dirty ? localizeUi('Chưa lưu thay đổi vào tài khoản') : draft?.savedAt ? localizeUi('Đã lưu vào tài khoản') : localizeUi('Bản chép chỉ ở trên thiết bị')}</span></div>
    {#if message}<div class="message" role="status"><p>{message}</p><button class="icon-button" type="button" aria-label={localizeUi('Đóng thông báo')} onclick={() => message = ''}><X size={18} aria-hidden="true" /></button></div>{/if}
    {#if guestDraft?.texts.some(Boolean)}<aside class="guest-draft"><p>{localizeUi("Có bản chép khách trên thiết bị này. Bản đó chưa được lưu vào tài khoản.")}</p><button type="button" onclick={adoptGuest} disabled={networkBusy}>{localizeUi("Tiếp tục bản chép khách trong tài khoản")}</button></aside>{/if}
    {#if loading || (draft && (draft.sutraId !== selected || draft.chapter !== chapterNumber))}<p role="status">{localizeUi("Đang mở bản chép trên máy…")}</p>
    {:else if chapter && draft}
      <div class="block-toolbar">
        <div class="block-nav"><button class="icon-button" type="button" aria-label={localizeUi('Đoạn trước')} disabled={block === 0} onclick={() => goBlock(block - 1)}><ChevronLeft size={20} aria-hidden="true" /></button><label for="copy-block">{localizeUi('Đoạn')}</label><select id="copy-block" value={block} onchange={e => goBlock(Number(e.currentTarget.value))}>{#each chapter.blocks as _, i}<option value={i}>{i + 1}{copyingTextCompletion(chapter.blocks[i], draft.texts[i] ?? '').accepted ? ' ✓' : ''}</option>{/each}</select><span class="muted">/ {chapter.blocks.length}</span><button class="icon-button" type="button" aria-label={localizeUi('Đoạn sau')} disabled={block === chapter.blocks.length - 1} onclick={() => goBlock(block + 1)}><ChevronRight size={20} aria-hidden="true" /></button></div>
        <label class="font-picker"><span class="sr-only">{localizeUi('Phông chữ')}</span><select aria-label={localizeUi('Phông chữ')} value={selectedFont} onchange={chooseFont}>{#each fontOptions as font}<option value={font.id}>{localizeUi(font.name)}</option>{/each}</select></label>
      </div>
      <p class="book-run-progress" role="status">{localizeUi('Lượt {0} · Đã hoàn thành {1}/{2} phẩm/quyển', (bookSnapshot?.previousRuns.length ?? 0) + 1, completedChapters, book?.chapters.length ?? 0)}</p>
      <progress class="chapter-progress" max={100} value={chapterCompletion.percent} aria-label={localizeUi('Tiến độ chép kinh')} title={localizeUi('Đạt từ 90% được ghi nhận hoàn thành. Rà soát chỉ để tham khảo.')}></progress>
      {#if bookComplete || chapterComplete}<div class="completion-banner" class:book-complete={bookComplete}><div><strong>{localizeUi(bookComplete ? 'Đã chép trọn bộ kinh' : 'Đã chép xong phẩm/quyển này')}</strong><p role="status">{localizeUi(completionError ? 'Chưa ghi được công phu. Hãy thử lại trước khi mở lượt mới.' : bookComplete ? bookSnapshot?.legacyCompleted ? 'Bản chép cũ và lịch sử công phu được giữ nguyên.' : 'Đã ghi nhận 1 lượt vào Công phu của tôi. Bản chép được giữ nguyên.' : 'Chỉ ghi nhận 1 lượt công phu khi hoàn thành trọn bộ kinh.')}</p></div>{#if completionError}<button type="button" onclick={() => void recordCompletion()}>{localizeUi('Thử lại')}</button>{:else if bookComplete}<div class="book-run-actions"><button class="primary" type="button" disabled={restarting || networkBusy || composing || completionRun !== bookSnapshot?.runId} onclick={restartCopy}>{localizeUi('Bắt đầu lượt {0}', (bookSnapshot?.previousRuns.length ?? 0) + 2)}</button><button type="button" onclick={() => { archivePreview = draft; optionsOpen = true; }}>{localizeUi('Xem bản đã chép')}</button><a href="/tien-do-tu-tap">{localizeUi('Công phu của tôi')}</a></div>{:else if book && chapterNumber < book.chapters.length}<button type="button" onclick={() => { focusAfterChapter = { scope, book: selected, chapter: chapterNumber + 1 }; chapterNumber++; }}>{localizeUi('Sang phẩm/quyển tiếp theo')}</button>{:else if nextIncompleteChapter > 0}<button type="button" onclick={() => { focusAfterChapter = { scope, book: selected, chapter: nextIncompleteChapter }; chapterNumber = nextIncompleteChapter; }}>{localizeUi('Tiếp tục phẩm/quyển chưa hoàn thành: {0}', nextIncompleteChapter)}</button>{/if}</div>{/if}
      <div class="writing-grid" inert={optionsOpen} class:source-hidden={!sourceVisible}>
        <section class="source-panel" aria-labelledby="copy-source-title">
          <div class="panel-heading"><h2 id="copy-source-title">{localizeUi('Kinh mẫu')} <small>{block + 1}/{chapter.blocks.length}</small></h2>
            {#if sourceVisible}<div class="source-font-controls" role="group" aria-label={localizeUi('Cỡ chữ')}><button type="button" aria-label={localizeUi('Giảm cỡ chữ')} disabled={sourceFontSize <= 14} onclick={() => sourceFontSize = Math.max(14, sourceFontSize - 2)}>A−</button><output aria-live="polite">{sourceFontSize}px</output><button type="button" aria-label={localizeUi('Tăng cỡ chữ')} disabled={sourceFontSize >= 40} onclick={() => sourceFontSize = Math.min(40, sourceFontSize + 2)}>A+</button></div>{/if}
            <button class="sample-speech" class:reading={speechState === 'playing'} type="button" disabled={speechState === 'loading'} aria-busy={speechState === 'loading'} aria-pressed={speechState === 'playing'} onpointerdown={event => { if (editor?.hasFocus()) event.preventDefault(); }} onclick={toggleSampleSpeech}>{#if speechState === 'playing'}<Square size={17} fill="currentColor" aria-hidden="true" />{:else}<Volume2 size={22} strokeWidth={1.8} aria-hidden="true" />{/if}{localizeUi(speechState === 'loading' ? 'Đang chuẩn bị đọc…' : speechState === 'playing' ? 'Dừng đọc' : speechState === 'paused' ? 'Đọc tiếp' : 'Đọc để chép')}</button>
            <button class="source-toggle" type="button" aria-expanded={sourceVisible} aria-controls="copy-source-text" onclick={() => sourceVisible = !sourceVisible}>{sourceVisible ? localizeUi('Thu gọn') : localizeUi('Hiện kinh mẫu')}{#if sourceVisible}<ChevronUp size={16} aria-hidden="true" />{:else}<ChevronDown size={16} aria-hidden="true" />{/if}</button>
          </div>
          {#if speechState === 'playing' || speechState === 'paused' || speechState === 'loading'}<p class="speech-status" role="status"><span aria-hidden="true"></span>{localizeUi(speechState === 'playing' ? 'Đang đọc kinh mẫu' : speechState === 'paused' ? 'Đã dừng · Đọc tiếp để tiếp tục' : 'Đang chuẩn bị đọc…')}</p>{/if}
          {#if sourceVisible}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex (The reference scroll area must be keyboard accessible.) -->
            <div id="copy-source-text" bind:this={sourceElement} class="source notranslate" translate="no" lang="vi" class:admin-copy={canPaste} role="document" tabindex="0" aria-label={localizeUi('Nội dung kinh mẫu')} style:font-size={sourceFontSize + 'px'} oncopy={disallow} oncut={disallow} oncontextmenu={disallow}>
              {#each sourceSentenceGroups as group}<p class="source-paragraph" style:text-align={group[0].line.align}>{#each group as {index: sentenceIndex}}<span class="source-line" class:source-line--current={sentenceIndex === currentSentence} class:source-line--reading={speechState === 'playing' && sentenceIndex === readingSentence} data-copy-sentence={sentenceIndex} aria-current={sentenceIndex === currentSentence ? 'true' : undefined}>{#each sourceWordLines[sentenceIndex] as part}<span data-copy-word={part.word} class:source-guidance={part.italic} class:source-word--current={sentenceIndex === currentSentence && part.word === currentWord} class:source-word--reading={speechState === 'playing' && sentenceIndex === readingSentence && (readingWord === undefined || part.word === readingWord)}>{#if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}</span>{/each}</span>{/each}</p>{/each}
            </div>
          {/if}
        </section>
        <section class="editor-panel" aria-labelledby="copy-editor-title">
          <div class="panel-heading editor-heading">
            <label id="copy-editor-title" for="copy-text">{localizeUi('Bản chép của bạn')}</label>
            <div class="editor-tools">
              <button class="ghost-toggle-btn" type="button" disabled={composing} aria-pressed={ghostEnabled} title={localizeUi(ghostEnabled ? 'Đang bật chữ in mờ (vở chép kinh)' : 'Bật chữ in mờ để chép')} onclick={toggleGhostMode}>{localizeUi('Chữ mờ')}</button>
              <div class="compact-editor-display">
                <select aria-label={localizeUi('Phông chữ')} value={selectedFont} disabled={composing} onchange={chooseFont}>{#each fontOptions as font (font.id)}<option value={font.id}>{localizeUi(font.name)}</option>{/each}</select>
                <select aria-label={localizeUi('Cỡ chữ bản chép')} value={editorFontSize} disabled={composing} onchange={e => changeEditorFontSize(Number(e.currentTarget.value) - editorFontSize)}>{#each [14,16,18,20,22,24,26,28,30,32,34,36,38,40] as size (size)}<option value={size}>{size}</option>{/each}</select>
              </div>
              <div class="source-font-controls editor-font-controls" role="group" aria-label={localizeUi('Cỡ chữ bản chép')}>
                <button type="button" aria-label={localizeUi('Giảm cỡ chữ bản chép')} disabled={editorFontSize <= 14 || composing} onclick={() => changeEditorFontSize(-2)}>A−</button><output aria-live="polite">{editorFontSize}px</output><button type="button" aria-label={localizeUi('Tăng cỡ chữ bản chép')} disabled={editorFontSize >= 40 || composing} onclick={() => changeEditorFontSize(2)}>A+</button>
              </div>
              <button class="icon-button" type="button" disabled={composing} aria-pressed={continuousScroll} aria-label="Cuộn liên tục" title={continuousScroll ? 'Chuyển sang chia trang' : 'Chuyển sang cuộn liên tục'} onclick={toggleEditorScroll}>{#if continuousScroll}<ArrowDownUp size={18} aria-hidden="true" />{:else}<BookOpen size={18} aria-hidden="true" />{/if}</button>
              {#if !continuousScroll}<div class="editor-pages" role="group" aria-label={localizeUi('Trang gõ')}><button type="button" aria-label={localizeUi('Trang gõ trước')} disabled={editorPage === 0 || composing} onclick={() => goEditorPage(editorPage - 1)}><ChevronLeft size={16} aria-hidden="true" /></button><output aria-live="polite">{editorPage + 1}/{editorPages.length}</output><button type="button" aria-label={localizeUi('Trang gõ sau')} disabled={editorPage === editorPages.length - 1 || composing} onclick={() => goEditorPage(editorPage + 1)}><ChevronRight size={16} aria-hidden="true" /></button></div>{/if}
            </div>
          </div>
          <RichCopyEditor editingContext={JSON.stringify([scope, selected, chapterNumber, block, editorPage])} readonly={restarting} allowPaste={canPaste} bind:this={editor} value={pageText} runs={typedRuns} {ghostRuns} traceCanonical={canonicalTraceEligible} showGhost={ghostEnabled} font={editorFont} scale={editorScale} size={editorFontSize} label={localizeUi('Tự gõ bản chép của bạn')} placeholder={localizeUi('Chậm rãi gõ từng lời kinh…')} invalid={issues.length > 0} maxlength={Math.max(0, chapter.blocks[block].length * 2 + 1000 - (text.length - pageText.length))} onreferencepaste={pasteReference} onlayout={scheduleEditorReflow} onvalue={input} onbeforeinput={beforeInput} ondisallow={disallow} oncaret={followEditorCaret} oncomposing={active => { composing = active; if (active) cancelAutoAdvance(); if (!active) { pageTurnPending = true; followEditorCaret(); if (reflowPending) { reflowPending = false; scheduleEditorReflow(); } checkTypingAutoAdvance(text, ''); } }} /><span class="copy-note">{localizeUi('Phần trong ngoặc ( ) là hướng dẫn, không bắt buộc chép.')}</span><span id="copy-input-help" class="sr-only">{localizeUi(canPaste ? "Quản trị viên có thể dán văn bản để kiểm tra." : "Không hỗ trợ dán hoặc kéo thả. Bạn có thể sửa, xóa và gõ dấu tiếng Việt.")}</span>
          <div class="review-actions"><button type="button" onclick={() => review(true)}>{localizeUi('Rà soát đoạn này')}</button>{#if copyingTextCompletion(chapter.blocks[block], text).accepted}<strong>{#if autoAdvancePending || autoAdvancingBlock}{localizeUi('✓ Đã xong · Đang chuyển đoạn tiếp theo…')}{:else}{localizeUi('✓ Đạt yêu cầu chép')}{/if}</strong>{#if block < chapter.blocks.length - 1}<button type="button" class="btn-next-block" onclick={() => void triggerAutoAdvanceBlock()}>{localizeUi('Sang đoạn tiếp theo')} →</button>{/if}{:else}<span class="muted">{localizeUi(canPaste ? 'Quản trị · Cho phép dán' : 'Tự gõ · Không dán văn bản')}</span>{/if}</div>
          {#if issues.length}<section class="issues" aria-label={localizeUi('Vị trí cần sửa')}><div class="issues-heading"><h3>{issues.length} {localizeUi('vị trí cần rà soát')}</h3><button type="button" aria-label={localizeUi('Đóng rà soát')} onclick={() => { issues = []; checked = false; }}><X size={16} aria-hidden="true" /></button></div><ol>{#each issues as issue}<li><button type="button" onclick={() => pointTo(issue)}>{issue.kind === 'missing' ? localizeUi('Thiếu “{0}”', issue.expected) : issue.kind === 'extra' ? localizeUi('Thừa “{0}”', issue.actual) : localizeUi('Bạn gõ “{0}” · Bản kinh “{1}”', issue.actual, issue.expected)} <small>{localizeUi('— vị trí')} {issue.start + 1}</small></button></li>{/each}</ol></section>{:else if checked}<div class="review-success-banner" role="status"><p class="review-success">{localizeUi('Đoạn này đã chép đúng bản kinh.')}</p>{#if block < chapter.blocks.length - 1}<button type="button" class="btn-next-block" onclick={() => void triggerAutoAdvanceBlock()}>{localizeUi('Chép đoạn tiếp theo')} ({block + 2}/{chapter.blocks.length}) →</button>{/if}</div>{/if}
        </section>
      </div>
    {/if}
    {#if optionsOpen}
      <button type="button" class="options-backdrop" tabindex="-1" aria-label={localizeUi('Đóng nền tùy chọn')} onclick={toggleOptions}></button>
      <div id="copy-options" class="options-panel" data-dialog-glass role="dialog" aria-modal="true" aria-labelledby="copy-options-title" style:--copy-line-height={lineSpacing}>
        <div class="panel-heading"><h2 id="copy-options-title">{localizeUi('Cài đặt chép kinh')}</h2><button class="icon-button" type="button" aria-label={localizeUi('Đóng tùy chọn')} onclick={toggleOptions}><X size={21} aria-hidden="true" /></button></div>
        <section class="storage-details">
          <h3>{localizeUi('Đọc để chép')}</h3>
          <p>{localizeUi('Dùng trình đọc Kinh sách. Ưu tiên giọng ngoại tuyến đã cài trên thiết bị.')}</p>
          <div class="setting-row"><span>{localizeUi('Giọng đọc')}</span>{#if nativeSpeechSettings}<button type="button" onclick={openSpeechSettings}>{localizeUi('Cài đặt giọng thiết bị')}<ChevronRight size={16} aria-hidden="true" /></button>{:else}<span class="muted">{localizeUi('Mặc định thiết bị')}</span>{/if}</div>
          <div class="setting-row"><label for="copy-speech-rate">{localizeUi('Tốc độ đọc')}</label>
          <select id="copy-speech-rate" bind:value={speechRate} onchange={(event) => sampleSpeech.setRate(Number(event.currentTarget.value))}>{#each [0.3, 0.5, 0.8, 1, 1.2, 1.5] as rate (rate)}<option value={rate}>{rate}×</option>{/each}</select></div>
        </section>
        {#if chapter && draft}
          <section class="storage-details"><fieldset class="paper-picker"><legend>{localizeUi('Nền giấy')}</legend><div>{#each [{id:'white',label:'Trắng'},{id:'cream',label:'Kem'},{id:'gray',label:'Xám'}] as option (option.id)}<button type="button" class:chosen={paper === option.id} aria-pressed={paper === option.id} onclick={() => choosePaper(option.id as typeof paper)}><span class="paper-swatch" data-paper={option.id} aria-hidden="true">≡</span>{localizeUi(option.label)}{#if paper === option.id}<Check size={16} aria-hidden="true" />{/if}</button>{/each}</div></fieldset></section>
          <section class="mobile-writing-options storage-details">
            <h3>{localizeUi('Hiển thị')}</h3>
            
            <label for="mobile-copy-block">{localizeUi('Đoạn')}</label>
            <select id="mobile-copy-block" value={block} onchange={e => goBlock(Number(e.currentTarget.value))}>{#each chapter.blocks as _, i}<option value={i}>{i + 1} / {chapter.blocks.length}</option>{/each}</select>
            <label for="mobile-copy-font">{localizeUi('Phông chữ')}</label>
            <select id="mobile-copy-font" value={selectedFont} onchange={chooseFont}>{#each fontOptions as font}<option value={font.id}>{localizeUi(font.name)}</option>{/each}</select>
            <label for="mobile-source-size">{localizeUi('Cỡ chữ kinh mẫu')}</label>
            <select id="mobile-source-size" value={sourceFontSize} onchange={e => sourceFontSize = Number(e.currentTarget.value)}>{#each [14,16,18,20,22,24,26,28,30,32,34,36,38,40] as size}<option value={size}>{size}px</option>{/each}</select>
            <label for="mobile-editor-size">{localizeUi('Cỡ chữ bản chép')}</label>
            <select id="mobile-editor-size" value={editorFontSize} disabled={composing} onchange={e => changeEditorFontSize(Number(e.currentTarget.value) - editorFontSize)}>{#each [14,16,18,20,22,24,26,28,30,32,34,36,38,40] as size}<option value={size}>{size}px</option>{/each}</select>
            <label for="copy-line-spacing">{localizeUi('Khoảng cách dòng')}</label>
            <select id="copy-line-spacing" bind:value={lineSpacing} onchange={scheduleEditorReflow}>{#each [1.5,1.8,1.9,2] as spacing (spacing)}<option value={spacing}>{spacing}×</option>{/each}</select>
          </section>
        {/if}
        <section class="storage-details">{#if canPaste}<div class="admin-copy-actions"><button type="button" onclick={() => copyReference()}>{localizeUi('Sao chép đoạn kinh mẫu')}</button><button type="button" onclick={() => copyReference(true)}>{localizeUi('Sao chép toàn bộ kinh mẫu')}</button></div>{/if}<p>{localizeUi('Đạt từ 90% được ghi nhận hoàn thành. Rà soát chỉ để tham khảo.')}</p><h3>{localizeUi('Bản chép được lưu ở đâu?')}</h3><p>{localizeUi(COPY_NOTICE)}</p><p>{draft?.savedAt ? localizeUi('Bản hệ thống: {0}', formatTime(draft.savedAt)) : localizeUi('Chưa lưu lên hệ thống')}</p><p>{!owner ? localizeUi('Đăng nhập để lưu vào tài khoản.') : localizeUi('Bạn có thể lưu cả khi chép dở.')}</p>{#if draft?.pending || draft?.savedAt}<button type="button" disabled={networkBusy} onclick={keepSeparateCopy}>{localizeUi('Giữ bản trên máy thành lượt chép riêng')}</button>{/if}</section>
        {#if draft?.previousRuns?.length || archivePreview}<section class="storage-details"><h3>{localizeUi('Lượt chép trước trên máy')}</h3>{#if draft?.previousRuns?.length}<div class="previous-runs">{#each [...draft.previousRuns].reverse() as runId, index (runId)}<button type="button" onclick={() => previewPrevious(runId)}>{localizeUi('Xem lượt chép {0}', draft.previousRuns!.length - index)}</button>{/each}</div>{/if}{#if archivePreview}<p>{localizeUi('Bản chép cũ được giữ nguyên; lượt hiện tại không thay đổi.')}</p><div class="archive-preview">{#each archivePreview.texts as copied, index (index)}<p>{copied}</p>{/each}</div>{/if}</section>{/if}
        <section class="cloud-panel"><h3>{localizeUi('Bản đã lưu trong tài khoản')}</h3><p>{localizeUi('Chỉ tải khi bạn bấm xem. Bản dở trên thiết bị khác chưa bấm lưu sẽ không có ở đây.')}</p><button type="button" onclick={() => listCloud()} disabled={cloud.isFetching || networkBusy}>{localizeUi('Xem bản đã lưu trên hệ thống')}</button>{#if cloud.isFetching}<p role="status">{localizeUi('Đang tải danh sách…')}</p>{/if}{#if cloud.error}<p class="error" role="alert">{cloud.error.message}</p>{/if}{#if owner && cloud.data}<ul>{#each cloud.data.copies as copy}<li><span>{formatTime(copy.savedAt)} · {copy.complete ? localizeUi('Đã hoàn thành') : localizeUi('Đang chép')}</span><button type="button" disabled={networkBusy || copy.sourceVersion !== book?.version} onclick={() => restore(copy.runId)}>{localizeUi('Mở bản này')}</button></li>{:else}<li>{localizeUi('Không có bản lưu khác của phẩm/quyển này.')}</li>{/each}</ul>{#if cloud.data.nextCursor}<button type="button" disabled={cloud.isFetching || networkBusy} onclick={() => listCloud(cloud.data!.nextCursor!)}>{localizeUi('Xem bản cũ hơn')}</button>{/if}{/if}</section>
        <p class="edition-note">{localizeUi('Bản chép theo văn bản đang có trong Tu tập, gồm cả nghi thức mở đầu/kết thúc của từng phẩm/quyển. Đối chiếu theo đúng bản này; không tự sửa cách viết cổ.')}</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .issues{color:var(--text)}
  .ghost-toggle-btn{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;padding:var(--radius-sm) calc(var(--radius-sm) * 2);font-size:var(--font-size-meta);font-weight:600;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg2);color:var(--text2);cursor:pointer;transition:background .15s,color .15s,border-color .15s;white-space:nowrap}
  .ghost-toggle-btn:hover{background:var(--bg3);color:var(--text)}
  .ghost-toggle-btn[aria-pressed="true"]{background:var(--gold-light,var(--bg3));border-color:var(--gold);color:var(--brown);font-weight:700}
  .compact-editor-display{display:none}
  @media(max-width:700px){
    .copy-writing .compact-editor-display{display:flex;gap:calc(var(--space-page) / 5);min-width:0}
    .copy-writing .compact-editor-display select{min-height:44px;padding:calc(var(--space-page) / 5);font-size:11px;min-width:0;border-radius:var(--radius-sm);color:var(--text);background:var(--bg2)}
    .copy-writing .compact-editor-display select:first-child{width:86px}
    .copy-writing .compact-editor-display select:last-child{width:48px}
    .copy-writing .editor-heading>label{min-width:0;flex:1;line-height:1.4}
    .copy-writing .editor-tools>.icon-button{min-width:44px!important;min-height:44px!important}
    .copy-writing .editor-tools{flex-shrink:0}
  }
  .completion-banner.book-complete{flex-direction:column;align-items:stretch}
  .book-complete strong{display:block;text-align:center;font-weight:700}
  .keyboard-open .book-run-progress{display:none}
  .book-run-progress{color:var(--text2);margin:0;flex-shrink:0}
  .book-run-actions{display:flex;gap:calc(var(--space-page) * .4);flex-wrap:wrap;align-items:center}
  @media(max-width:700px){.book-run-actions{flex-direction:column;align-items:stretch}}
  .book-run-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:calc(var(--space-page) * .4);border:1px solid var(--border);border-radius:var(--radius-control);color:var(--text);text-decoration:none}
  .choose-header h1,.selection-section h2,.notice h2,.options-panel h2,.options-panel h3{font-weight:700;text-align:center}
  .choose-header p,.notice p,.storage-details>p,.cloud-panel>p,.edition-note{text-align:justify}
  /* Giấy vẫn sáng trong chế độ tối; chữ trên giấy dùng màu mực riêng. */
  .copy-writing .source-panel h2 small,.copy-writing .copy-note,.copy-writing .review-actions .muted,.copy-writing .review-actions strong,.copy-writing .review-success{color:var(--copy-paper-ink)}
  .copy-writing .editor-tools>.icon-button{color:var(--text)}
  .mobile-writing-options{display:none}
  .source-paragraph{margin:0 0 .15em;white-space:pre-line;text-align-last:auto}
  .source-paragraph[style*="justify"]{text-align-last:left}
  .source-paragraph .source-line{margin:0;white-space:normal}
  .source-word--current{background:var(--gold-light,var(--bg3));border-radius:3px;text-decoration:underline;text-decoration-color:var(--gold);text-underline-offset:4px}.admin-copy-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}

  .copy-note{font-size:10px;line-height:1.4;color:var(--text2);padding:5px 12px;flex-shrink:0}.issues-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.issues-heading button{display:flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;padding:4px}

  .editor-tools{display:flex;align-items:center;justify-content:space-between;gap:14px}.editor-font-controls{border-right:1px solid var(--border);padding-right:12px}.editor-font-controls button{min-width:34px;min-height:34px}.editor-heading{row-gap:3px}
  @media(max-width:700px){.editor-heading{flex-wrap:wrap}.editor-heading>label{flex-basis:100%;margin-right:0}.editor-tools{width:100%;gap:8px}.editor-font-controls{border:0;padding:0}.editor-font-controls button{min-height:32px;min-width:34px}.editor-tools .editor-pages button{min-height:32px;width:32px}}

  .completion-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-shrink:0;padding:10px 14px;margin-bottom:8px;border:1px solid var(--gold);border-radius:12px;background:var(--gold-light,var(--bg2));font-size:12px}.completion-banner p{font-size:11px;margin:3px 0 0;color:var(--text2)}.completion-banner button{flex-shrink:0;font-size:12px;font-weight:600}.previous-runs{display:flex;gap:8px;flex-wrap:wrap}.archive-preview{max-height:40vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid var(--border);border-radius:10px;padding:12px}


  .selection-progress{margin-top:14px}.progress-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%;padding:13px 16px;text-align:left;border:1px solid var(--border);border-radius:12px;background:var(--bg2)}.progress-row span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:600}.progress-row strong{flex-shrink:0;font-size:16px;color:var(--brown);font-variant-numeric:tabular-nums}

  :global(.copying-workspace-open:not(.copying-auth-open) .qts-header),:global(.copying-workspace-open:not(.copying-auth-open) .qts-nav),:global(.copying-workspace-open:not(.copying-auth-open) .tt-topbar),:global(.copying-workspace-open .qts-bottom-nav),:global(:root[data-native-app='true'] .copying-workspace-open .qts-bottom-nav),:global(.copying-workspace-open [data-guest-notice-banner]),:global(.copying-workspace-open .qts-footer){display:none!important}
  /* Chỉ màn chọn/chuẩn bị dành chỗ theo chiều cao thật của thanh điều hướng. */
  .copy-page:not(.copy-writing){padding-top:calc(var(--practice-topbar-height,calc(64px + var(--app-safe-top,env(safe-area-inset-top,0px)))) + var(--space-page))}
  .copy-page{max-width:1040px;margin:0 auto;padding:26px 24px 100px;color:var(--text);font-family:var(--font-ui,inherit)}
  button,select{font:inherit;color:inherit}button,select{min-height:44px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);padding:10px 14px}button{cursor:pointer}button:disabled{cursor:default;opacity:.45}button:focus-visible,select:focus-visible,.source:focus-visible{outline:3px solid var(--gold);outline-offset:2px}h1,h2,h3,p{margin:0}p{line-height:1.6}h2{font-size:19px}h3{font-size:16px}.muted,.selection-hint,.edition-note{color:var(--text2);font-size:12px}.error{color:var(--danger-text)}.eyebrow{font-size:10px;letter-spacing:.13em;color:var(--text2)}.choose-header h1{font:700 var(--font-size-section-title)/1.3 var(--font-app);margin:8px 0}.choose-header p{color:var(--text2);max-width:550px;font-size:15px}.choose-header h1:focus,.writing-title h1:focus{outline:none}
  .stepper{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));align-items:center;gap:12px;list-style:none;padding:0;margin:26px 0}.stepper li{display:flex;align-items:center;gap:9px;color:var(--text2);font-size:14px}.stepper li[aria-current]{color:var(--brown);font-weight:700}.stepper span{display:grid;place-items:center;width:28px;height:28px;background:var(--bg3);border-radius:50%;border:1px solid var(--border)}.stepper li[aria-current] span{background:var(--gold);color:var(--on-gold,#fff);border-color:var(--gold)}
  .selection-section{border:1px solid var(--border);background:var(--bg2);border-radius:22px;padding:26px}.books{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:20px 0 24px}.books button{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;padding:20px 18px;gap:12px;border:2px solid var(--border);min-height:160px;background:var(--bg);transition:border-color .15s,background .15s}.books button.active{border-color:var(--gold);background:var(--gold-light,var(--bg3))}.books strong{font-family:var(--font-reader,serif);font-size:17px;line-height:1.5}.book-number,.books small{color:var(--text2);font-size:12px}.books :global(.selected-mark){position:absolute;right:12px;top:15px;color:var(--brown)}.chapter-choice{display:grid;gap:9px}.chapter-choice label{font-size:13px;font-weight:650}.chapter-choice select{width:100%;min-width:0;max-width:100%;padding-right:26px}.primary{display:inline-flex;align-items:center;justify-content:center;gap:10px;background:var(--gold);border-color:var(--gold);color:var(--on-gold,#fff);font-weight:700}.start-copying{width:100%;margin:22px 0 10px;min-height:52px}.selection-hint{text-align:center}.resume-note{font-size:13px;color:var(--brown);margin-top:14px}.notice{margin-top:20px;border-radius:16px;background:var(--bg3);padding:18px 20px;border:1px solid var(--border)}.notice h2{font-size:15px;margin-bottom:8px}.notice p{color:var(--text2);font-size:13px}.notice button{margin-top:12px}
  .copy-writing{position:fixed;inset:0;top:var(--copy-viewport-top,0px);height:100vh;height:var(--copy-viewport-height,100dvh);max-width:none;width:100%;box-sizing:border-box;z-index:150;background:var(--bg);padding:0 max(20px,calc((100vw - 1440px)/2)) max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;overflow:hidden}
  .writing-bar{display:flex;align-items:center;gap:12px;padding:12px 0 8px;flex-shrink:0}.icon-button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;padding:8px;flex-shrink:0}.writing-title{flex:1;min-width:0}.writing-title h1{font-size:16px;line-height:1.4;margin:2px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.writing-title p{font-size:11px;color:var(--text2);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.save-button{font-size:12px;max-width:190px}.save-status{display:flex;justify-content:space-between;gap:12px;color:var(--text2);font-size:11px;padding:0 0 10px;flex-shrink:0}.save-status.error{color:var(--danger-text)}.message{display:flex;align-items:flex-start;gap:8px;background:var(--bg3);border-left:3px solid var(--gold);padding:6px 10px;margin:0 0 8px;max-height:20vh;overflow:auto;flex-shrink:0}.message p{font-size:12px;flex:1}.guest-draft{display:flex;align-items:center;gap:10px;font-size:12px;padding:8px;background:var(--bg3);max-height:20vh;overflow:auto;flex-shrink:0}.guest-draft button{font-size:12px}.block-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-shrink:0}.block-nav{display:flex;align-items:center;gap:8px}.block-nav label{font-size:13px}.block-nav select{max-width:90px;min-width:62px;padding:6px 10px}.font-picker{min-width:0}.font-picker select{width:145px;max-width:100%;font-size:12px;padding:8px}.chapter-progress{display:block;width:100%;height:3px;min-height:3px;margin:10px 0 14px;accent-color:var(--gold);flex-shrink:0}
  .writing-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.12fr);gap:18px;flex:1;min-height:0}.source-panel,.editor-panel{display:flex;flex-direction:column;min-width:0;min-height:0;background:var(--bg2);border:1px solid var(--border);border-radius:16px;overflow:hidden}.panel-heading{display:flex;align-items:center;gap:10px;padding:10px 14px;flex-shrink:0;flex-wrap:wrap}.panel-heading h2,.panel-heading label{font-size:13px;font-weight:700;margin-right:auto}.source-font-controls{display:flex;align-items:center;gap:7px}.source-font-controls button{padding:6px;min-width:40px;min-height:40px;font-size:14px;font-weight:700}.source-font-controls output{font-size:11px;min-width:30px;font-variant-numeric:tabular-nums;text-align:center}.source-toggle{display:flex;align-items:center;gap:5px;border:0;background:none;padding:5px;font-size:11px;min-height:40px}.source{font-family:var(--font-reader,serif);font-size:20px;line-height:1.8;user-select:none;-webkit-user-select:none;overflow-wrap:anywhere;overflow:auto;overscroll-behavior:contain;flex:1;padding:10px 20px 24px;scrollbar-width:thin}.source-line{margin:0 0 .5em;line-height:inherit;white-space:pre-wrap}.source-line:last-child{margin-bottom:0}.review-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;border-top:1px solid var(--border);flex-shrink:0}.review-actions button{font-size:12px;padding:8px 12px}.review-actions strong{font-size:11px;color:var(--brown)}.review-actions .muted{font-size:10px}.source-hidden{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}.source-hidden .source-panel{align-self:start}.issues{max-height:24vh;overflow:auto;padding:12px 16px;background:var(--bg3);border-top:1px solid var(--border);flex-shrink:0}.issues h3{color:var(--danger-text);font-size:13px}.issues ol{padding-left:20px;margin:6px 0}.issues li{margin:6px 0}.issues button{text-align:left;font-size:12px;overflow-wrap:anywhere;padding:8px;min-height:36px}.review-success{padding:8px 14px;font-size:12px;color:var(--brown)}
  .options-panel{position:absolute;right:max(16px,calc((100vw - 1440px)/2));top:68px;bottom:max(16px,env(safe-area-inset-bottom));width:min(440px,calc(100% - 32px));z-index:3;overflow:auto;box-sizing:border-box;background:var(--bg2);border:1px solid var(--border);border-radius:18px;box-shadow:0 12px 48px #0003;padding:6px 18px 20px}.options-panel>.panel-heading{position:sticky;top:-6px;z-index:1;background:var(--bg2);padding:8px 0;border-bottom:1px solid var(--border)}.storage-details,.cloud-panel{padding:18px 0;border-bottom:1px solid var(--border)}.options-panel h3{margin-bottom:8px}.options-panel p{font-size:13px;color:var(--text2);margin:8px 0}.options-panel button{font-size:12px}.cloud-panel ul{list-style:none;padding:0}.cloud-panel li{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px;margin:12px 0}.edition-note{margin-top:16px!important}
  @media(max-width:700px){.copy-page{padding:20px 14px 90px}.choose-header h1{font-size:var(--font-size-section-title)}.choose-header p{font-size:var(--font-size-body)}.stepper{margin:20px 0;gap:8px}.stepper li{flex-direction:column;text-align:center;font-size:12px}.selection-section{padding:18px 14px;border-radius:18px}.selection-section h2{font-size:var(--font-size-card-title)}.books{grid-template-columns:1fr;gap:9px;margin:16px 0}.books button{min-height:78px;padding:12px 34px 12px 13px;display:grid;grid-template-columns:24px 1fr;gap:4px 10px}.books strong{font-size:15px}.books small{grid-column:2}.book-number{align-self:center}.chapter-choice select{font-size:12px}.selection-hint{font-size:11px}.copy-writing{padding:0 10px max(6px,env(safe-area-inset-bottom))}.writing-bar{padding:7px 0 5px;gap:6px}.writing-title h1{font-size:12px}.writing-title p{display:none}.writing-title .eyebrow{font-size:8px}.writing-bar .icon-button{min-width:40px;min-height:40px;padding:7px}.save-button{max-width:105px;font-size:10px;padding:7px 9px;min-height:40px;line-height:1.4}.save-status{font-size:10px;padding-bottom:6px}.account-note{max-width:52%;text-align:right}.block-toolbar{gap:5px}.block-nav{gap:5px}.block-nav label{font-size:12px}.block-nav .icon-button{min-width:36px;min-height:36px;padding:4px}.block-nav select{min-height:36px;min-width:58px;font-size:12px;padding:5px}.font-picker select{width:120px;min-height:36px;font-size:11px;padding:5px}.chapter-progress{margin:5px 0 8px}.writing-grid,.source-hidden{display:flex;flex-direction:column;gap:8px}.source-panel{flex:0 1 auto;max-height:36%;border-radius:12px}.source-hidden .source-panel{align-self:stretch;max-height:none;flex-shrink:0}.panel-heading{padding:5px 9px;gap:5px;flex-wrap:nowrap}.panel-heading h2,.panel-heading label{font-size:12px}.source-font-controls{gap:3px}.source-font-controls button{min-width:36px;min-height:36px;font-size:12px;padding:5px}.source-font-controls output{font-size:10px;min-width:28px}.source-toggle{font-size:10px;min-height:36px;padding:4px;gap:2px}.source-toggle :global(svg){width:12px}.source{max-height:20vh;max-height:20dvh;padding:4px 12px 12px;flex:0 1 auto;line-height:1.7}.editor-panel{flex:1;border-radius:12px}.review-actions{padding:5px 8px;gap:6px}.review-actions button{font-size:11px;min-height:36px;padding:7px 10px}.review-actions .muted{font-size:9px}.options-panel{top:55px;right:10px;bottom:8px;width:calc(100% - 20px)}.issues{max-height:20vh;padding:8px 12px}.message p,.guest-draft{font-size:11px}.guest-draft button{font-size:10px;padding:6px}}
  .source.admin-copy{user-select:text;-webkit-user-select:text}.source-line--current{background:var(--gold-light,var(--bg3));box-shadow:-3px 0 0 var(--gold);border-radius:3px}.source-panel h2 small{font:400 10px/1.2 var(--font-ui,inherit);color:var(--text2);white-space:nowrap}
  .editor-pages{display:flex;align-items:center;gap:5px}.editor-pages button{display:flex;align-items:center;justify-content:center;padding:4px;min-width:34px;min-height:34px}.editor-pages output{font-size:11px;min-width:34px;text-align:center;font-variant-numeric:tabular-nums}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.keyboard-open .source{max-height:64px}.keyboard-open .source-panel{max-height:32%}.keyboard-open .review-actions .muted,.keyboard-open .account-note,.keyboard-open .writing-title .eyebrow{display:none}
  @media(max-height:520px){.writing-title .eyebrow,.save-status .account-note{display:none}.writing-bar{padding:3px 0}.source-panel{max-height:32%}.source{max-height:14dvh}.chapter-progress{margin:3px 0}.panel-heading{padding-block:3px}.review-actions{padding-block:3px}}
  @media(max-width:700px){
    .mobile-writing-options{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);align-items:center;gap:12px 8px}
    .mobile-writing-options label{font-size:12px}
    .mobile-writing-options select{min-width:0;width:100%;min-height:40px;font-size:13px}
    .copy-writing .block-toolbar,.copy-writing .source-font-controls,.copy-writing .writing-title .eyebrow,.copy-writing .account-note{display:none}
    .copy-writing{padding-inline:6px}
    .copy-writing .writing-bar{gap:5px;padding:4px 0}
    .copy-writing .writing-bar .icon-button{min-width:36px;min-height:36px;padding:6px}
    .copy-writing .save-button{min-height:36px;max-width:96px;font-size:10px;padding:5px 7px}
    .copy-writing .save-status{font-size:10px;padding-bottom:3px}
    .copy-writing .chapter-progress{margin:2px 0 5px}
    .copy-writing .panel-heading{padding:3px 8px;min-height:34px;flex-wrap:nowrap}
    .copy-writing .editor-heading>label{flex-basis:auto;margin-right:auto}
    .copy-writing .editor-tools{width:auto;gap:4px}
    .copy-writing .editor-tools>.icon-button{min-width:34px;min-height:34px;padding:5px}
    .copy-writing .editor-tools>.ghost-toggle-btn{min-height:44px;padding:4px 7px;font-size:11px}
    @media(max-width:360px){
      .compact-editor-display select:first-child{width:68px}
      .compact-editor-display select:last-child{width:44px}
      .ghost-toggle-btn{padding:3px 5px;font-size:10px}
      .editor-heading>label{font-size:11px}
    }
    .copy-writing .source-panel,.copy-writing .editor-panel{border-radius:8px}
    .copy-writing .source-toggle{min-height:34px}
    .copy-writing .copy-note{display:none}
    .keyboard-open.copy-writing{padding:0 6px max(2px,env(safe-area-inset-bottom))}
    .keyboard-open .writing-bar{padding:3px 0;gap:5px}
    .keyboard-open .writing-bar .icon-button{min-width:32px;min-height:32px;padding:4px}
    .keyboard-open .save-button{min-height:32px;padding:4px 7px}
    .keyboard-open .save-status{font-size:9px;padding-bottom:2px}
    .keyboard-open .block-toolbar,.keyboard-open .source-font-controls,.keyboard-open .copy-note{display:none}
    .keyboard-open .chapter-progress{margin:2px 0 4px}
    .keyboard-open .writing-grid{gap:5px}
    .keyboard-open .source-panel{flex:0 0 36%;max-height:36%;border-radius:8px}
    .keyboard-open .source-hidden .source-panel{flex:0 0 auto}
    .keyboard-open .source{flex:1;min-height:0;max-height:none;padding:3px 10px 6px;line-height:1.5}
    .keyboard-open .panel-heading{min-height:28px;padding:2px 8px}
    .keyboard-open .source-toggle{min-height:28px}
    .keyboard-open .editor-panel{flex:1;min-height:0;border-radius:8px}
    .keyboard-open .review-actions{padding:2px 6px}
    .keyboard-open .review-actions button{min-height:28px;padding:3px 8px;font-size:10px}
  }

  .copy-writing{padding:0 max(20px,calc((100vw - 1440px)/2)) max(10px,env(safe-area-inset-bottom))}
  .options-panel{bottom:max(16px,env(safe-area-inset-bottom))}.copy-writing{padding:0 10px max(6px,env(safe-area-inset-bottom))}
    .keyboard-open.copy-writing{padding:0 6px max(2px,env(safe-area-inset-bottom))}
  :global(:root[data-native-app='true']) .copy-writing{padding-top:var(--app-safe-top,env(safe-area-inset-top,0px))}
  :global(:root[data-native-app='true']) .options-panel{top:calc(55px + var(--app-safe-top,env(safe-area-inset-top,0px)))}
    .copy-writing .options-panel,:global(:root[data-native-app='true']) .copy-writing .options-panel{padding-bottom:max(var(--space-page),env(safe-area-inset-bottom))}
  button{min-height:44px}
  select{min-height:44px}
  /* CSS web cũ dùng nút nhỏ; mobile giữ vùng chạm kể cả khi bàn phím đang mở. */
  .copy-writing button,.copy-writing select{min-height:44px;min-width:44px}
  .copy-writing .writing-bar .icon-button,.copy-writing .save-button,.copy-writing .source-toggle,.copy-writing .editor-tools>.icon-button,.copy-writing .review-actions button,.copy-writing .block-nav .icon-button{min-height:44px;min-width:44px}
  :global(body:has(.copy-page) .tt-topbar button){min-width:44px;min-height:44px}

  .copy-page[data-paper='white']{--copy-paper:var(--copy-paper-white)}
  .copy-page[data-paper='cream']{--copy-paper:var(--copy-paper-cream)}
  .copy-page[data-paper='gray']{--copy-paper:var(--copy-paper-gray)}
  .copy-writing .source-panel,.copy-writing .editor-panel{background:var(--copy-paper);color:var(--copy-paper-ink)}
  .copy-writing .source,.copy-writing :global(.rich-copy),.copy-writing :global(.rich-copy-ghost){color:var(--copy-paper-ink)}
  .copy-writing :global(.rich-copy[data-empty='true']::before){color:var(--copy-paper-ink);opacity:.55}
  .copy-writing .source-font-controls button,.copy-writing .review-actions button{color:var(--text)}
  .copy-writing .source-line--current,.copy-writing .source-word--current{background:var(--copy-paper-cream);color:var(--copy-paper-ink)}
  .setting-row{display:flex;align-items:center;justify-content:space-between;gap:var(--radius);margin-top:var(--radius)}
  .mobile-writing-options>h3{grid-column:1/-1}
  .sample-speech{display:inline-flex;align-items:center;justify-content:center;gap:var(--radius);color:var(--brown)}
  .sample-speech :global(svg){flex-shrink:0}
  #copy-options-trigger{color:var(--brown);border-color:var(--border);background:var(--gold-light)}
  .paper-picker{border:0;padding:0;margin:var(--radius-card) 0}
  .paper-picker legend{font-weight:600;margin-bottom:var(--radius-sm)}
  .paper-picker>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--radius-sm)}
  .paper-picker button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--radius-sm);min-height:44px;padding:var(--radius);position:relative}
  .paper-picker button.chosen{border-color:var(--gold);box-shadow:inset 0 0 0 1px var(--gold)}
  .paper-picker button :global(svg){position:absolute;right:var(--radius-sm);top:var(--radius-sm);color:var(--brown)}
  .paper-swatch{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--copy-paper-ink)}
  .paper-swatch[data-paper='white']{background:var(--copy-paper-white)}
  .paper-swatch[data-paper='cream']{background:var(--copy-paper-cream)}
  .paper-swatch[data-paper='gray']{background:var(--copy-paper-gray)}
  .source-line--reading{background:rgba(200,150,62,.15)!important;box-shadow:-4px 0 0 var(--gold)!important;border-radius:4px}
  .source-word--reading{background:#ffe58f!important;color:#24180c!important;border-radius:4px;box-shadow:0 0 0 2px #ffe58f,0 2px 6px rgba(212,168,75,.35);display:inline-block}
  .btn-next-block{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;min-height:36px;border-radius:var(--radius-control,8px);background:var(--gold);color:var(--on-gold,#24180c);border:1px solid var(--gold);font-weight:700;font-size:12px;cursor:pointer;transition:transform .15s ease,background .15s ease}
  .btn-next-block:hover{background:var(--gold2);transform:translateX(2px)}
  .review-success-banner{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 14px;background:var(--gold-light,rgba(212,175,55,.1));border-radius:8px;margin-top:4px}
  .review-success-banner .review-success{padding:0}
  :root[data-theme="dark"] .source-line--reading{background:rgba(212,168,75,.18)!important;box-shadow:-4px 0 0 var(--gold2)!important}
  :root[data-theme="dark"] .source-word--reading{background:#d4a84b!important;color:#1a0f05!important;box-shadow:0 0 0 2px #d4a84b,0 0 10px rgba(212,168,75,.5)}
  .options-panel{background:var(--dialog-surface-background,var(--card));border-color:var(--dialog-surface-border,var(--border));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .options-panel>.panel-heading{background:var(--dialog-surface-background,var(--card))}
</style>
