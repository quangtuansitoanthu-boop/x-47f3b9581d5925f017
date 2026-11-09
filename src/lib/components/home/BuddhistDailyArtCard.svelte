<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    solarToLunar,
    getDayCanChi,
    getHoangDaoInfo,
    CAN,
    CHI,
  } from '$lib/components/lunar/lunar-calendar';
  import { formatCanChiEn } from '$lib/components/lunar/lunar-week';
  import { getLunarEvent } from '$lib/components/lunar/lunar-events';
  import { DAILY_CALENDAR_ARTWORKS, getCalendarArtwork } from '$lib/components/lunar/calendar-artwork';

  interface Props {
    currentDate?: Date;
  }

  let { currentDate = new Date() }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let manualArtIndex = $state<number | null>(null);
  let failedImage = $state('');

  const solarDay = $derived(currentDate.getDate());
  const solarMonth = $derived(currentDate.getMonth() + 1);
  const solarYear = $derived(currentDate.getFullYear());

  const lunar = $derived(solarToLunar(solarDay, solarMonth, solarYear));
  const dayCanChi = $derived(getDayCanChi(solarDay, solarMonth, solarYear));
  const hoangDao = $derived(getHoangDaoInfo(lunar.month, dayCanChi.chiIndex));
  const lunarEvent = $derived(getLunarEvent(currentDate, localeStore.current));

  const pad = (n: number) => String(n).padStart(2, '0');

  // Lunar year Can Chi
  const canYear = $derived(CAN[(lunar.year + 6) % 10]);
  const chiYear = $derived(CHI[(lunar.year + 8) % 12]);
  const yearCanChiStr = $derived(isEn ? formatCanChiEn(canYear, chiYear) : `${canYear} ${chiYear}`);

  // Weekday title
  const weekdaysVi = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const weekdaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const solarTitle = $derived(
    isEn
      ? `${weekdaysEn[currentDate.getDay()]} · ${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`
      : `${weekdaysVi[currentDate.getDay()]} · ${pad(solarDay)}/${pad(solarMonth)}/${solarYear}`
  );

  const dateKey = $derived(`${solarYear}-${solarMonth}-${solarDay}`);
  let manualArtDate = $state('');
  const artwork = $derived(getCalendarArtwork(currentDate, lunarEvent, manualArtDate === dateKey ? manualArtIndex : null));
  const currentBgImage = $derived(artwork.src);

  function nextBackground(event: MouseEvent): void {
    event.stopPropagation();
    if (artwork.feast) return;
    manualArtDate = dateKey;
    manualArtIndex = (DAILY_CALENDAR_ARTWORKS.indexOf(currentBgImage) + 1) % DAILY_CALENDAR_ARTWORKS.length;
  }
</script>

<section class="buddhist-daily-art-card" aria-label={isEn ? 'Daily Buddhist Calendar Card' : 'Thẻ Lịch Phật Giáo Nghệ Thuật'}>
  <div class="art-main">
    <div class="art-visual" class:art-visual--statue={artwork.feast} aria-hidden="true">
      {#if failedImage !== currentBgImage}
        {#key currentBgImage}
          <img src={currentBgImage} alt="" class="art-bg-img" loading="lazy" decoding="async" onerror={() => failedImage = currentBgImage} />
        {/key}
      {:else}
        <svg class="art-placeholder" viewBox="0 0 120 140" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><circle cx="60" cy="64" r="48"/><path d="M60 104C30 85 32 54 60 24c28 30 30 61 0 80ZM60 104C26 108 8 86 12 60c27 0 44 17 48 44Zm0 0c34 4 52-18 48-44-27 0-44 17-48 44Z"/></svg>
      {/if}
      <div class="art-bg-scrim"></div>
    </div>
    <div class="art-left-panel">
      <p class="art-eyebrow"><span class="art-line" aria-hidden="true"></span>{isEn ? 'Buddhist calendar' : 'Lịch Phật giáo'}</p>
      <div class="art-lunar-label">{isEn ? 'Lunar day' : 'Ngày âm lịch'}</div>
      <div class="art-huge-day">{pad(lunar.day)}</div>
      <div class="art-lunar-month">{isEn ? 'Month' : 'Tháng'} {pad(lunar.month)}{#if lunar.leap}<span class="leap-badge">{isEn ? ' · Leap' : ' · Nhuận'}</span>{/if}</div>
      <div class="art-lunar-year">{isEn ? 'Year of' : 'Năm'} {yearCanChiStr}</div>
      <div class="art-lunar-meta">{isEn ? 'Day of' : 'Ngày'} {isEn ? formatCanChiEn(dayCanChi.can, dayCanChi.chi) : dayCanChi.fullName}</div>
    </div>
  </div>
  <footer class="art-footer">
    <time class="art-solar-text" datetime={solarYear + '-' + pad(solarMonth) + '-' + pad(solarDay)}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/></svg>
      {solarTitle}
    </time>
    {#if lunarEvent.viaName || lunarEvent.isThapTrai}
      <span class="art-event-tag"><span class="art-event-dot" aria-hidden="true"></span>{lunarEvent.viaName || (isEn ? 'Fasting day' : 'Ngày Thập trai')}</span>
    {:else}
      <span class="art-day-quality">{isEn ? 'A day of mindful practice' : 'Mỗi ngày một niệm lành'}</span>
    {/if}
    {#if !artwork.feast}
    <button type="button" class="art-shuffle-btn" onclick={nextBackground} title={isEn ? 'Change scenery' : 'Đổi hình nền'} aria-label={isEn ? 'Change zen background' : 'Đổi hình nền'}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7h-9a4 4 0 0 0-4 4M16 3l4 4-4 4M4 17h9a4 4 0 0 0 4-4M8 21l-4-4 4-4"/></svg>
    </button>
    {/if}
    {#if currentBgImage.endsWith('/thich-quang-duc.webp')}
      <span class="art-credit">Ảnh: <a href="https://commons.wikimedia.org/wiki/File:Th%C3%ADch_Qu%E1%BA%A3ng_%C4%90%E1%BB%A9c_cropped.jpg" target="_blank" rel="noopener noreferrer">Ngô Trung</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a> · {isEn ? 'resized' : 'đã thu nhỏ'}</span>
    {/if}
    <span class="visually-hidden">{hoangDao.isHoangDao ? (isEn ? 'Auspicious day' : 'Ngày Hoàng Đạo') : (isEn ? 'Inauspicious day' : 'Ngày Hắc Đạo')}</span>
  </footer>
</section>

<style>
  .buddhist-daily-art-card{width:100%;overflow:hidden;border:1px solid var(--border);border-radius:var(--radius-feature);background:var(--calendar-bg);color:var(--calendar-ink);box-shadow:var(--shadow-lg)}
  .art-main{position:relative;isolation:isolate;display:grid;grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr);gap:8px;min-height:310px;overflow:hidden;background:radial-gradient(ellipse at 10% 5%,#fff 0%,#faf4e9 44%,var(--calendar-bg) 100%)}
  .art-main::after{position:absolute;content:'';inset:12px;border:1px solid rgba(226,191,126,.18);border-radius:16px;pointer-events:none;z-index:2}
  .art-visual{position:relative;grid-column:2;grid-row:1;min-width:0;margin:12px 12px 12px 0;border-radius:14px;overflow:hidden;background:radial-gradient(ellipse at 65% 45%,#fff8e8,var(--calendar-bg) 80%)}
  .art-bg-img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;animation:art-reveal var(--motion-enter) var(--ease-standard)}
  .art-visual--statue .art-bg-img{object-fit:contain;object-position:center;padding:0}
  .art-bg-scrim{display:none}
  .art-left-panel{box-sizing:border-box;position:relative;grid-column:1;grid-row:1;z-index:1;display:flex;flex-direction:column;align-items:flex-start;min-width:0;min-height:286px;margin:12px 0 12px 12px;padding:20px 16px;border:1px solid rgba(255,255,255,.9);border-radius:16px;background:linear-gradient(145deg,rgba(255,255,255,.92),rgba(250,244,231,.82));box-shadow:0 4px 20px rgba(130,105,62,.08),inset 0 1px 0 #fff;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
  .art-eyebrow{display:flex;align-items:center;gap:8px;margin:0 0 24px;color:var(--calendar-accent);font-size: var(--font-size-meta);line-height:1.5;font-weight:600;letter-spacing:.13em;text-transform:uppercase}
  .art-line{width:18px;height:1px;background:currentColor}
  .art-lunar-label{color:var(--calendar-muted);font-size: var(--font-size-meta);line-height:1.6;letter-spacing:.02em}
  .art-huge-day{margin:0 0 6px;color:var(--calendar-ink);font-size:92px;font-weight:400;line-height:1.08;letter-spacing:-5px;font-variant-numeric:tabular-nums}
  .art-lunar-month{font-size:20px;font-weight:600;line-height:1.4;color:var(--calendar-ink)}
  .leap-badge{font-size: var(--font-size-meta)}
  .art-lunar-year{margin-top:6px;color:var(--calendar-accent);font-size: var(--font-size-meta);line-height:1.5}
  .art-lunar-meta{margin-top:3px;color:var(--calendar-muted);font-size: var(--font-size-meta);line-height:1.5}
  .art-shuffle-btn{grid-column:2;grid-row:1 / span 2;display:grid;place-items:center;width:48px;height:48px;border:1px solid var(--border);border-radius:50%;background:rgba(255,252,245,.94);box-shadow:0 3px 14px #6d54251a;color:var(--calendar-ink);cursor:pointer;transition:transform var(--motion-press),background var(--motion-fast)}
  .art-shuffle-btn:hover{background:var(--calendar-bg)}.art-shuffle-btn:active{transform:scale(.96)}
  .art-footer{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 48px;align-items:center;gap:6px 12px;padding:16px 20px;background:var(--card);color:var(--text);border-top:1px solid var(--border2)}
  .art-solar-text,.art-event-tag,.art-day-quality{grid-column:1;min-width:0;overflow-wrap:anywhere}
  .art-solar-text{display:flex;align-items:center;gap:8px;font-size: var(--font-size-label);font-weight:600;line-height:1.6}
  .art-solar-text svg{flex-shrink:0;color:var(--brown)}
  .art-event-tag{display:flex;align-items:center;gap:8px;color:var(--brown);font-size: var(--font-size-meta);font-weight:600;line-height:1.6}
  .art-event-dot{width:6px;height:6px;flex-shrink:0;border-radius:50%;background:var(--gold)}
  .art-day-quality{font-size: var(--font-size-meta);color:var(--text2);line-height:1.6}
  .art-credit{grid-column:1 / -1;font-size: var(--font-size-meta);line-height:1.6;color:var(--muted)}
  .art-credit a{color:inherit;text-underline-offset:2px}
  .art-placeholder{height:90%;width:90%;padding:24px;color:var(--calendar-accent);opacity:.3}
  @keyframes art-reveal{from{opacity:.2}to{opacity:1}}
  @media(max-width:540px){.art-main{min-height:300px}.art-left-panel{padding:20px 12px;min-height:276px}.art-eyebrow{margin-bottom:22px;font-size: var(--font-size-meta);letter-spacing:.02em;gap:5px}.art-line{width:12px}.art-huge-day{font-size:80px}.art-lunar-month{font-size:18px}.art-footer{padding:14px 16px;gap:6px 10px}}
  @media(prefers-reduced-motion:reduce){.art-bg-img{animation:none}.art-shuffle-btn{transition:none}}
</style>
