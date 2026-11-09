<script lang="ts">
  import { NotebookPen } from '@lucide/svelte';
  import { practiceLogUnit, practiceUi, practiceTypesEn } from '$lib/i18n/practice-ui';
  import type { PracticeLog, PracticePeriod } from '$lib/domain/practice/logs';
  import { groupPracticeLogs } from '$lib/domain/practice/log-groups';
  import { historicalPracticeTitle, isInternalPracticeSource } from '$lib/domain/practice/progress-display';
  import { formatVietnamDate, getLogsByPeriod } from '$lib/domain/practice/stats';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  interface Props {
    activePeriod: PracticePeriod;
    historyOpen: boolean;
    logs: PracticeLog[];
    recentLogs: PracticeLog[];
    routineSummaries?: PracticeLog[];
    stats: { activeDays: number; streak: number; summary: string; total: number };
    trackerOpen: boolean;
    currentDate?: Date;
    onHistoryToggle: () => void;
    onNewLog: () => void;
    onDeleteLog?: (id: number | number[]) => void;
    onPeriodChange: (period: PracticePeriod) => void;
    onToggle: () => void;
  }

  let {
    activePeriod,
    historyOpen,
    logs,
    recentLogs,
    routineSummaries = [],
    stats,
    trackerOpen,
    currentDate = new Date(),
    onHistoryToggle,
    onNewLog,
    onDeleteLog,
    onPeriodChange,
    onToggle
  }: Props = $props();

  const isEn = $derived(localeStore.current === 'en');
  const groupedLogs = $derived(groupPracticeLogs(logs));
  const groupedRecent = $derived(recentLogs.length ? groupedLogs.slice(0, 10) : []);
  const entryCount = $derived(getLogsByPeriod(groupedLogs, activePeriod, currentDate).length);
  const periodRoutineSummaries = $derived(getLogsByPeriod(routineSummaries, activePeriod, currentDate));

  const practiceVerbsVi: Record<string, string> = {
    'Niệm danh hiệu': 'niệm được',
    'Trì chú': 'trì được',
    'Tụng kinh': 'tụng được',
    'Lễ Phật': 'lễ được',
    'Ngồi thiền': 'ngồi thiền được',
    'Nghe pháp thoại': 'nghe được',
    'Chép kinh': 'chép kinh được',
    'Chép danh hiệu': 'chép danh hiệu được',
    'Khác': 'thực hành được',
  };

  const practiceVerbsEn: Record<string, string> = {
    'Niệm danh hiệu': 'chanted',
    'Trì chú': 'chanted',
    'Tụng kinh': 'recited',
    'Lễ Phật': 'offered',
    'Ngồi thiền': 'meditated for',
    'Nghe pháp thoại': 'listened for',
    'Chép kinh': 'transcribed',
    'Chép danh hiệu': 'transcribed',
    'Khác': 'practiced',
  };

  const isDharmaTalk = (logOrType: PracticeLog | string, note = ''): boolean => {
    if (typeof logOrType === 'string') {
      return logOrType === 'Nghe pháp thoại' || /pháp thoại|bài giảng/i.test(note);
    }
    return logOrType.type === 'Nghe pháp thoại' || /pháp thoại|bài giảng/i.test(logOrType.note ?? '');
  };

  const verbFor = (type: string) => isEn
    ? (practiceVerbsEn[type] ?? 'practiced')
    : (practiceVerbsVi[type] ?? 'thực hành được');

  const unitFor = (type: string, log?: PracticeLog) => {
    return practiceLogUnit(isEn, log && isDharmaTalk(log) && type !== 'Thọ giới' ? 'Nghe pháp thoại' : type);
  };

  const historyType = (log: PracticeLog) => {
    if (log.type === 'Thọ giới') {
      return isEn
        ? `received precepts ${log.count} time(s)`
        : `thọ giới thành công ${log.count} lần`;
    }
    if (isDharmaTalk(log)) {
      const talkTitle = practiceSpecificName(log);
      return isEn
        ? `Listened to "${talkTitle}" for ${log.count} mins`
        : `Đã nghe "${talkTitle}" trong ${log.count} phút`;
    }
    return isEn
      ? `You ${verbFor(log.type)} ${log.count} ${unitFor(log.type, log)}`
      : `Bạn đã ${verbFor(log.type)} ${log.count} ${unitFor(log.type, log)}`;
  };

  function practiceSpecificName(log: PracticeLog): string {
    const rawNote = (log.note ?? '').trim();
    const historicalTitle = historicalPracticeTitle(rawNote);
    if (historicalTitle) return historicalTitle;
    if (rawNote && !rawNote.startsWith('Lần chuỗi hạt giả lập') && !isInternalPracticeSource(rawNote)) {
      return rawNote.replace(/^Lần hạt:\s*/iu, '');
    }
    return isEn ? practiceTypesEn[log.type] ?? log.type : log.type;
  }
</script>

<button type="button" class="tt-mode-card tt-mode-card--tracker" aria-expanded={trackerOpen} aria-haspopup="dialog" onclick={onToggle}>
  <div class="tt-mode-icon-wrap" aria-hidden="true">
    <span class="tracker-entry-icon"><NotebookPen size={32} strokeWidth={1.8} /></span>
  </div>
  <div class="tt-mode-body">
    <span class="tt-mode-title">{t.practice.myTrackerTitle}</span>
    <span class="tt-mode-desc">{t.practice.myTrackerDesc}</span>
  </div>
  <span class="tt-mode-arrow" aria-hidden="true">→</span>
</button>

{#if trackerOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <dialog use:modalDialog class="tt-modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) onToggle(); }} aria-labelledby="practice-tracker-title" oncancel={(event) => { event.preventDefault(); onToggle(); }} tabindex="-1">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="tt-modal-container tt-tracker-modal" data-practice="tracker" onclick={(e) => e.stopPropagation()} role="document" onkeydown={(e) => e.stopPropagation()}>
      <div class="tt-tracker__card">
        <header class="tt-tracker__header-modal">
          <div>
            <h2 id="practice-tracker-title">{t.practice.myTrackerTitle}</h2>
            <p class="tt-tracker__subtitle">{isEn ? 'A little practice, every day' : 'Từng chút tinh tấn, mỗi ngày'}</p>
          </div>
          <div class="tt-tracker__header-actions">
            <button type="button" class="tt-tracker__close" onclick={onToggle} aria-label={t.practice.backToPractice}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg>
            </button>
          </div>
        </header>
        <div id="practice-tracker-body" class="tt-tracker__body">
          <div class="tt-tracker__record-actions">
            <button type="button" class="tt-tracker__recent-add" onclick={(event) => { event.currentTarget.focus({ preventScroll: true }); onNewLog(); }}>{practiceUi(isEn, '+ Ghi nhận')}</button>
            <a class="tt-tracker__verified-progress" href="/tien-do-tu-tap">{practiceUi(isEn, 'Tiến độ xác minh →')}</a>
          </div>
          <div class="tt-tracker__tabs" role="group" aria-label={isEn ? 'Practice period' : 'Khoảng thời gian'}>
            {#each (['day', 'week', 'month', 'year'] as const) as period}
              <button
                class:active={activePeriod === period}
                type="button"
                aria-pressed={activePeriod === period}
                onclick={() => onPeriodChange(period)}
              >
                {period === 'day' ? (isEn ? 'Today' : 'Hôm nay') : period === 'week' ? practiceUi(isEn, '7 ngày gần nhất') : period === 'month' ? (isEn ? 'This month' : 'Tháng này') : (isEn ? 'This year' : 'Năm nay')}
              </button>
            {/each}
          </div>

          <p class="tt-tracker__summary">{stats.summary}</p>

          <div class="tt-tracker__stats">
            <article><strong>{entryCount}</strong><span>{activePeriod === 'day' ? (practiceUi(isEn, "Mục công phu hôm nay")) : activePeriod === 'week' ? (practiceUi(isEn, "Mục công phu 7 ngày gần nhất")) : activePeriod === 'month' ? (practiceUi(isEn, "Mục công phu tháng này")) : (practiceUi(isEn, "Mục công phu năm nay"))}</span></article>
            <article><strong>{stats.activeDays}</strong><span>{practiceUi(isEn, "Ngày có công phu")}</span></article>
            <article><strong>{stats.streak}</strong><span>{practiceUi(isEn, "Ngày liên tiếp")}</span></article>
          </div>
          <p class="tt-tracker__subtitle">{practiceUi(isEn, 'Mỗi mục gộp công phu cùng ngày, cùng loại và nội dung.')}</p>

          <div class="tt-tracker__recent">
            <div class="tt-tracker__recent-header">
              <strong>{isEn ? 'Recent activity' : 'Hoạt động gần đây'}</strong>
              <div class="tt-tracker__recent-actions">
                <button type="button" onclick={onHistoryToggle}>{isEn ? 'View history' : 'Xem mục cũ'}</button>
              </div>
            </div>
            {#if recentLogs.length === 0}
              <p class="tt-tracker__empty">{isEn ? 'No practice logs recorded yet. Begin your cultivation journey today!' : 'Bạn chưa ghi nhận công phu nào. Hãy bắt đầu hành trình tu tập hôm nay!'}</p>
            {:else}
              <div class="tt-tracker__log-list">
                {#each groupedRecent as log (log.id)}
                  <article class="tt-tracker__log-item">
                    <span class="tt-tracker__log-type">
                      <strong class="tt-tracker__log-name">{practiceSpecificName(log)}</strong>
                      {#if log.campaignTitle}
                        <span class="tt-tracker__campaign-badge">🎯 {log.campaignTitle}</span>
                      {/if}
                      <span class="tt-tracker__log-meta">
                        <time class="tt-tracker__log-date" datetime={log.date}>{formatVietnamDate(log.date)}</time>
                        <span class="tt-tracker__log-count">{log.count} {unitFor(log.type, log)}</span>
                      </span>
                    </span>
                    {#if onDeleteLog}
                      <button
                        class="tt-history-del"
                        type="button"
                        title={isEn ? 'Delete this record' : 'Xóa mục này'}
                        aria-label={isEn ? 'Delete this record' : 'Xóa mục này'}
                        onclick={() => onDeleteLog(log.memberIds.length === 1 ? log.id : log.memberIds)}
                      >
                        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                        </svg>
                      </button>
                    {/if}
                  </article>
                {/each}
              </div>
            {/if}
          </div>
          {#if periodRoutineSummaries.length > 0}
            <section class="tt-tracker__recent" aria-labelledby="practice-completed-routines-title">
              <div class="tt-tracker__recent-header">
                <strong id="practice-completed-routines-title">{isEn ? 'Completed routines' : 'Thời khóa đã hoàn thành'}</strong>
              </div>
              <div class="tt-tracker__log-list">
                {#each periodRoutineSummaries as summary (summary.id)}
                  <article class="tt-tracker__log-item">
                    <span class="tt-tracker__log-type">
                      <strong class="tt-tracker__log-name">{summary.note}</strong>
                      <time class="tt-tracker__log-date" datetime={summary.date}>{formatVietnamDate(summary.date)}</time>
                    </span>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      </div>
    </div>
  </dialog>
{/if}

{#if historyOpen}
  <dialog use:modalDialog class="tt-overlay open" aria-labelledby="practice-history-title" oncancel={(event) => { event.preventDefault(); onHistoryToggle(); }} tabindex="-1">
    <div class="tt-dialog tt-dialog-form">
      <div class="tt-dialog-icon" aria-hidden="true">📜</div>
      <div class="tt-dialog-title" id="practice-history-title">{isEn ? 'Practice History' : 'Lịch sử công phu'}</div>
      <p class="tt-history-legacy-note">{isEn ? 'Your automated and manual practice logs are saved safely on your device.' : 'Lịch sử tu tập tự động và thủ công được lưu trữ an toàn trên thiết bị của bạn.'}</p>
      <div class="tt-history-list">
        {#if logs.length === 0}
          <div class="tt-history-empty">{isEn ? 'No practice logs recorded yet.' : 'Bạn chưa ghi nhận công phu nào.'}</div>
        {:else}
          {#each groupedLogs as log (log.id)}
            <div class="tt-history-item">
              <div class="tt-history-date">{formatVietnamDate(log.date)}</div>
              <div class="tt-history-main">
                <div class="tt-history-type">
                  <strong class="tt-history-name">{practiceSpecificName(log)}</strong>
                  {#if log.campaignTitle}
                    <span class="tt-tracker__campaign-badge">🎯 {log.campaignTitle}</span>
                  {/if}
                </div>
                <div class="tt-history-sub">
                  <span>{historyType(log)}</span>
                  {#if log.note && log.note.trim() && practiceSpecificName(log) !== log.note.trim() && !isDharmaTalk(log) && !isInternalPracticeSource(log.note)}
                    <span class="tt-history-note"> — {log.note.trim()}</span>
                  {/if}
                </div>
              </div>
              {#if onDeleteLog}
                <button
                  class="tt-history-del"
                  type="button"
                  title={isEn ? 'Delete this record' : 'Xóa mục này'}
                  aria-label={isEn ? 'Delete this record' : 'Xóa mục này'}
                  onclick={() => onDeleteLog(log.memberIds.length === 1 ? log.id : log.memberIds)}
                >
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
      <div class="tt-dialog-btns">
        <button class="tt-dialog-ok" type="button" aria-label={isEn ? 'Close' : 'Đóng'} onclick={onHistoryToggle}>{isEn ? 'Close' : 'Đóng'}</button>
      </div>
    </div>
  </dialog>
{/if}

<style>
  .tracker-entry-icon { display:flex; color:var(--practice-card-blue-ink); }
  :global([data-theme="dark"]) .tracker-entry-icon { color:var(--practice-card-blue-end); }
  dialog.tt-modal-overlay,dialog.tt-overlay{box-sizing:border-box;width:100%;max-width:none;height:100%;max-height:none;margin:0;border:0;color:var(--text)}
  dialog::backdrop{background:transparent}
  .tt-modal-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px));background:#0007;backdrop-filter:blur(4px)}
  .tt-modal-container{width:100%;max-width:var(--practice-dialog-width);height:var(--practice-dialog-height);max-height:100%;min-height:0;display:flex;flex-direction:column}
  .tt-tracker__card{height:100%;--tracker-accent:#4a5979;display:flex;flex-direction:column;min-height:0;max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)));overflow:hidden;border:1px solid var(--border2);border-radius:22px;background:var(--bg);color:var(--text);font-family:var(--font-app);box-shadow:var(--shadow-xl)}
  :global([data-theme="dark"]) .tt-tracker__card{--tracker-accent:#bdc9e5}
  .tt-tracker__header-modal{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:22px 20px 18px;border-bottom:1px solid var(--border2)}
  .tt-tracker__header-modal h2{margin:0;color:var(--text);font-size:20px;line-height:1.4;font-weight:700;letter-spacing:-.4px}
  .tt-tracker__subtitle{margin:5px 0 0;color:var(--muted);font-size:var(--font-size-body);line-height:1.6}
  .tt-tracker__header-actions{display:flex;flex-shrink:0}
  .tt-tracker__close{display:flex;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:1px solid var(--border2);border-radius:50%;background:var(--card);color:var(--text2);cursor:pointer}
  .tt-tracker__close:hover{background:var(--bg2)}
  .tt-tracker__body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 20px}
  .tt-tracker__tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:4px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)}
  .tt-tracker__tabs button{min-height:44px;padding:6px 2px;border:0;border-radius:9px;background:transparent;color:var(--text2);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);line-height:1.4;font-weight:500}
  .tt-tracker__tabs button.active{background:var(--card);color:var(--tracker-accent);box-shadow:0 1px 4px #0001;font-weight:700}
  .tt-tracker__summary{margin:16px 0;padding:0;color:var(--text2);font:400 13px/1.8 var(--font-app);text-align:left}
  .tt-tracker__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin:0 0 24px;padding:18px 0;border:1px solid var(--border2);border-radius:14px;background:var(--card)}
  .tt-tracker__stats article{min-width:0;padding:0 8px;text-align:center}
  .tt-tracker__stats article+article{border-left:1px solid var(--border2)}
  .tt-tracker__stats strong{display:block;color:var(--tracker-accent);font-size:28px;line-height:1.2;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .tt-tracker__stats span{display:block;margin-top:8px;color:var(--text2);font-size:var(--font-size-meta);line-height:1.6;font-weight:400}
  .tt-tracker__recent-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:6px;color:var(--text);font-size:var(--font-size-card-title)}
  .tt-tracker__recent-actions{display:flex;flex-shrink:0}
  .tt-tracker__recent-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;background:transparent;color:var(--tracker-accent);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:500;text-decoration:none}
  .tt-tracker__recent-actions button{padding:0 0 0 8px}
  .tt-tracker__recent-actions button:hover{text-decoration:underline}
  .tt-tracker__empty{margin:0;padding:20px 0;color:var(--text2);font-size:var(--font-size-body);line-height:1.8}
  .tt-tracker__log-item{display:flex;align-items:center;gap:12px;padding:16px 0;border-bottom:1px solid var(--border2)}
  .tt-tracker__log-item:last-child{border-bottom:0}
  .tt-tracker__log-type{flex:1;min-width:0;color:var(--text);text-align:left}
  .tt-tracker__log-name{display:block;font-size:var(--font-size-body);line-height:1.7;font-weight:600;overflow-wrap:anywhere}
  .tt-tracker__log-meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 14px;margin-top:5px;font-variant-numeric:tabular-nums}
  .tt-tracker__log-date{color:var(--text2);font-size:var(--font-size-meta);line-height:1.6}
  .tt-tracker__log-count{color:var(--tracker-accent);font-size:12px;font-weight:600}
  .tt-tracker__campaign-badge{display:inline-block;margin-top:4px;padding:2px 6px;border-radius:5px;background:var(--gold-light);color:var(--brown);font-size:var(--font-size-meta);line-height:1.6;overflow-wrap:anywhere}
  .tt-tracker__log-item .tt-history-del{width:44px;height:44px;flex-shrink:0}
  .tt-tracker__record-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--radius-sm);margin-bottom:var(--radius-control)}
  .tt-tracker__record-actions .tt-tracker__recent-add,.tt-tracker__verified-progress{display:flex;align-items:center;justify-content:center;min-width:0;min-height:44px;padding:var(--radius-sm);font-size:var(--font-size-label);white-space:nowrap;text-align:center}
  .tt-tracker__verified-progress{border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text2);text-decoration:none}
  .tt-tracker__record-actions .tt-tracker__recent-add{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:1px solid var(--gold);border-radius:var(--radius-control);color:var(--on-gold);background:var(--gold);cursor:pointer;font:700 var(--font-size-label)/1.5 var(--font-app)}
  .tt-tracker__record-actions .tt-tracker__recent-add:hover{background:var(--gold2);border-color:var(--gold2)}
  .tt-tracker__card button:focus-visible,.tt-tracker__card a:focus-visible{outline:2px solid var(--tracker-accent);outline-offset:3px}
  @media(max-width:380px){.tt-tracker__header-modal{padding:18px 16px 16px}.tt-tracker__body{padding:16px}.tt-tracker__header-modal h2{font-size:18px}.tt-tracker__stats article{padding:0 6px}.tt-tracker__stats strong{font-size:26px}.tt-tracker__log-item{gap:6px}}
  .tt-overlay{position:fixed;inset:0;z-index:1100;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.65);opacity:0;pointer-events:none;transition:opacity .2s}.tt-overlay.open{opacity:1;pointer-events:auto}.tt-dialog{width:100%;max-width:380px;padding:28px 24px 22px;border-radius:20px;background:var(--bg);box-shadow:0 20px 60px rgba(0,0,0,.4);text-align:center;transform:translateY(10px) scale(.97);transition:transform .2s}.tt-overlay.open .tt-dialog{transform:translateY(0) scale(1)}.tt-dialog-form{max-width:420px}.tt-dialog-icon{margin-bottom:12px;font-size:40px}.tt-dialog-title{margin-bottom:8px;color:var(--text);font-family:Lora,serif;font-size:18px;font-weight:700}.tt-history-legacy-note{margin:0 0 12px;color:var(--muted);font-size:var(--font-size-meta);line-height:1.5}.tt-history-list{max-height:50vh;overflow-y:auto;margin-bottom:18px;text-align:left}.tt-history-item{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border2)}.tt-history-item:last-child{border-bottom:0}.tt-history-date{min-width:78px;flex-shrink:0;color:var(--muted);font-size:var(--font-size-meta)}.tt-history-main{flex:1;min-width:0}.tt-history-type{color:var(--text);font-size:var(--font-size-label);font-weight:600;word-break:break-word}.tt-history-name{color:var(--text);font-weight:700;font-size:var(--font-size-body)}.tt-history-sub{margin-top:2px;color:var(--muted);font-size:var(--font-size-meta);word-break:break-word}.tt-history-del{display:flex;width:44px;height:44px;flex-shrink:0;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}.tt-history-del:hover{background:rgba(220,53,69,.12);color:#dc3545}.tt-history-del:active{transform:scale(.92)}.tt-history-empty{padding:8px 4px;color:var(--muted);font-size:var(--font-size-body)}.tt-dialog-btns{display:flex;gap:10px}.tt-dialog-ok{flex:1;padding:11px;border:0;border-radius:12px;background:linear-gradient(135deg,var(--gold) 0%,#b8843a 100%);box-shadow:0 3px 12px rgba(200,150,62,.35);color:#fff;cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:700;transition:.15s}.tt-dialog-ok:hover{opacity:.9}
  .tt-dialog-title{font-family:var(--font-app)}
  .tt-tracker__card,.tt-dialog{background:var(--dialog-glass-background);border:1px solid var(--dialog-glass-border);-webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);box-shadow:var(--dialog-glass-shadow)}
  @supports not (backdrop-filter:blur(1px)){.tt-tracker__card,.tt-dialog{background:var(--card)}}
  @supports not (background:color-mix(in srgb,currentColor,transparent)){.tt-tracker__card,.tt-dialog{background:var(--card);border-color:var(--border)}}
  @media(prefers-reduced-transparency:reduce){.tt-tracker__card,.tt-dialog{background:var(--card);-webkit-backdrop-filter:none;backdrop-filter:none}}

  .tt-modal-overlay{padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px))}
  .tt-tracker__card{max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)))}
  button{min-height:44px}


  .tt-tracker__close{min-width:44px;min-height:44px}
  @media(max-width:768px){
    .tt-overlay .tt-dialog-form{padding:var(--space-page);max-height:calc(100dvh - 40px);overflow-y:auto}
    .tt-history-item{display:grid;grid-template-columns:minmax(0,1fr) 44px;gap:var(--radius-sm) var(--radius-control)}
    .tt-history-date{grid-column:1;grid-row:1;min-width:0}
    .tt-history-main{grid-column:1;grid-row:2}
    .tt-history-item .tt-history-del{grid-column:2;grid-row:1 / 3;width:44px;height:44px;align-self:center}
  }
</style>
