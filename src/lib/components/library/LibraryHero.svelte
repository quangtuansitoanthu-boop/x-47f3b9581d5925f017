<script lang="ts">
  import LunarDate from '$lib/components/lunar/LunarDate.svelte';
  import { formatToday } from '$lib/components/lunar/lunar-calendar';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.hero);
  const today = $derived(formatToday(localeStore.current));
</script>

<section class="hero" aria-labelledby="library-title">
  <div class="hero-inner">
    <div class="hero-main">
      <div class="hero-eyebrow">{t.eyebrow}</div>
      <h1 id="library-title">{t.titlePart1}<em>{t.titlePart2}</em></h1>
      <p class="hero-sub">{t.subtitle}</p>
    </div>
    <div class="hero-calendar">
      <LunarDate solarDate={today.solar} lunarDate={today.lunar} />
    </div>
  </div>
</section>
