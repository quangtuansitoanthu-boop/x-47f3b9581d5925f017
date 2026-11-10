<script lang="ts">
  import { CalendarDays, ChevronDown, TriangleAlert } from '@lucide/svelte';
  import PracticeEntryArtwork from '../guide/PracticeEntryArtwork.svelte';
  import { getPracticeEntryCopy } from '$lib/i18n/practice-entry-cards';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  const localizeUi = createInterfaceTranslator();
  import { onMount, untrack } from 'svelte';
  import PracticeIcon from '../practice/PracticeIcon.svelte';
  import { solarToLunar, type LunarDay } from './lunar-calendar';
  import { getLunarEvent, type LunarEventNotificationInfo } from './lunar-events';
  import { requestBrowserLunarNotificationPermission, triggerBrowserLunarNotification } from '$lib/browser/lunar-notifications';
  import { getUnifiedNotificationPermission } from '$lib/browser/native-notifications';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import ThapTraiBannerMessage from './ThapTraiBannerMessage.svelte';
  import { getVietnamNow } from './lunar-week';
  import { watchCalendarDay } from '$lib/browser/calendar-day-rollover';

  let { alwaysShow = false, showHeading = false, compact = false }: { alwaysShow?: boolean; showHeading?: boolean; compact?: boolean } = $props();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
  const isEn = $derived(localeStore.current === 'en');
  const entryCopy = $derived(getPracticeEntryCopy(isEn));

  let today = $state(getVietnamNow());
  const todayKey = $derived(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
  const lunar = $derived(solarToLunar(today.getDate(), today.getMonth() + 1, today.getFullYear()));
  const eventInfo = $derived(getLunarEvent(today, localeStore.current));
  const visible = $derived(alwaysShow || (eventInfo?.isEvent ?? false));

  let collapsed = $state(untrack(() => compact));
  let canRequestNotification = $state(false);

  async function updateNotificationStatus(): Promise<void> {
    const perm = await getUnifiedNotificationPermission();
    canRequestNotification = perm !== 'granted' && perm !== 'unsupported';
  }

  function toggle(): void {
    collapsed = !collapsed;
    try {
      if (collapsed) localStorage.setItem('tutam_thaptrai_collapsed_date', todayKey);
      else localStorage.removeItem('tutam_thaptrai_collapsed_date');
    } catch {
      // Tùy chọn thu gọn không bắt buộc; storage bị chặn vẫn cho thao tác trong phiên.
    }
  }

  async function requestNotifications(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await requestBrowserLunarNotificationPermission(localeStore.current);
    await updateNotificationStatus();
  }

  onMount(() => {
    let disposed = false;
    let dayGeneration = 0;
    async function refreshNotifications(generation: number): Promise<void> {
      const perm = await getUnifiedNotificationPermission();
      if (disposed || generation !== dayGeneration) return;
      canRequestNotification = perm !== 'granted' && perm !== 'unsupported';
      if (visible && eventInfo) {
        await triggerBrowserLunarNotification(eventInfo, todayKey, localeStore.current);
      }
    }
    function refreshDay(date: Date): void {
      today = date;
      collapsed = compact;
      if (!compact) {
        try { collapsed = localStorage.getItem('tutam_thaptrai_collapsed_date') === todayKey; }
        catch {
          // Dùng trạng thái mặc định khi không đọc được tùy chọn, vẫn đăng ký cập nhật ngày.
        }
      }
      void refreshNotifications(++dayGeneration).catch((error) => {
        console.warn('Lỗi gửi thông báo Thập Trai:', error);
      });
    }
    refreshDay(getVietnamNow());
    const stopCalendarDay = watchCalendarDay(refreshDay);
    return () => { disposed = true; stopCalendarDay(); };
  });
</script>

{#if visible && lunar}
  <div
    class:compact
    class:collapsed
    class:has-heading={showHeading}
    class="thap-trai-banner"
    role="button"
    tabindex="0"
    onclick={toggle}
    onkeydown={(event) => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      toggle();
    }}
    aria-expanded={!collapsed}
  >
    {#if showHeading}<div class="banner-heading"><PracticeIcon index={9} size={44}/><strong>{t.calendar.bannerTitle}</strong></div>{/if}
    <div class="banner-top-row">
      <div class="banner-main-group">
        <div class="banner-icon-box" aria-hidden="true">
          <span class="icon">{#if compact}<PracticeEntryArtwork name="reminder" />{:else if eventInfo?.kiengDam}<TriangleAlert size={24} />{:else}<CalendarDays size={24} />{/if}</span>
        </div>
        <div class="banner-content">
          {#if !compact}<span class="banner-tag">
            {#if eventInfo?.isThapTrai}
              {isEn ? 'FASTING DAY' : localizeUi("NGÀY THẬP TRAI")}
            {:else if eventInfo?.viaName}
              {isEn ? 'OBSERVANCE' : localizeUi("VÍA PHẬT & BỒ TÁT")}
            {:else if eventInfo?.kiengDam}
              {isEn ? 'THO KHANG BAO GIAM' : localizeUi("THỌ KHANG BẢO GIÁM")}
            {:else}
              {isEn ? 'DAILY PRACTICE' : localizeUi("LỊCH TU TẬP")}
            {/if}
          </span>{/if}
          <strong class="banner-badge-text">
            {#if compact}{entryCopy.reminder}{:else if eventInfo?.isThapTrai && eventInfo?.viaName}
              {isEn ? 'Fasting Day & ' : localizeUi("Ngày Thập Trai & ")}{eventInfo.viaName}
            {:else if eventInfo?.viaName}
              {isEn ? 'Observance: ' : localizeUi("Ngày ")}{eventInfo.viaName}
            {:else if eventInfo?.isThapTrai && eventInfo?.kiengDam}
              {isEn ? 'Fasting & Abstinence Reminders' : localizeUi("Nhắc nhở Thập Trai & Thọ Khang Bảo Giám")}
            {:else if eventInfo?.isThapTrai}
              {isEn ? 'Fasting & Practice Reminders' : localizeUi("Nhắc nhở ngày Thập Trai & Tu tập")}
            {:else if eventInfo?.kiengDam}
              {isEn ? 'Tho Khang Bao Giam Calendar' : localizeUi("Lịch Thọ Khang Bảo Giám")}
            {:else}
              {isEn ? 'Today’s Practice Reminders' : localizeUi("Lịch nhắc nhở tu tập hôm nay")}
            {/if}
          </strong>
          {#if eventInfo?.kiengDam && (!compact || !collapsed)}
            <span class="banner-kiengdam-chip" title={isEn ? 'A day of sexual abstinence according to Tho Khang Bao Giam' : localizeUi("Hôm nay là ngày kiêng hành dâm theo Thọ Khang Bảo Giám")}>{isEn ? 'Abstinence' : localizeUi("Kiêng hành dâm")}</span>
          {/if}
          {#if !compact || !collapsed}<span class="banner-sub-text">
            {#if isEn}
              Lunar date {lunar.day}/{lunar.month}{#if !compact} • {collapsed ? 'Tap to view details' : 'Observance guidance below'}{/if}
            {:else}
              {lunar.day <= 10 ? 'Mùng' : 'Ngày'} {lunar.day}/{lunar.month} Âm lịch{#if !compact} • {collapsed ? localizeUi("Chạm để xem chi tiết") : localizeUi("Chi tiết nhắc nhở bên dưới")}{/if}
            {/if}
          </span>{/if}
        </div>
      </div>
      <div class="banner-actions">
        {#if !collapsed && canRequestNotification}
          <button class="notification-icon-btn" type="button" aria-label={isEn ? 'Enable practice reminders' : localizeUi("Bật thông báo nhắc nhở tu tập")} title={isEn ? 'Enable practice and abstinence reminders' : localizeUi("Bật thông báo nhắc nhở tu tập & Thọ Khang Bảo Giám")} onclick={requestNotifications}>🔔</button>
        {/if}
        <div class="banner-chevron-btn" aria-hidden="true">
          <span class="chevron"><ChevronDown size={20} /></span>
        </div>
      </div>
    </div>
    {#if !collapsed}
      <div class="content">
        <ThapTraiBannerMessage {eventInfo} {lunar} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .banner-heading{display:flex;align-items:center;gap:.6em;margin-bottom:.7em;color:var(--brown)}
  .thap-trai-banner {
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
    margin: 0 0 16px;
    padding: 13px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    background: var(--gold-light);
    box-shadow: 0 2px 8px rgba(60, 40, 10, 0.03);
    color: var(--text);
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  }
  :global([data-theme="dark"]) .thap-trai-banner {
    background: var(--bg2);
    border-color: var(--border2);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
    color: var(--text);
  }
  .thap-trai-banner:hover {
    border-color: var(--gold);
    transform: translateY(-2px);
    box-shadow: var(--shadow);
  }
  .thap-trai-banner:hover .banner-chevron-btn {
    background: var(--gold);
    color: #fff;
  }
  .thap-trai-banner:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 3px;
  }
  .banner-top-row {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .banner-main-group {
    display: flex;
    align-items: center;
    gap: 13px;
    flex: 1;
    min-width: 0;
  }
  .banner-icon-box {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 14px;
    background: color-mix(in srgb, var(--gold) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 28%, transparent);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  }
  :global([data-theme="dark"]) .banner-icon-box {
    background: rgba(200, 150, 62, 0.15);
    border-color: rgba(200, 150, 62, 0.3);
  }
  .icon {
    font-size: 22px;
    line-height: 1;
  }
  .banner-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .banner-tag {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    padding: 2px 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--gold) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--gold) 28%, transparent);
    color: var(--brown);
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    line-height: 1.3;
  }
  :global([data-theme="dark"]) .banner-tag {
    color: var(--gold2);
    background: rgba(200, 150, 62, 0.15);
    border-color: rgba(200, 150, 62, 0.3);
  }
  .banner-badge-text {
    display: block;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    margin: 1px 0 0;
    color: var(--text);
    line-height: 1.35;
    white-space: normal;
    text-wrap: balance;
    overflow: hidden;
  }
  :global([data-theme="dark"]) .banner-badge-text {
    color: var(--text);
  }
  .banner-sub-text {
    display: block;
    color: var(--text2);
    font-size: var(--font-size-meta);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .notification-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent);
    border-radius: 50%;
    background: color-mix(in srgb, var(--gold) 12%, transparent);
    color: var(--gold);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    transition: all 0.15s ease;
  }
  :global([data-theme="dark"]) .notification-icon-btn {
    background: rgba(200, 150, 62, 0.15);
    border-color: rgba(200, 150, 62, 0.3);
    color: var(--gold2);
  }
  .notification-icon-btn:hover {
    background: var(--gold);
    color: #fff;
    transform: scale(1.06);
  }
  .banner-chevron-btn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 50%;
    background: color-mix(in srgb, var(--gold) 15%, transparent);
    color: var(--gold);
    font-size: 12px;
    font-weight: 700;
    transition: all 0.2s ease;
  }
  :global([data-theme="dark"]) .banner-chevron-btn {
    background: rgba(200, 150, 62, 0.15);
    color: var(--gold2);
  }
  .chevron {
    display: inline-block;
    transition: transform 0.25s ease;
    transform: rotate(0deg);
  }
  .thap-trai-banner:not(.collapsed) .chevron {
    transform: rotate(180deg);
  }
  .banner-kiengdam-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 9999px;
    background: rgba(220, 38, 38, 0.12);
    color: var(--red, #dc2626);
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.2px;
    border: 1px solid rgba(220, 38, 38, 0.28);
    max-width: 100%;
    width: fit-content;
    white-space: normal;
  }
  .content {
    width: 100%;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--gold) 20%, var(--border2));
    font-size: var(--font-size-body);
    line-height: 1.6;
    letter-spacing: 0.1px;
    text-align: left;
    color: var(--text2);
  }
  :global([data-theme="dark"]) .content {
    border-top-color: rgba(200, 150, 62, 0.2);
  }
  @media (max-width: 600px) {
    .banner-top-row { align-items: flex-start; gap: var(--radius); }
    .banner-main-group { align-items: flex-start; gap: var(--radius); }
    .banner-actions { flex-direction: column; gap: var(--radius-sm); }
    .banner-tag { max-width: 100%; }
    .banner-badge-text { text-wrap: pretty; overflow-wrap: anywhere; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chevron,
    .thap-trai-banner,
    .banner-chevron-btn {
      transition: none;
    }
  }
</style>
