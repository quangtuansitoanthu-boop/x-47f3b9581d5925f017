<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { localizeLunarEvent, type LunarEventNotificationInfo } from './lunar-events';
  import type { LunarDay } from './lunar-calendar';
  import { getVietnamNow } from './lunar-week';
  import { sameCalendarDay } from '$lib/browser/calendar-day-rollover';

  let { eventInfo: rawEventInfo, lunar, selectedDate } = $props<{
    eventInfo: LunarEventNotificationInfo | null;
    lunar: LunarDay;
    selectedDate?: Date;
  }>();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const t = $derived(localeStore.t.calendar);
  const isToday = $derived(!selectedDate || sameCalendarDay(selectedDate, getVietnamNow()));
  const solarDate = $derived(selectedDate ? `${String(selectedDate.getDate()).padStart(2, '0')}/${String(selectedDate.getMonth() + 1).padStart(2, '0')}/${selectedDate.getFullYear()}` : '');
  const dayPrefix = $derived(isToday ? t.bannerTodayPrefix : t.bannerDatePrefix.replace('{date}', solarDate));
  const abstinencePrefix = $derived(isToday ? t.bannerAbstinence : t.bannerDateAbstinence.replace('{date}', solarDate));

  const eventInfo = $derived(localizeLunarEvent(rawEventInfo, localeStore.current));
  const lunarDay = $derived(eventInfo?.lunarDay ?? lunar.day);
  const lunarMonth = $derived(eventInfo?.lunarMonth ?? lunar.month);
  const isThapTrai = $derived(eventInfo?.isThapTrai ?? true);
  const viaName = $derived(eventInfo?.viaName ?? null);
</script>

<span class="daily-reminder-message" lang={isEn ? 'en' : 'vi'}>
{#if isEn}
  {#if isThapTrai && viaName}
    {dayPrefix} a <strong>Ten Fasting Day</strong> and <strong>{viaName}</strong>
    (Lunar <strong>{lunarDay}/{lunarMonth}</strong>).
  {:else if viaName}
    {dayPrefix} <strong>{viaName}</strong>
    (Lunar <strong>{lunarDay}/{lunarMonth}</strong>).
  {:else if isThapTrai}
    {dayPrefix} a <strong>Ten Fasting Day (Vegetarian)</strong>
    (Lunar <strong>{lunarDay}/{lunarMonth}</strong>).
  {:else}
    {dayPrefix} Lunar <strong>{lunarDay}/{lunarMonth}</strong>.
  {/if}
  {#if isThapTrai || viaName}
    {t.bannerVegCall}
  {:else}
    {t.bannerNormalCall}
  {/if}
  {#if eventInfo?.kiengDam}
    <span class="warning">{abstinencePrefix}“{eventInfo.kiengDam.reason}”{eventInfo.kiengDam.harm ? `${t.bannerAbstinenceHarm}“${eventInfo.kiengDam.harm}”` : ''}</span>
  {/if}
{:else}
  {#if isThapTrai && viaName}
    {dayPrefix} <strong>Thập Trai</strong> và cũng là ngày <strong>{viaName}</strong>
    ({lunarDay <= 10 ? 'mùng' : 'ngày'} <strong>{lunarDay}/{lunarMonth}</strong> Âm lịch).
  {:else if viaName}
    {dayPrefix} <strong>{viaName}</strong>
    ({lunarDay <= 10 ? 'mùng' : 'ngày'} <strong>{lunarDay}/{lunarMonth}</strong> Âm lịch).
  {:else if isThapTrai}
    {dayPrefix} <strong>Thập Trai</strong>
    ({lunarDay <= 10 ? 'mùng' : 'ngày'} <strong>{lunarDay}/{lunarMonth}</strong> Âm lịch).
  {:else}
    {dayPrefix} <strong>{lunarDay}/{lunarMonth}</strong> Âm lịch.
  {/if}
  {#if isThapTrai || viaName}
    {t.bannerVegCall}
  {:else}
    {t.bannerNormalCall}
  {/if}
  {#if eventInfo?.kiengDam}
    <span class="warning">{abstinencePrefix}“{eventInfo.kiengDam.reason}”{eventInfo.kiengDam.harm ? `${t.bannerAbstinenceHarm}“${eventInfo.kiengDam.harm}”` : ''}</span>
  {/if}
{/if}
</span>

<style>
  .daily-reminder-message{display:block;min-width:0;text-align:justify;text-align-last:start;text-justify:inter-word;overflow-wrap:break-word}
  strong{color:var(--brown)}.warning{display:block;margin-top:8px;padding-top:6px;border-top:1px dashed rgba(200,150,62,.4);color:var(--red);font-weight:600}
</style>
