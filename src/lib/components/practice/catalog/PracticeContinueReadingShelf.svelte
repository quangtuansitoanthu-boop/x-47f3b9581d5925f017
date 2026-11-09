<script lang="ts">
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  import { onMount, untrack } from 'svelte';
  import type { PracticeArticleSummary } from '$lib/domain/practice/state';
  import {
    createReadingActivityClient,
    type ReadingActivitySession,
    type ReadingProgressRecord,
  } from '$lib/browser/reading-activity-client';
  import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { createSessionContentGuard } from '$lib/browser/session-content-guard';
  import { removeContinueReadingProgressIfCurrent } from '$lib/components/library/continue-reading-removal';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  interface Props {
    articles?: PracticeArticleSummary[];
    session?: ReadingActivitySession;
    onOpen?: (article: PracticeArticleSummary, autoStart?: boolean) => void;
    isBannerCollapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
  }

  let {
    articles = [],
    session = { authenticated: false, csrfToken: null, user: null },
    onOpen = () => {},
    isBannerCollapsed = $bindable(true),
    onCollapsedChange,
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

  function setCollapsed(collapsed: boolean) {
    if (isBannerCollapsed === collapsed) return;
    isBannerCollapsed = collapsed;
    onCollapsedChange?.(collapsed);
  }

  function articleFor(row: ReadingProgressRecord): PracticeArticleSummary | null {
    return articles.find((article) => article.id === row.contentId) ?? null;
  }

  function isPracticeProgress(row: ReadingProgressRecord): boolean {
    const source = articleFor(row);
    if (!source) return false;
    if (row.contentKind === 'practice') return true;
    return (
      source.category === 'KINH PHẬT' ||
      source.category === 'TRÌ CHÚ' ||
      source.category === 'NGHI THỨC KHÁC' ||
      source.category === 'CÁC NGHI THỨC'
    );
  }

  const practiceProgress = $derived(progress.filter(isPracticeProgress));
  const recent = $derived(expanded ? practiceProgress : practiceProgress.slice(0, 3));
  const firstSource = $derived(recent[0] ? articleFor(recent[0]) : null);

  function positionLabel(row: ReadingProgressRecord): string {
    const isEn = localeStore.current === 'en';
    if (row.percent >= 100) return isEn ? '✓ Completed' : '✓ Đã hoàn thành';
    if (row.position.chapterId != null && !Number.isNaN(Number(row.position.chapterId))) {
      return isEn
        ? `Reciting Chapter ${Number(row.position.chapterId) + 1}`
        : `Đang tụng Phẩm ${Number(row.position.chapterId) + 1}`;
    }
    return isEn ? 'Practicing' : 'Đang công phu';
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

  function open(row: ReadingProgressRecord, autoStart = false): void {
    const article = articleFor(row);
    if (article) onOpen(article, autoStart);
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

  <button class="tt-mode-card tt-mode-card--continue" type="button" onclick={() => setCollapsed(false)}>
    <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="recitation" size={48} /></div>
    <div class="tt-mode-body">
      <span class="tt-mode-kicker">{t.practice.dailyPracticeKicker}<!-- TU TẬP HẰNG NGÀY --></span>
      <span class="tt-mode-title">{t.practice.continuePractice}<!-- Tiếp tục công phu --></span>
      <span class="tt-mode-desc">{firstSource ? firstSource.title : loading ? t.practice.continueLoading : unavailable ? t.practice.continueUnavailable : t.practice.continueEmpty}</span>
    </div>
    <span class="tt-mode-arrow" aria-hidden="true">→</span>
  </button>

  {#if !isBannerCollapsed}
    <div
      class="tt-modal-overlay"
      role="presentation"
      onclick={(e) => { if(e.target === e.currentTarget) setCollapsed(true); }}
      onkeydown={(e) => { if(e.key === 'Escape') setCollapsed(true); }}
    >
      <div
        class="tt-modal-container tt-continue-modal"
        data-dialog-glass
        data-practice="continue"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tt-continue-modal-title"
      >
        <header class="tt-modal-header">
          <div><h2 id="tt-continue-modal-title">{t.practice.continuePractice}</h2><p class="tt-modal-subtitle">{t.practice.dailyPracticeKicker}</p></div>
          <button type="button" class="tt-modal-close" onclick={() => setCollapsed(true)} aria-label={t.practice.backToPractice}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
          </button>
        </header>

        <div class="tt-continue-body">
        {#if removalError}<p class="tt-continue-notice error" role="alert">{removalError}</p>{/if}
        {#if unavailable}<p class="tt-continue-notice" role="status">{localeStore.current === 'en' ? 'Sync interrupted — displaying data stored on device.' : 'Đồng bộ đang gián đoạn — đang hiển thị dữ liệu trên thiết bị.'}</p>{/if}

        <div class="tt-continue-grid" id="practice-continue-reading-list">
          {#each recent as row (`${row.contentKind}:${row.contentId}`)}
            {@const source = articleFor(row)}
            {#if source}
              <article class="tt-continue-card" class:completed={row.percent >= 100}>
                <div class="tt-continue-copy">
                  <div class="tt-continue-meta-top">
                    <span class="tt-continue-badge">
                      {source.category === 'KINH PHẬT' ? `📖 ${t.practice.categorySutras}` : source.category === 'TRÌ CHÚ' ? `🪔 ${t.practice.modeMantras}` : `🕯️ ${t.practice.categoryRituals}`}
                    </span>
                    <span class="tt-continue-status">{positionLabel(row)}</span>
                  </div>
                  <h3 title={source.title}>
                    <button type="button" class="tt-continue-title-btn" onclick={() => open(row, false)}>
                      {source.title}
                    </button>
                  </h3>
                  <div
                    class="progress-track"
                    aria-label={`${Math.round(row.percent)} ${localeStore.current === 'en' ? 'percent' : 'phần trăm'}`}
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={Math.round(row.percent)}
                  >
                    <span style={`width:${Math.min(100, Math.max(0, row.percent))}%`}></span>
                  </div>
                  <small>{Math.round(row.percent)}% · {source.category === 'KINH PHẬT' ? t.practice.categorySutras : source.category === 'TRÌ CHÚ' ? t.practice.modeMantras : t.practice.categoryRituals}</small>
                </div>
                <div class="tt-continue-actions">
                  <button
                    type="button"
                    class="btn-continue"
                    onclick={() => open(row, true)}
                  >
                    <!-- row.percent >= 100 ? 'Tụng lại' : 'Tiếp tục' -->
                    {row.percent >= 100
                      ? (localeStore.current === 'en' ? 'Chant again' : 'Tụng lại')
                      : (localeStore.current === 'en' ? 'Continue' : 'Tiếp tục')}
                  </button>
                  <button
                    class="btn-remove"
                    type="button"
                    disabled={removingKey === `${row.contentKind}:${row.contentId}`}
                    aria-label={localeStore.current === 'en' ? `Remove ${source.title} from practice continue list` : `Xóa ${source.title} khỏi danh sách tiếp tục công phu`}
                    onclick={() => void remove(row)}
                  >✕</button>
                </div>
              </article>
            {/if}
          {:else}
            <p class="tt-continue-notice" role="status">{loading ? t.practice.continueLoading : unavailable ? t.practice.continueUnavailable : t.practice.continueEmpty}</p>
          {/each}
        </div>
        </div>
      </div>
    </div>
  {/if}
<style>
  .tt-mode-kicker{display:block;color:inherit;font-size:var(--font-size-meta);font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
  .tt-modal-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px));background:#0007;backdrop-filter:blur(4px)}
  .tt-modal-container{width:100%;max-width:var(--practice-dialog-width);height:var(--practice-dialog-height);min-height:0;max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--dialog-surface-border,var(--border));border-radius:22px;background:var(--dialog-surface-background,var(--card));color:var(--text);font-family:var(--font-app);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .tt-modal-header{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:22px 20px 18px;border-bottom:1px solid var(--border2)}
  .tt-modal-header h2{margin:0;color:var(--text);font-size:var(--font-size-section-title);line-height:1.4;font-weight:700;letter-spacing:-.4px}
  .tt-modal-subtitle{margin:5px 0 0;color:var(--muted);font-size:var(--font-size-meta);line-height:1.6}
  .tt-modal-close{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:1px solid var(--border2);border-radius:50%;background:var(--card);color:var(--text2);cursor:pointer}
  .tt-modal-close:hover{background:var(--bg2)}
  .tt-continue-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 20px}
  @media(max-width:380px){.tt-modal-header{padding:18px 16px 16px}.tt-continue-body{padding:16px}.tt-modal-header h2{font-size:var(--font-size-section-title)}}
  @keyframes tt-fade-in{from{opacity:0}to{opacity:1}}

  .tt-continue-notice{
    margin:0 0 10px;
    color:var(--text2);
    font-size:var(--font-size-body);
  }
  .tt-continue-notice.error{
    color:var(--red);
  }
  .tt-continue-grid{
    display:grid;
    grid-template-columns:minmax(0,1fr);
    gap:12px;
  }
  .tt-continue-card{
    display:flex;
    min-width:0;
    align-items:center;
    gap:14px;
    padding:14px 16px;
    border:1px solid var(--border2);
    border-radius:14px;
    background:var(--white);
    transition:transform .18s,box-shadow .18s,border-color .18s;
  }
  :global([data-theme="dark"]) .tt-continue-card{
    background:var(--bg2);
    border-color:var(--border);
  }
  .tt-continue-card:hover{
    border-color:var(--gold);
    box-shadow:0 4px 16px rgba(200,150,62,.15);
    transform:translateY(-1px);
  }
  .tt-continue-card.completed{
    border-color:#9ec89a;
  }
  .tt-continue-copy{
    min-width:0;
    flex:1;
  }
  .tt-continue-meta-top{
    display:flex;
    align-items:center;
    gap:8px;
    margin-bottom:4px;
  }
  .tt-continue-badge{
    display:inline-block;
    padding:1px 7px;
    border-radius:6px;
    background:var(--gold-light);
    color:var(--gold);
    font-size:var(--font-size-meta);
    font-weight:700;
    letter-spacing:.04em;
  }
  :global([data-theme="dark"]) .tt-continue-badge{
    background:rgba(200,150,62,.25);
  }
  .tt-continue-status{
    color:var(--muted);
    font-size:var(--font-size-meta);
    font-weight:600;
  }
  .tt-continue-copy h3{
    overflow:hidden;
    margin:2px 0 8px;
    color:var(--text);
    font-size:var(--font-size-card-title);
    font-weight:700;
    line-height:1.4;
    text-overflow:ellipsis;
    white-space:nowrap;
  }
  .tt-continue-title-btn{
    display:block;
    width:100%;
    overflow:hidden;
    padding:0;
    border:0;
    background:transparent;
    color:inherit;
    font:inherit;
    text-align:left;
    text-overflow:ellipsis;
    white-space:nowrap;
    cursor:pointer;
  }
  .tt-continue-title-btn:hover{
    color:var(--gold);
  }
  .tt-continue-title-btn:focus-visible{
    outline:2px solid var(--gold);
    outline-offset:2px;
  }
  .progress-track{
    height:5px;
    overflow:hidden;
    border-radius:4px;
    background:var(--bg3);
  }
  .progress-track span{
    display:block;
    height:100%;
    border-radius:inherit;
    background:linear-gradient(90deg,var(--gold),#deb95e);
  }
  .tt-continue-copy small{
    display:block;
    margin-top:5px;
    color:var(--muted);
    font-size:var(--font-size-meta);
  }
  .tt-continue-actions{
    display:flex;
    align-items:center;
    gap:6px;
    flex-shrink:0;
  }
  .btn-continue{
    min-height:36px;
    padding:0 14px;
    border:0;
    border-radius:20px;
    background:var(--gold);
    color:#fff;
    cursor:pointer;
    font:700 var(--font-size-label) var(--font-app);
    box-shadow:0 2px 8px rgba(200,150,62,.25);
    transition:background .15s;
    white-space:nowrap;
  }
  .btn-continue:hover{
    background:var(--gold2);
  }
  .btn-remove{
    width:32px;
    height:32px;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:0;
    border:0;
    border-radius:50%;
    background:transparent;
    color:var(--muted);
    cursor:pointer;
    font-size:14px;
    transition:background .15s,color .15s;
  }
  .btn-remove:hover{
    background:var(--bg3);
    color:var(--text);
  }
  .btn-remove:disabled{
    cursor:not-allowed;
    opacity:.5;
  }
  .btn-continue:focus-visible,.btn-remove:focus-visible{
    outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);
    outline-offset:2px;
  }
  @media(max-width:680px){
    .tt-continue-grid{
      grid-template-columns:1fr;
    }
    .tt-continue-card{
      padding:12px 14px;
    }
  }

  .tt-modal-overlay{padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px))}
  .tt-modal-container{max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)))}
  button{min-height:44px}


  .tt-modal-close{min-width:44px;min-height:44px}

  .btn-continue,.btn-remove{min-width:44px;min-height:44px}
</style>
