<script lang="ts">
  import PracticeFloatingControls from './PracticeFloatingControls.svelte';
  import { savedContentImages } from '$lib/browser/session-cover';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import type { PracticeAutoScrollSpeed } from '$lib/browser/practice-auto-scroll';
  import type { MeditationTrack } from '$lib/browser/practice-audio';
  import type { PracticeFabPosition } from '$lib/browser/practice-storage';
  import type { PracticeArticleDetail } from '$lib/domain/practice/state';

  interface Props {
    article: PracticeArticleDetail;
    autoScrollActive: boolean;
    autoScrollSpeed: PracticeAutoScrollSpeed;
    currentChapterIndex: number;
    navigationReady?: boolean;
    fabPosition: PracticeFabPosition | null;
    fontSize: number;
    meditationMusicActive: boolean;
    selectedMeditationTrack: MeditationTrack | null;
    modelChantActive: boolean;
    moActive: boolean;
    panelOpen: boolean;
    practiceBackground: string;
    practiceBold: boolean;
    practiceCount: number;
    practiceHtml: string;
    practiceTitle: string;
    showChapterNavigation: boolean;
    totalChapters: number;
    onAutoScrollToggle: () => void;
    onAutoScrollSpeedChange: (speed: PracticeAutoScrollSpeed) => void;
    onBackgroundChange: (value: string) => void;
    onCountChange: (delta: number) => void;
    onExit: () => void;
    onFabPositionSave: (position: PracticeFabPosition) => void;
    onFontSizeChange: (delta: number) => void;
    onNextChapter: () => void;
    onPanelToggle: () => void;
    onPreviousChapter: () => void;
    onSelectMeditationTrack: (track: MeditationTrack) => void;
    onStopMeditationMusic: () => void;
    onModelChantToggle: () => void;
    onToggleBold: () => void;
    onToggleMo: () => void;
  }

  let {
    article,
    autoScrollActive,
    autoScrollSpeed,
    currentChapterIndex,
    navigationReady = true,
    fabPosition,
    fontSize,
    meditationMusicActive,
    selectedMeditationTrack,
    modelChantActive,
    moActive,
    panelOpen,
    practiceBackground,
    practiceBold,
    practiceCount,
    practiceHtml,
    practiceTitle,
    showChapterNavigation,
    totalChapters,
    onAutoScrollToggle,
    onAutoScrollSpeedChange,
    onBackgroundChange,
    onCountChange,
    onExit,
    onFabPositionSave,
    onFontSizeChange,
    onNextChapter,
    onPanelToggle,
    onPreviousChapter,
    onSelectMeditationTrack,
    onStopMeditationMusic,
    onModelChantToggle,
    onToggleBold,
    onToggleMo
  }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);
  const toolbarT = $derived(localeStore.t.readerToolbar);

  const backgrounds = $derived([
    { label: toolbarT.bgWhite, value: 'white', color: '#fff' },
    { label: toolbarT.bgCream, value: 'cream', color: '#FAF6EE' },
    { label: toolbarT.bgGray, value: 'gray', color: '#E8E8E8' },
    { label: toolbarT.bgDark, value: 'dark', color: '#15120D' }
  ] as const);
</script>

<section class="tt-practice practice-theme" data-practice={article.category} data-bg={practiceBackground} aria-label={t.title}>
  <header class="ttp-header">
    <button class="ttp-back" type="button" aria-label={t.confirmExitPracticeBtn} title={t.confirmExitPracticeBtn} onclick={onExit}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg></button>
    <strong class="ttp-header-title">{article.title}</strong>
    <span class="ttp-header-badge" aria-live="polite">
      {practiceCount > 0 ? t.chantedCountBadge.replace('{count}', String(practiceCount)) : t.practiceSessionBadge}
    </span>
  </header>

  <div class="tt-practice__toolbar ttp-reader-bar" role="toolbar" aria-label={t.practiceToolbarAria}>
    <span class="ttp-rbar-label">{localeStore.current === 'en' ? 'Font size' : 'Cỡ chữ'}</span>
    <button class="ttp-rbar-btn" type="button" aria-label="A−" onclick={() => onFontSizeChange(-1)}>A−</button>
    <span class="ttp-rbar-fs">{fontSize}px</span>
    <button class="ttp-rbar-btn" type="button" aria-label="A+" onclick={() => onFontSizeChange(1)}>A+</button>
    <span class="ttp-rbar-sep" aria-hidden="true"></span>
    <button class:active={practiceBold} class="ttp-bold-btn" type="button" aria-label="Bold" aria-pressed={practiceBold} title="Bold" onclick={onToggleBold}><b>B</b></button>
    <span class="ttp-rbar-sep" aria-hidden="true"></span>
    <span class="ttp-rbar-label">{t.bgLabel}</span>
    {#each backgrounds as background}
      <button
        class:active={practiceBackground === background.value}
        class="ttp-bg-swatch"
        type="button"
        aria-label={background.label}
        aria-pressed={practiceBackground === background.value}
        title={background.label}
        style:--swatch-color={background.color}
        onclick={() => onBackgroundChange(background.value)}
      ></button>
    {/each}
    <span class="ttp-rbar-sep" aria-hidden="true"></span>
    <span class="ttp-rbar-label">{t.scrollLabel}</span>
    <button class:active={autoScrollActive} class="ttp-rbar-btn ttp-auto-scroll" type="button" aria-pressed={autoScrollActive} title={t.scrollLabel} onclick={onAutoScrollToggle}>
      {autoScrollActive ? t.scrollStop : t.scrollPlay}
    </button>
    <select
      aria-label={t.scrollLabel}
      value={String(autoScrollSpeed)}
      onchange={(event) => onAutoScrollSpeedChange(Number((event.currentTarget as HTMLSelectElement).value) as PracticeAutoScrollSpeed)}
    >
      <option value="0.25">{t.speedVerySlow}</option>
      <option value="0.5">{t.speedSlow}</option>
      <option value="1">{t.speedNormal}</option>
      <option value="2">{t.speedFast}</option>
    </select>
    <span class="ttp-rbar-sep" aria-hidden="true"></span>
    <button class:active={modelChantActive} class="ttp-rbar-btn" type="button" aria-pressed={modelChantActive} onclick={onModelChantToggle}>
      {modelChantActive ? t.modelChantStop : t.modelChantPlay}
    </button>
  </div>

  <main class="ttp-body">
    <div class="ttp-candle-glow" aria-hidden="true"></div>
    <article class="ttp-scroll-area">
      <h1 class="ttp-art-title">{practiceTitle}</h1>
      <div class="ttp-divider" aria-hidden="true"><span>☸</span></div>
      <div class:ttp-read-bold={practiceBold} class="ttp-content" style={`font-size:${fontSize}px`} use:savedContentImages>
        {@html practiceHtml}
      </div>

      {#if showChapterNavigation}
        <nav class="ttp-chapter-nav" aria-label="Chapter navigation">
          <button type="button" onclick={onPreviousChapter} disabled={!navigationReady || currentChapterIndex <= 0}>{t.prevChapter}</button>
          <span>{currentChapterIndex + 1} / {totalChapters}</span>
          <button type="button" onclick={onNextChapter} disabled={!navigationReady || currentChapterIndex >= totalChapters - 1}>{t.nextChapter}</button>
        </nav>
      {/if}
    </article>
  </main>

  <PracticeFloatingControls
    {fabPosition}
    {meditationMusicActive}
    {selectedMeditationTrack}
    {moActive}
    {panelOpen}
    {practiceCount}
    {onCountChange}
    {onFabPositionSave}
    {onPanelToggle}
    {onSelectMeditationTrack}
    {onStopMeditationMusic}
    {onToggleMo}
  />
</section>

<style>
  .tt-practice{position:relative;z-index:640;width:100%;min-height:100vh;background:#faf6ee;color:#3a2e1a;font-family:var(--font-app)}
  .ttp-header{position:fixed;z-index:650;top:0;right:0;left:0;display:flex;height:58px;align-items:center;gap:12px;padding:0 16px;border-bottom:1.5px solid var(--border2);background:var(--bg);box-shadow:var(--shadow);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
  .ttp-back{flex-shrink:0;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--gold);cursor:pointer;font:400 22px/1 var(--font-app);transition:background .15s}.ttp-back:hover{background:var(--gold-light)}
  .ttp-header-title{overflow:hidden;flex:1;color:var(--text2);font-size:13px;font-weight:600;text-align:center;text-overflow:ellipsis;white-space:nowrap}.ttp-header-badge{flex-shrink:0;padding:3px 10px;border:1px solid var(--gold-muted);border-radius:12px;background:var(--gold-light);color:var(--gold);font-size:11px;font-weight:700;white-space:nowrap}
  .ttp-reader-bar{position:fixed;z-index:645;top:58px;right:0;left:0;display:flex;overflow-x:auto;align-items:center;gap:8px;padding:7px 16px;border-bottom:1px solid var(--border2);background:var(--bg2);scrollbar-width:none}.ttp-reader-bar::-webkit-scrollbar{display:none}
  .ttp-rbar-label{flex-shrink:0;color:var(--muted);font-size:11px;white-space:nowrap}.ttp-rbar-btn{flex-shrink:0;padding:4px 9px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font:600 13px/1.4 var(--font-app);white-space:nowrap;transition:border-color .15s,color .15s,background .15s}.ttp-rbar-btn:hover,.ttp-rbar-btn.active{border-color:var(--gold);color:var(--gold)}
  .ttp-rbar-sep{width:1px;height:18px;flex-shrink:0;background:var(--border2)}.ttp-rbar-fs{min-width:38px;color:var(--text2);font-size:13px;text-align:center}
  .ttp-bold-btn{display:inline-flex;width:34px;height:30px;flex-shrink:0;align-items:center;justify-content:center;padding:0;border:1.5px solid var(--border);border-radius:7px;background:var(--bg2);color:var(--text2);cursor:pointer;font:900 17px/1 Georgia,serif;transition:background .15s,border-color .15s,color .15s}.ttp-bold-btn:hover{border-color:var(--gold);color:var(--gold)}.ttp-bold-btn.active{border-color:var(--gold);background:var(--gold);color:#fff}
  .ttp-bg-swatch{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer}.ttp-bg-swatch::before{content:'';box-sizing:border-box;width:22px;height:22px;border:2px solid transparent;border-radius:50%;background:var(--swatch-color);box-shadow:inset 0 0 0 1px rgba(80,65,48,.08);transition:border-color .15s,transform .18s}.ttp-bg-swatch:hover::before{transform:scale(1.08)}.ttp-bg-swatch.active::before{border-color:var(--gold)}
  .ttp-reader-bar select{height:26px;flex-shrink:0;padding:2px 4px;border:1.5px solid var(--border);border-radius:8px;outline:none;background:var(--white);color:var(--text);cursor:pointer;font:400 11px/1 var(--font-app)}.ttp-reader-bar select:focus-visible{border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 24%,transparent)}
  .ttp-body{position:relative;min-height:100vh;padding-top:96px;background:#faf6ee;transition:background-color .25s ease,color .25s ease}.ttp-body::before{position:fixed;z-index:0;inset:0;background-image:repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(139,99,64,.04) 28px,rgba(139,99,64,.04) 29px);pointer-events:none;content:''}.ttp-candle-glow{position:fixed;z-index:0;inset:0;background:radial-gradient(ellipse 60% 40% at 50% 20%,rgba(200,150,62,.08) 0%,transparent 70%);pointer-events:none}
  .ttp-scroll-area{position:relative;z-index:1;max-width:680px;margin:0 auto;padding:32px 24px 180px}.ttp-art-title{margin:0 0 8px;color:#6b4c2a;font:700 clamp(17px,3.5vw,22px)/1.35 Lora,Georgia,serif;letter-spacing:.5px;text-align:center}.ttp-divider{display:flex;max-width:300px;align-items:center;gap:12px;margin:0 auto 28px}.ttp-divider::before,.ttp-divider::after{height:1px;flex:1;background:linear-gradient(to right,transparent,rgba(200,150,62,.4),transparent);content:''}.ttp-divider span{font-size:16px}
  .ttp-content{color:#3a2e1a;font-family:'Bookerly',Lora,Georgia,serif;line-height:2.1;letter-spacing:.3px;text-align:center;white-space:pre-line}.ttp-content.ttp-read-bold,.ttp-content.ttp-read-bold :global(*){font-weight:700!important}.ttp-content :global(.tt-content__line){display:block;margin-bottom:.15em;text-align:justify;text-align-last:left}.ttp-content :global(.tt-content__line--center){text-align:center;text-align-last:center}.ttp-content :global(.tt-content__line--right){text-align:right;text-align-last:right}.ttp-content :global(.tt-content__gap){height:.38em!important}.ttp-content :global(p){margin:0 0 .38em!important;white-space:normal}.ttp-content :global(p:empty){display:none!important}.ttp-content :global(h1),.ttp-content :global(h2),.ttp-content :global(h3){margin:1.1em 0 .4em!important;color:#6b4c2a;font-size:clamp(16px,3vw,20px)}.ttp-content :global(strong){color:inherit}.ttp-content :global(em){color:inherit}.ttp-content :global(img){max-width:100%;height:auto;margin:1em 0;border-radius:8px}.ttp-content :global(blockquote){max-width:500px;margin:1em auto;padding:10px 16px;border-left:3px solid var(--gold);border-radius:0 8px 8px 0;background:var(--gold-light);color:var(--brown);font-style:italic;text-align:left}
  .ttp-chapter-nav{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:40px;padding:20px 0 10px;border-top:1px solid rgba(200,150,62,.15)}.ttp-chapter-nav button{display:flex;align-items:center;gap:6px;padding:9px 18px;border:1.5px solid rgba(200,150,62,.5);border-radius:20px;background:rgba(200,150,62,.15);color:var(--gold);cursor:pointer;font:600 13px/1 var(--font-app);transition:.15s}.ttp-chapter-nav button:disabled{border-color:rgba(200,150,62,.2);background:rgba(200,150,62,.05);color:rgba(200,150,62,.3);cursor:default}.ttp-chapter-nav span{color:rgba(107,76,42,.6);font-size:12px;white-space:nowrap}
  .tt-practice[data-bg='white'],.tt-practice[data-bg='white'] .ttp-body{background:#fff}.tt-practice[data-bg='white'] .ttp-content{color:#1c1a15}.tt-practice[data-bg='cream'],.tt-practice[data-bg='cream'] .ttp-body{background:#faf6ee}.tt-practice[data-bg='cream'] .ttp-content{color:#3a2e1a}.tt-practice[data-bg='gray'],.tt-practice[data-bg='gray'] .ttp-body{background:#e8e8e8}.tt-practice[data-bg='gray'] .ttp-content{color:#2a2a2a}.tt-practice[data-bg='gray'] .ttp-art-title{color:#4a3520}.tt-practice[data-bg='dark'],.tt-practice[data-bg='dark'] .ttp-body{background:#15120d}.tt-practice[data-bg='dark'] .ttp-content{color:#ede8df}.tt-practice[data-bg='dark'] .ttp-art-title{color:#d4a84b}.tt-practice[data-bg='dark'] .ttp-chapter-nav span{color:rgba(237,232,223,.4)}
  .tt-practice[data-bg='dark'] .ttp-content :global(h1),.tt-practice[data-bg='dark'] .ttp-content :global(h2),.tt-practice[data-bg='dark'] .ttp-content :global(h3){color:var(--gold)}
  button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}
  :global(body:has(.tt-practice) .qts-footer){display:none}
  .tt-practice,.ttp-back,.ttp-rbar-btn,.ttp-bold-btn,.ttp-reader-bar select,.ttp-art-title,.ttp-chapter-nav button{font-family:var(--font-app)}
  @media(max-width:600px){.ttp-header{padding:0 8px}.ttp-header-title{font-size:12px}.ttp-header-badge{padding:3px 7px;font-size:10px}.ttp-reader-bar{padding-right:10px;padding-left:10px}.ttp-scroll-area{padding:28px 20px 160px}.ttp-chapter-nav{gap:8px}.ttp-chapter-nav button{padding:8px 12px;font-size:12px}}
  @media(prefers-reduced-motion:reduce){.ttp-rbar-btn,.ttp-bold-btn,.ttp-bg-swatch::before,.ttp-body,.ttp-chapter-nav button{transition:none}}
  .ttp-content :global(.tt-content__line--form){text-align:left;text-align-last:left;white-space:normal;overflow-wrap:anywhere;word-spacing:normal}
  .ttp-content :global(.tt-content__line--fill-in){text-align:left;text-align-last:left;white-space:normal}
  .ttp-content :global(.tt-content__blank){display:inline-block;max-width:min(6em,calc(100% - .4em));overflow:hidden;white-space:nowrap;vertical-align:bottom;margin-inline:.2em;letter-spacing:0}
  button{min-height:44px}
  select{min-height:44px}

  .ttp-header{height:auto;min-height:58px;padding:var(--app-safe-top,env(safe-area-inset-top,0px)) 16px 0}
  .ttp-reader-bar{top:calc(58px + var(--app-safe-top,env(safe-area-inset-top,0px)))}
  .ttp-body{padding-top:calc(96px + var(--app-safe-top,env(safe-area-inset-top,0px)))}
  .ttp-back{width:44px;height:44px;min-width:44px;min-height:44px}
  .ttp-rbar-btn,.ttp-bold-btn,.ttp-bg-swatch{min-width:44px;min-height:44px}
</style>
