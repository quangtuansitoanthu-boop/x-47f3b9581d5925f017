<script lang="ts">
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { PRACTICE_TYPES, type PracticeLog, type PracticeType } from '$lib/domain/practice/logs';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { manualPracticeLogCopy } from '$lib/i18n/manual-practice-log';
  import type { PracticeCampaign } from '$lib/browser/practice-community';

  interface Props {
    authenticated?: boolean;
    campaigns?: PracticeCampaign[];
    log: PracticeLog;
    open: boolean;
    title?: string;
    onCancel: () => void;
    onSave: (input: PracticeLog) => void;
  }

  let {
    authenticated = false,
    campaigns = [],
    log,
    open,
    title = 'Ghi nhận tu tập thủ công',
    onCancel,
    onSave
  }: Props = $props();

  let selectedType = $state<PracticeType>('Chép kinh');
  let selectedCampaignId = $state<string>('');
  let countValue = $state<number>(1);
  let dateValue = $state<string>('');
  let noteValue = $state<string>('');
  let maxDate = $state(getVietnamIsoDate());

  // Active campaigns currently available for contribution
  const activeCampaigns = $derived(
    campaigns.filter((c) => c.status === 'active')
  );

  const selectedCampaign = $derived(
    campaigns.find((c) => c.id === selectedCampaignId) ?? null
  );

  // Keep internal form state synchronized whenever a new log draft is opened
  $effect(() => {
    if (open) {
      maxDate = getVietnamIsoDate();
      selectedType = log.type || 'Chép kinh';
      selectedCampaignId = log.campaignId || '';
      countValue = log.count || 1;
      dateValue = log.date;
      noteValue = log.note || '';
    }
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    // Kiểm tra lại ngày hiện tại khi form đã mở qua đêm; không sửa bản nháp khi lỗi.
    maxDate = getVietnamIsoDate();
    const dateInput = (event.currentTarget as HTMLFormElement).elements.namedItem('date') as HTMLInputElement | null;
    const parsedDate = new Date(`${dateValue}T00:00:00.000Z`);
    const validDate = /^\d{4}-\d{2}-\d{2}$/u.test(dateValue)
      && Number.isFinite(parsedDate.getTime())
      && parsedDate.toISOString().slice(0, 10) === dateValue
      && dateValue <= maxDate;
    dateInput?.setCustomValidity(validDate ? '' : manualPracticeLogCopy[isEn ? 'en' : 'vi'].invalidDate);
    if (!validDate) {
      dateInput?.reportValidity();
      return;
    }
    onSave({
      ...log,
      count: Math.max(1, Math.floor(Number(countValue) || 1)),
      date: dateValue,
      note: noteValue.trim(),
      type: selectedType,
      campaignId: selectedCampaign?.id || null,
      campaignTitle: selectedCampaign?.title || null
    });
  }

  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  const practiceTypesEn: Record<string, string> = {
    'Chép kinh': 'Scripture Transcription',
    'Chép danh hiệu': 'Name Transcription',
    'Niệm danh hiệu': 'Buddha Recitation',
    'Trì chú': 'Mantra Chanting',
    'Tụng kinh': 'Sutra Recitation',
    'Lễ Phật': 'Prostrations',
    'Ngồi thiền': 'Meditation',
    'Nghe pháp thoại': 'Dharma Talk',
    'Khác': 'Other Practice'
  };

  const typeLabel = (t: string) => isEn ? (practiceTypesEn[t] ?? t) : t;

  const countLabel = $derived.by(() => {
    if (isEn) {
      switch (selectedType) {
        case 'Chép kinh':
          return manualPracticeLogCopy.en.copyingCount;
        case 'Chép danh hiệu':
          return 'Number of names / phrases transcribed';
        case 'Niệm danh hiệu':
          return 'Number of recitations';
        case 'Trì chú':
          return 'Number of mantra chants';
        case 'Lễ Phật':
          return manualPracticeLogCopy.en.prostrationCount;
        case 'Ngồi thiền':
          return 'Meditation duration (minutes)';
        case 'Nghe pháp thoại':
          return 'Dharma talk listening duration (minutes)';
        default:
          return 'Count / quantity';
      }
    }
    switch (selectedType) {
      case 'Chép kinh':
        return manualPracticeLogCopy.vi.copyingCount;
      case 'Chép danh hiệu':
        return 'Số danh hiệu / câu đã chép';
      case 'Niệm danh hiệu':
        return 'Số biến / câu niệm';
      case 'Trì chú':
        return 'Số biến trì chú';
      case 'Lễ Phật':
        return manualPracticeLogCopy.vi.prostrationCount;
      case 'Ngồi thiền':
        return 'Thời gian ngồi thiền (phút)';
      case 'Nghe pháp thoại':
        return 'Thời gian nghe pháp thoại (phút)';
      default:
        return 'Số biến / số lượng';
    }
  });

  const notePlaceholder = $derived.by(() => {
    if (isEn) {
      switch (selectedType) {
        case 'Chép kinh':
          return 'E.g.: Ksitigarbha Sutra, Universal Gate, Great Compassion Mantra...';
        case 'Chép danh hiệu':
          return 'E.g.: Namo Amitabha Buddha, Namo Avalokiteshvara Bodhisattva...';
        case 'Trì chú':
          return 'E.g.: Surangama Mantra, Medicine Buddha Dharani, Cundi Dharani...';
        case 'Nghe pháp thoại':
          return 'E.g.: Name of Dharma talk, lecture, master, topic...';
        default:
          return 'Notes on cultivation session, scripture name, dedication vows...';
      }
    }
    switch (selectedType) {
      case 'Chép kinh':
        return 'Ví dụ: Kinh Địa Tạng quyển Thượng, Kinh Phổ Môn, Chú Đại Bi...';
      case 'Chép danh hiệu':
        return 'Ví dụ: Nam Mô A Di Đà Phật, Nam Mô Quán Thế Âm Bồ Tát...';
      case 'Trì chú':
        return 'Ví dụ: Chú Lăng Nghiêm, Chú Dược Sư, Chú Chuẩn Đề...';
      case 'Nghe pháp thoại':
        return 'Ví dụ: Tên bài pháp thoại, giảng sư, chủ đề bài giảng...';
      default:
        return 'Ghi chú thêm về thời khóa công phu, tên bài kinh, phát nguyện...';
    }
  });
</script>

{#if open}
  <dialog
    use:modalDialog
    class="tt-overlay open"
    aria-labelledby="practice-log-title"
    tabindex="-1"
    onclick={(event) => event.currentTarget === event.target && onCancel()}
    oncancel={(event) => { event.preventDefault(); onCancel(); }}
  >
    <div
      class="tt-dialog tt-dialog-form practice-theme"
      data-dialog-glass
      data-practice="tracker"
    >
      <form class="tt-form" onsubmit={submit}>
        <div class="tt-form-header">
        <div class="tt-dialog-icon" aria-hidden="true">✍️</div>
        <h2 class="tt-dialog-title" id="practice-log-title">{isEn && title === 'Ghi nhận tu tập thủ công' ? 'Manual Practice Record' : title}</h2>
        <p class="tt-dialog-subtitle">{isEn ? 'Record actual off-app cultivation (transcription, name chanting, prostrations...)' : 'Ghi nhận công phu thực tế ngoài đời (chép kinh, chép danh hiệu, lễ Phật...)'}</p>

        </div>
        <div class="tt-form-fields">
        <div class="tt-form-group">
          <label class="tt-form-label" for="practice-log-date">{isEn ? 'Practice date' : 'Ngày công phu'}</label>
          <input
            class="tt-form-input"
            id="practice-log-date"
            name="date"
            type="date"
            max={maxDate}
            onfocus={() => maxDate = getVietnamIsoDate()}
            oninput={(event) => {
              maxDate = getVietnamIsoDate();
              event.currentTarget.setCustomValidity('');
            }}
            bind:value={dateValue}
            required
          />
        </div>

        <div class="tt-form-group">
          <label class="tt-form-label" for="practice-log-type">{isEn ? 'Practice category / Method' : 'Pháp môn / Loại tu tập'}</label>
          <select
            class="tt-form-select"
            id="practice-log-type"
            name="type"
            bind:value={selectedType}
          >
            {#each PRACTICE_TYPES as type}
              {#if type !== 'Thọ giới'}
                <option value={type}>{typeLabel(type)}</option>
              {/if}
            {/each}
          </select>
        </div>

        {#if activeCampaigns.length > 0}
          <div class="tt-form-group">
            <label class="tt-form-label" for="practice-log-campaign">
              {isEn ? 'Community practice campaign (optional)' : 'Chiến dịch tu tập cộng đồng (tùy chọn)'}
            </label>
            <select
              class="tt-form-select"
              id="practice-log-campaign"
              name="campaign"
              bind:value={selectedCampaignId}
            >
              <option value="">{isEn ? 'Personal practice (no campaign)' : 'Tu tập cá nhân (không chọn chiến dịch)'}</option>
              {#each activeCampaigns as campaign}
                <option value={campaign.id}>
                  🎯 {campaign.title} {campaign.joined ? (isEn ? '✓ (Joined)' : '✓ (Đã tham gia)') : ''}
                </option>
              {/each}
            </select>
            {#if selectedCampaign}
              <div class="tt-campaign-hint">
                <span class="tt-campaign-hint__badge">{isEn ? 'Campaign' : 'Chiến dịch'}</span>
                <span class="tt-campaign-hint__text">
                  {selectedCampaign.description || `${isEn ? 'Goal:' : 'Mục tiêu:'} ${selectedCampaign.goalValue.toLocaleString(isEn ? 'en-US' : 'vi-VN')} ${selectedCampaign.metric === 'count' ? (isEn ? 'counts' : 'biến') : (isEn ? 'sessions' : 'lượt')}`}
                </span>
              </div>
              {#if !authenticated}
                <div class="tt-campaign-guest-warning">
                  {isEn ? '⚠️ You are not signed in. Points will be saved on device and only synced to the campaign after you sign in.' : '⚠️ Bạn chưa đăng nhập. Điểm công phu sẽ lưu trên máy và chỉ có thể cộng dồn vào chiến dịch chung khi bạn đăng nhập tài khoản.'}
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <div class="tt-form-group">
          <label class="tt-form-label" for="practice-log-count">{countLabel}</label>
          <input
            class="tt-form-input"
            id="practice-log-count"
            name="count"
            type="number"
            min="1"
            bind:value={countValue}
            required
          />
        </div>

        <div class="tt-form-group">
          <label class="tt-form-label" for="practice-log-note">{isEn ? 'Cultivation details / Notes' : 'Nội dung công phu / Ghi chú'}</label>
          <textarea
            class="tt-form-textarea"
            id="practice-log-note"
            name="note"
            placeholder={notePlaceholder}
            bind:value={noteValue}
          ></textarea>
        </div>

        </div>
        <div class="tt-dialog-btns dialog-actions-balanced">
          <button data-modal-focus class="tt-dialog-cancel" type="button" onclick={onCancel}>{isEn ? 'Cancel' : 'Hủy'}</button>
          <button class="tt-dialog-ok" type="submit">{isEn ? 'Record 🙏' : 'Ghi nhận 🙏'}</button>
        </div>
      </form>
    </div>
  </dialog>
{/if}

<style>
  dialog.tt-overlay{width:100%;max-width:none;height:100%;max-height:none;margin:0;border:0;color:var(--text)}
  dialog::backdrop{background:transparent}
  .tt-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.65);animation:tt-overlay-in .2s ease;overscroll-behavior:contain}
  .tt-dialog{box-sizing:border-box;width:100%;max-height:calc(100dvh - 40px);overflow-y:auto;padding:26px 22px 20px;border:1px solid var(--dialog-surface-border,var(--border));border-radius:20px;background:var(--dialog-surface-background,var(--card));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));color:var(--text);text-align:center;animation:tt-dialog-in .2s ease}
  .tt-dialog-form{max-width:420px}
  .tt-form{margin:0}
  .tt-dialog-icon{margin-bottom:8px;font-size:36px;line-height:1}
  .tt-dialog-title{margin:0 0 4px;color:var(--text);font-family:var(--font-app);font-size:18px;font-weight:700;line-height:1.4}
  .tt-dialog-subtitle{margin:0 0 16px;color:var(--muted);font-size:var(--font-size-body);line-height:1.45}
  .tt-form-group{margin-bottom:14px;text-align:left}
  .tt-form-label{display:block;margin-bottom:6px;color:var(--text2);font-size:var(--font-size-label);font-weight:700}
  .tt-form-input,.tt-form-select,.tt-form-textarea{box-sizing:border-box;width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;outline:none;background:var(--bg2);color:var(--text);font-family:inherit;font-size:14px;transition:border-color .15s}
  .tt-form-input:focus,.tt-form-select:focus,.tt-form-textarea:focus{border-color:var(--gold)}
  .tt-form-textarea{min-height:68px;resize:vertical}
  .tt-campaign-hint{display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px 10px;border-radius:8px;background:var(--gold-light);font-size:var(--font-size-meta);color:var(--brown)}
  :global([data-theme="dark"]) .tt-campaign-hint{background:rgba(200,150,62,.15);color:var(--gold2)}
  .tt-campaign-hint__badge{flex-shrink:0;padding:2px 6px;border-radius:4px;background:var(--gold);color:#fff;font-size:var(--font-size-meta);font-weight:700;text-transform:uppercase}
  .tt-campaign-hint__text{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tt-campaign-guest-warning{margin-top:6px;padding:8px 10px;border-radius:8px;background:rgba(239,68,68,.1);border:1px dashed rgba(239,68,68,.3);font-size:var(--font-size-body);line-height:1.45;color:#b91c1c}
  :global([data-theme="dark"]) .tt-campaign-guest-warning{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#fca5a5}
  .tt-dialog-btns{display:flex;gap:10px;margin-top:20px}
  .tt-dialog-cancel,.tt-dialog-ok{min-height:44px;box-sizing:border-box;min-width:0;flex:1;padding:11px;border-radius:12px;font-family:inherit;font-size:var(--font-size-label);cursor:pointer;transition:border-color .15s,opacity .15s,transform .1s}
  .tt-dialog-cancel{border:1.5px solid var(--border);background:var(--bg2);color:var(--text2)}
  .tt-dialog-cancel:hover{border-color:var(--gold)}
  .tt-dialog-ok{border:0;background:linear-gradient(135deg,var(--gold) 0%,#b8843a 100%);box-shadow:0 3px 12px rgba(200,150,62,.35);color:#fff;font-weight:700}
  .tt-dialog-ok:hover{opacity:.95;transform:translateY(-1px)}
  .tt-dialog-ok:active{transform:translateY(1px)}
  button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  @media(max-width:768px){
    dialog.tt-overlay{
      height:100dvh;
      padding:max(var(--radius),var(--app-safe-top,env(safe-area-inset-top,0px))) var(--radius) max(var(--radius),env(safe-area-inset-bottom,0px));
    }
    .tt-dialog{
      max-height:calc(100dvh - max(var(--radius),var(--app-safe-top,env(safe-area-inset-top,0px))) - max(var(--radius),env(safe-area-inset-bottom,0px)));
      overflow:hidden;
      padding:var(--radius-control);
    }
    .tt-form{
      display:grid;
      grid-template-rows:auto minmax(0,1fr) auto;
      min-height:0;
      max-height:calc(100dvh - max(var(--radius),var(--app-safe-top,env(safe-area-inset-top,0px))) - max(var(--radius),env(safe-area-inset-bottom,0px)) - var(--radius-control) * 2);
    }
    .tt-form-header{min-width:0}
    .tt-dialog-icon{display:none}
    .tt-dialog-title{font-size:var(--font-size-card-title);line-height:1.4}
    .tt-dialog-subtitle{margin-bottom:var(--radius);font-size:var(--font-size-meta);line-height:1.5}
    .tt-form-fields{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:var(--radius-sm);scroll-padding-block:var(--radius-sm)}
    .tt-form-group{margin-bottom:var(--radius-control)}
    .tt-form-group:last-child{margin-bottom:0}
    .tt-form-label{font-size:var(--font-size-label);line-height:1.5}
    .tt-form-input,.tt-form-select,.tt-form-textarea{min-width:0;min-height:44px;font-size:var(--font-size-input);line-height:1.5}
    .tt-form-textarea{min-height:68px}
    .tt-campaign-hint{align-items:flex-start;flex-wrap:wrap;font-size:var(--font-size-meta);line-height:1.5}
    .tt-campaign-hint__badge{font-size:var(--font-size-meta)}
    .tt-campaign-hint__text{min-width:0;overflow:visible;white-space:normal;overflow-wrap:anywhere}
    .tt-campaign-guest-warning{font-size:var(--font-size-meta);line-height:1.5}
    .tt-dialog-btns{margin-top:var(--radius);padding-top:var(--radius-sm)}
    .tt-dialog-cancel,.tt-dialog-ok{min-height:44px;font-size:var(--font-size-label);line-height:1.5}
  }
  @keyframes tt-overlay-in{from{opacity:0}to{opacity:1}}
  @keyframes tt-dialog-in{from{transform:translateY(10px) scale(.97)}to{transform:translateY(0) scale(1)}}
  @media(prefers-reduced-motion:reduce){.tt-overlay,.tt-dialog{animation:none}.tt-form-input,.tt-form-select,.tt-form-textarea,.tt-dialog-cancel,.tt-dialog-ok{transition:none}}
</style>
