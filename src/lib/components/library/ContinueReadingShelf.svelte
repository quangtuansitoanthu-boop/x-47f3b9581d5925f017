<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();

  import { onMount, untrack } from 'svelte';
  import type { LibraryArticle } from './article';
  import {
    createReadingActivityClient,
    type ReadingActivitySession,
    type ReadingProgressRecord,
  } from '$lib/browser/reading-activity-client';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { createSessionContentGuard } from '$lib/browser/session-content-guard';
  import { getCanonicalVietnameseArticle, getEnglishBookMeta, getLocalizedArticle } from '$lib/domain/library/localized-article';
  import { removeContinueReadingProgressIfCurrent } from './continue-reading-removal';

  interface Props {
    articles?: LibraryArticle[];
    session?: ReadingActivitySession;
    onOpen?: (article: LibraryArticle, progress?: ReadingProgressRecord) => void;
    compactLibrary?: boolean;
  }

  let {
    articles = [],
    session = { authenticated: false, csrfToken: null, user: null },
    onOpen = () => {},
    compactLibrary = false,
  }: Props = $props();

  let progress = $state<ReadingProgressRecord[]>([]);
  let expanded = $state(false);
  let loading = $state(true);
  let unavailable = $state(false);
  let removingKey = $state('');
  let removalError = $state('');
  let client: ReturnType<typeof createReadingActivityClient> | null = null;
  let generation = 0;
  let principalGeneration = 0;
  const principalGuard = createSessionContentGuard(untrack(() => session));

  function articleFor(row: ReadingProgressRecord): LibraryArticle | null {
    return articles.find((article) => article.id === row.contentId) ?? null;
  }

  function isLibraryProgress(row: ReadingProgressRecord): boolean {
    if (row.contentKind === 'practice') return false;
    const source = articleFor(row);
    if (source && (source.category === 'KINH PHẬT' || source.category === 'CÁC NGHI THỨC')) {
      return false;
    }
    if (articles.length > 0 && !source) {
      return false;
    }
    return true;
  }

  const libraryProgress = $derived(progress.filter(isLibraryProgress));
  const recent = $derived(expanded ? libraryProgress : libraryProgress.slice(0, 3));

  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEnglish = $derived(localeStore.current === 'en');
  const t = $derived(localeStore.t.library);

  const CHAPTER_PREFIX_MAP: Array<[RegExp, string]> = [
    [/^Lời giới thiệu\b[:\s-]*/i, 'Introduction: '],
    [/^Lời mở đầu\b[:\s-]*/i, 'Prologue: '],
    [/^Lời tựa\b[:\s-]*/i, 'Preface: '],
    [/^Lời bạt\b[:\s-]*/i, 'Epilogue: '],
    [/^Phần một\b[:\s-]*/i, 'Part One: '],
    [/^Phần hai\b[:\s-]*/i, 'Part Two: '],
    [/^Phần ba\b[:\s-]*/i, 'Part Three: '],
    [/^Phần bốn\b[:\s-]*/i, 'Part Four: '],
    [/^Phần năm\b[:\s-]*/i, 'Part Five: '],
    [/^Phần sáu\b[:\s-]*/i, 'Part Six: '],
    [/^Phần bảy\b[:\s-]*/i, 'Part Seven: '],
    [/^Phần tám\b[:\s-]*/i, 'Part Eight: '],
    [/^Phần chín\b[:\s-]*/i, 'Part Nine: '],
    [/^Phần mười\b[:\s-]*/i, 'Part Ten: '],
    [/^Phần (\d+)\b[:\s-]*/i, 'Part $1: '],
    [/^Chương (\d+)\b[:\s-]*/i, 'Chapter $1: '],
    [/^Hồi (\d+)\b[:\s-]*/i, 'Chapter $1: '],
    [/^Tập (\d+)\b[:\s-]*/i, 'Volume $1: '],
    [/^Quyển (\d+)\b[:\s-]*/i, 'Book $1: '],
    [/^Tiết (\d+)\b[:\s-]*/i, 'Section $1: '],
    [/^Mục (\d+)\b[:\s-]*/i, 'Section $1: '],
  ];

  const SPECIFIC_TITLES_EN: Record<string, string> = {
    'Phần hai: Atlantis - Tiền kiếp dậy sóng': 'Part Two: Atlantis - The Ancient Wave Rising',
    'Phần một: Colorado - Cuộc hội ngộ tiền định': 'Part One: Colorado - The Predestined Encounter',
    'Lời giới thiệu: Hành trình Muôn Kiếp Nhân Sinh': 'Introduction: The Journey - Many Lives Many Times',
    'Lời mở đầu: Đài Bắc - Nhân duyên kỳ ngộ': 'Prologue: Taipei - Divine Predestination',
    'Lời tựa': 'Preface',
    'Phần ba: Nghiệp quả - Quả báo và Luân hồi': 'Part Three: Karma - Karmic Fruit and Retribution',
    'Phần bốn: Ai Cập - Thần linh không ở trong tượng đá': 'Part Four: Egypt - The Divine Not in the Statue',
    'Phần năm: Pharaoh - Quyền lực và tình yêu': 'Part Five: Pharaoh - Power and Love',
    'Phần sáu: Luân hồi các nền văn minh - Không có gì là vĩnh hằng': 'Part Six: Samsara of Civilizations - Nothing Lasts Forever',
  };

  function localizeChapterTitle(rawTitle: string, chapIdx: number | null, locale: string): string {
    if (!rawTitle) {
      return chapIdx !== null ? (locale === 'en' ? `${t.chapters} ${chapIdx + 1}` : `Chương ${chapIdx + 1}`) : '';
    }
    if (locale !== 'en') return rawTitle;

    const trimmed = rawTitle.trim();
    if (SPECIFIC_TITLES_EN[trimmed]) {
      return SPECIFIC_TITLES_EN[trimmed];
    }

    for (const [pattern, replacement] of CHAPTER_PREFIX_MAP) {
      if (pattern.test(trimmed)) {
        return trimmed.replace(pattern, replacement);
      }
    }

    return rawTitle;
  }

  function getDisplayBookTitle(row: ReadingProgressRecord, source: LibraryArticle | null, locale: string): string {
    if (source?.title) return source.title;
    if (locale === 'en') {
      const en = getEnglishBookMeta(row.contentId);
      if (en?.title) return en.title;
    } else {
      const vi = getCanonicalVietnameseArticle(row.contentId);
      if (vi?.title) return vi.title;
    }
    return locale === 'en' ? 'Content no longer available' : 'Nội dung không còn khả dụng';
  }

  function positionLabel(row: ReadingProgressRecord): string {
    if (row.contentKind === 'pdf' && row.position.page) return `${t.readingPage} ${row.position.page}`;
    if (row.percent >= 100) return t.completedBadge;
    const chapIdx = row.position.chapterIdx !== undefined && row.position.chapterIdx !== null
      ? Number(row.position.chapterIdx)
      : (row.position.chapterId !== undefined && !Number.isNaN(Number(row.position.chapterId)) ? Number(row.position.chapterId) : null);
    if (chapIdx !== null && Number.isInteger(chapIdx) && chapIdx >= 0) {
      const rawTitle = row.position.chapterTitle ? String(row.position.chapterTitle) : '';
      const chapTitle = localizeChapterTitle(rawTitle, chapIdx, localeStore.current);
      return `${t.readingChapter} ${chapTitle || `${t.chapters} ${chapIdx + 1}`}`;
    }
    if (row.position.chapterId) return t.readingSingleChapter;
    return t.readingStatus;
  }

  function progressSummary(row: ReadingProgressRecord): string {
    if (row.percent >= 100) return '100%';
    const chapPercent = row.position.chapterPercent !== undefined ? Number(row.position.chapterPercent) : null;
    const chapIdx = row.position.chapterIdx !== undefined && row.position.chapterIdx !== null
      ? Number(row.position.chapterIdx)
      : (row.position.chapterId !== undefined && !Number.isNaN(Number(row.position.chapterId)) ? Number(row.position.chapterId) : null);
    if (chapPercent !== null && chapPercent > 0 && chapIdx !== null && Number.isInteger(chapIdx) && chapIdx >= 0) {
      return `${Math.round(chapPercent)}% (${t.totalProgress}: ${Math.round(row.percent)}%)`;
    }
    return `${Math.round(row.percent)}%`;
  }

  async function loadProgress(): Promise<void> {
    if (!client) return;
    const request = ++generation;
    loading = true;
    unavailable = false;
    progress = client.cachedProgress();
    try {
      const rows = await client.listProgress(50);
      if (request === generation) progress = rows;
    } catch {
      if (request === generation) unavailable = true;
    } finally {
      if (request === generation) loading = false;
    }
  }

  async function remove(row: ReadingProgressRecord): Promise<void> {
    if (!client) return;
    const key = `${row.contentKind}:${row.contentId}`;
    const requestGeneration = principalGeneration;
    const principalToken = principalGuard.capture();
    const isCurrent = () => requestGeneration === principalGeneration
      && principalGuard.isCurrent(principalToken);
    removingKey = key;
    removalError = '';
    try {
      await removeContinueReadingProgressIfCurrent(client, row, isCurrent, (result) => {
        if (!result.removed) {
          removalError = result.error;
          return;
        }
        progress = progress.filter((item) => `${item.contentKind}:${item.contentId}` !== key);
        if (result.syncDeferred) unavailable = true;
      });
    } finally {
      if (isCurrent()) removingKey = '';
    }
  }

  function open(row: ReadingProgressRecord): void {
    const article = articleFor(row);
    if (article) onOpen(article, row);
  }

  onMount(() => {
    client = createReadingActivityClient(fetch, localStorage);
    client.setSession(session);
    void loadProgress();
    const sessionChanged = (event: Event) => {
      const next = (event as CustomEvent<ReadingActivitySession>).detail;
      if (principalGuard.transition(next)) {
        principalGeneration += 1;
        expanded = false;
        removingKey = '';
        removalError = '';
      }
      client?.setSession(next);
      void loadProgress();
    };
    const onProgressUpdated = () => {
      void loadProgress();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    window.addEventListener('quangtu:reading-progress-updated', onProgressUpdated);
    return () => {
      generation += 1;
      principalGeneration += 1;
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
      window.removeEventListener('quangtu:reading-progress-updated', onProgressUpdated);
    };
  });
</script>

<section class="continue-reading" class:compact-library={compactLibrary} aria-labelledby="continue-reading-title" aria-busy={loading}>
  <header>
    <div>
      {#if !compactLibrary}<span>{isEnglish ? 'YOUR LIBRARY' : localizeUi("THƯ VIỆN CỦA BẠN")}</span>{/if}
      <h2 id="continue-reading-title">{isEnglish ? 'Continue reading' : localizeUi("Tiếp tục đọc")}</h2>
    </div>
    {#if !compactLibrary}<a href="/trich-dan-cua-toi">{isEnglish ? 'My quotes' : localizeUi("Trích dẫn của tôi")} <span aria-hidden="true">→</span></a>{/if}
  </header>

  <div id="continue-reading-body">
  {#if loading && !recent.length}
    <div class="continue-grid" aria-hidden="true">
      {#each Array(2) as _}<div class="continue-skeleton"></div>{/each}
    </div>
    <span class="sr-only" role="status">{t.loadingProgress}</span>
  {:else if !recent.length}
    <div class="continue-empty">
      <span aria-hidden="true">📖</span>
      <p>{unavailable ? (localeStore.current === 'en' ? 'Unable to load progress. You can open any article to continue reading.' : 'Chưa thể tải tiến độ từ tài khoản. Bạn vẫn có thể mở một bài để tiếp tục đọc.') : (localeStore.current === 'en' ? 'Open an article or PDF, reading position will be automatically saved on this device.' : 'Mở một bài hoặc PDF, vị trí đọc sẽ được lưu tự động trên thiết bị này.')}</p>
    </div>
  {:else}
    {#if removalError}<p class="continue-notice error" role="alert">{removalError}</p>{/if}
    {#if unavailable}<p class="continue-notice" role="status">{localeStore.current === 'en' ? 'Sync temporarily interrupted — displaying on-device data.' : 'Đồng bộ đang gián đoạn — đang hiển thị dữ liệu trên thiết bị.'}</p>{/if}
    <div class="continue-grid" id="continue-reading-books">
      {#each recent as row (`${row.contentKind}:${row.contentId}`)}
        {@const rawSource = articleFor(row)}
        {@const source = rawSource ? getLocalizedArticle(rawSource, localeStore.current) : null}
        <article class:unavailable={!source} class:completed={row.percent >= 100}>
          {#if compactLibrary}<div class="continue-cover" aria-hidden="true">{#if source?.imageUrl}<img src={source.imageUrl} alt="" loading="lazy" decoding="async" width="80" height="112" />{/if}</div>{/if}
          <div class="continue-copy">
            <span>{row.percent >= 100 ? (localeStore.current === 'en' ? '✓ COMPLETED' : '✓ HOÀN THÀNH') : positionLabel(row)}</span>
            <h3>{getDisplayBookTitle(row, source, localeStore.current)}</h3>
            <div class="progress-track" aria-label={`${Math.round(row.percent)} ${localeStore.current === 'en' ? 'percent' : 'phần trăm'}`} role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(row.percent)}>
              <span style={`width:${Math.min(100, Math.max(row.position.chapterPercent !== undefined && Number(row.position.chapterPercent) > 0 ? 3 : 0, row.percent))}%;${row.percent > 0 ? 'min-width:6px;' : ''}`}></span>
            </div>
            <small>{progressSummary(row)} · {source ? (row.contentKind === 'pdf' ? 'PDF' : (source.hasTableOfContents || row.contentKind === 'book' ? (localeStore.current === 'en' ? 'Book' : 'Sách') : (localeStore.current === 'en' ? 'Article' : 'Bài đọc'))) : (localeStore.current === 'en' ? `ID ${row.contentId}` : `Mã ${row.contentId}`)}</small>
          </div>
          <div class="continue-actions">
            <button type="button" disabled={!source} onclick={() => open(row)}>{row.percent >= 100 ? (localeStore.current === 'en' ? 'Read again' : 'Đọc lại') : (localeStore.current === 'en' ? 'Continue' : 'Tiếp tục')}</button>
            <button class="remove" type="button" disabled={removingKey === `${row.contentKind}:${row.contentId}`} aria-label={localeStore.current === 'en' ? `Remove ${getDisplayBookTitle(row, source, localeStore.current)} from continue reading list` : `Xóa ${getDisplayBookTitle(row, source, localeStore.current)} khỏi danh sách tiếp tục đọc`} onclick={() => void remove(row)}>✕</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
  </div>
</section>

<style>
  .compact-library{margin-top:var(--space-page);padding-inline:calc(var(--space-page)*1.4)}
  .compact-library>header{margin-bottom:calc(var(--space-page)*.6)}
  .compact-library .continue-grid{grid-template-columns:minmax(0,1fr)}
  .compact-library .continue-grid article{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;padding:10px 12px;border:1px solid var(--border2);border-radius:14px;background:var(--card);box-shadow:0 2px 8px rgba(0,0,0,.06);transform:none;align-items:center;transition:border-color .2s,box-shadow .2s}
  :root[data-theme="dark"] .compact-library .continue-grid article{background:var(--bg2);border-color:var(--border2);box-shadow:0 3px 12px rgba(0,0,0,.25)}
  .continue-cover{grid-column:1;grid-row:1;align-self:center;overflow:hidden;width:44px;height:64px;border-radius:6px;background:var(--gold-light);box-shadow:0 2px 6px rgba(0,0,0,.15);border:1px solid var(--border2)}
  .continue-cover img{display:block;width:100%;height:100%;object-fit:cover}
  .compact-library .continue-copy{display:flex;flex-direction:column;grid-column:2;grid-row:1;min-width:0;gap:2px}
  .compact-library .continue-copy h3{order:0;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;margin:0 0 2px;padding:0;font-size:.88rem;font-weight:700;line-height:1.35;white-space:normal;text-transform:none;overflow-wrap:anywhere;color:var(--text)}
  .compact-library .continue-copy>span{order:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:.78rem;font-weight:600;line-height:1.3;color:var(--gold2)}
  .compact-library .progress-track{order:2;margin-top:4px;height:5px;border-radius:5px;background:var(--bg3);overflow:hidden}
  .compact-library .progress-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gold),#deb95e)}
  .compact-library .continue-copy small{order:3;margin-top:2px;font-size:.72rem;font-weight:500;line-height:1.3;color:var(--muted)}
  .compact-library .continue-actions{display:flex;flex-direction:column-reverse;grid-column:3;grid-row:1;gap:4px;align-items:flex-end}
  .compact-library .continue-actions button:first-child{min-height:44px;min-width:68px;padding:0 14px;border:0;border-radius:22px;background:linear-gradient(135deg,var(--gold) 0%,var(--gold2,#c99a22) 100%);color:var(--on-gold,#2a1e05);font-size:.8rem;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(200,150,62,.25);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:transform .15s}
  .compact-library .continue-actions button:first-child:active{transform:scale(.96)}
  .compact-library .continue-actions button.remove{width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--muted);font-size:16px;cursor:pointer;opacity:.7;display:inline-flex;align-items:center;justify-content:center;transition:opacity .2s,background .2s,color .2s}
  .compact-library .continue-actions button.remove:hover{opacity:1;background:var(--bg3);color:var(--text)}
  @media(max-width:620px){.compact-library{padding-inline:calc(var(--space-page)*.7)}}
  .continue-reading{max-width:1160px;margin:24px auto 0;padding:0 28px;color:var(--text);font-family:var(--font-app)}.continue-reading>header{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:12px}.continue-reading header span{color:var(--gold);font-size:10px;font-weight:700;letter-spacing:1.8px}.continue-reading h2{margin:2px 0 0;font-size:21px}.continue-reading header a{min-height:36px;display:inline-flex;align-items:center;gap:8px;padding:7px 16px;border:1px solid var(--border2);border-radius:18px;background:var(--white);color:var(--brown)!important;font-size:12px;font-weight:700;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.04);transition:all .2s;white-space:nowrap}.continue-reading header a:hover{background:var(--gold-light);border-color:var(--gold);color:var(--brown-dark)!important;transform:translateY(-1px)}:root[data-theme="dark"] .continue-reading header a{background:var(--bg2);color:var(--gold)!important;border-color:var(--border2)}:root[data-theme="dark"] .continue-reading header a:hover{background:var(--bg3);border-color:var(--gold)}.continue-reading header a:active{transform:scale(.96)}.continue-reading header a:focus-visible,.continue-actions button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}.continue-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.continue-grid article{display:flex;min-width:0;align-items:center;gap:14px;padding:16px;border:1.5px solid transparent;border-radius:18px;background:var(--white);box-shadow:0 4px 16px rgba(0,0,0,.04);transition:box-shadow .25s,transform .25s,border-color .25s}:root[data-theme="dark"] .continue-grid article{background:var(--bg2);border-color:var(--border2);box-shadow:0 4px 16px rgba(0,0,0,.15)}.continue-grid article:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(200,150,62,.12);border-color:var(--gold-light)}:root[data-theme="dark"] .continue-grid article:hover{box-shadow:0 8px 24px rgba(0,0,0,.3);border-color:var(--gold2)}.continue-grid article.completed{border-color:#9ec89a}.continue-grid article.unavailable{border-style:dashed}.continue-copy{min-width:0;flex:1}.continue-copy>span{display:block;overflow:hidden;color:var(--gold);font-size:10px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.continue-copy h3{overflow:hidden;margin:2px 0 7px;padding-top:4px;font-size:14px;line-height:1.55;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}.progress-track{height:6px;overflow:hidden;border-radius:6px;background:var(--bg3)}.progress-track span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--gold),#deb95e)}.continue-copy small{display:block;margin-top:6px;color:var(--muted);font-size:10px}.continue-actions{display:flex;align-items:center;gap:6px}.continue-actions button{min-height:36px;padding:7px 12px;border:0;border-radius:18px;background:var(--gold-light);color:var(--brown);cursor:pointer;font:700 11px var(--font-app);transition:.2s}.continue-actions button:hover{background:var(--gold);color:#fff}:root[data-theme="dark"] .continue-actions button:hover{color:#1a1510}.continue-actions button.remove{width:36px;padding:0;background:transparent;color:var(--muted);font-size:15px;opacity:.6}.continue-actions button.remove:hover{opacity:1;background:var(--bg3);color:var(--text)}.continue-actions button:disabled{cursor:not-allowed;opacity:.5}.continue-empty{display:flex;min-height:92px;align-items:center;justify-content:center;gap:12px;padding:16px;border:1px dashed var(--border);border-radius:12px;background:var(--bg2);color:var(--muted)}.continue-empty>span{font-size:27px}.continue-empty p{max-width:620px;margin:0;font-size:12px;line-height:1.55}.continue-notice{margin:0 0 8px;color:var(--text2);font-size:11px}.continue-notice.error{color:var(--red)}.continue-skeleton{height:102px;border-radius:18px;background:linear-gradient(90deg,var(--bg2),var(--bg3),var(--bg2));background-size:220% 100%;animation:continue-shimmer 1.2s linear infinite}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;margin:-1px;clip:rect(0,0,0,0);white-space:nowrap}@keyframes continue-shimmer{to{background-position:-220% 0}}@media(max-width:900px){.continue-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.continue-reading{margin-top:16px;padding:0 14px}.continue-reading>header{align-items:center}.continue-reading h2{font-size:18px}.continue-grid{grid-template-columns:1fr}.continue-grid article{padding:14px}.continue-actions button:first-child{min-width:70px}}@media(prefers-reduced-motion:reduce){.continue-skeleton{animation:none}}
</style>
