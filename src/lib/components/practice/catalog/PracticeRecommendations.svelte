<script lang="ts">
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  import type {
    PracticeRecommendation,
    PracticeRecommendationPeriod,
    PracticeRecommendationSet,
  } from '$lib/browser/practice-recommendations';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import type { Snippet } from 'svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  interface Props {
    recommendations: PracticeRecommendationSet;
    onAction: (recommendation: PracticeRecommendation) => void;
    onPeriodChange: (period: PracticeRecommendationPeriod) => void;
    isCollapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    routines?: Snippet;
  }

  let { recommendations, onAction, onPeriodChange, isCollapsed = $bindable(true), onCollapsedChange, routines }: Props = $props();

  function setCollapsed(collapsed: boolean) {
    if (isCollapsed === collapsed) return;
    isCollapsed = collapsed;
    onCollapsedChange?.(collapsed);
  }

  const firstRec = $derived(recommendations.recommendations[0] ?? null);
</script>

<button type="button" class="tt-mode-card tt-mode-card--rec" onclick={() => setCollapsed(false)}>
  <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="practice" size={48} /></div>
  <div class="tt-mode-body">
    <span class="tt-mode-title">{t.practice.suggestedRoutine}</span>
    <span class="tt-mode-desc">{firstRec ? firstRec.title : t.practice.suggestedRoutine}</span>
  </div>
  <span class="tt-mode-arrow" aria-hidden="true">→</span>
</button>

{#if !isCollapsed}
<div class="tt-modal-overlay" onclick={(e) => { if (e.target === e.currentTarget) setCollapsed(true); }} role="dialog" aria-modal="true" aria-labelledby="practice-recommendations-title" onkeydown={(e) => e.key === 'Escape' && setCollapsed(true)} tabindex="-1">
  <div class="tt-modal-container" data-practice="recommendations" role="document">
    <section class="practice-recommendations" aria-labelledby="practice-recommendations-title">
      <header>
        <div class="practice-recommendations__title-wrap">
          <h2 id="practice-recommendations-title">{t.practice.suggestedRoutine}</h2>
          <p>{recommendations.contextLabel}</p>
          {#if recommendations.lunarLabel}
            <small>{localeStore.current === 'en' ? 'Lunar: ' : 'Âm lịch: '}{recommendations.lunarLabel}</small>
          {/if}
        </div>

        <button type="button" class="tt-rec-toggle-btn" onclick={() => setCollapsed(true)} aria-label={t.practice.backToPractice}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m18 6-12 12M6 6l12 12" /></svg></button>
      </header>
      <div class="practice-recommendations__scroll">
          <div class="practice-recommendations__period" role="group" aria-label={localeStore.current === 'en' ? 'Suggested time' : 'Thời điểm gợi ý'}>
            <button
              class:active={recommendations.period === 'morning'}
              type="button"
              aria-pressed={recommendations.period === 'morning'}
              onclick={() => onPeriodChange('morning')}
            >{localeStore.current === 'en' ? 'Morning' : 'Buổi sáng'}</button>
            <button
              class:active={recommendations.period === 'evening'}
              type="button"
              aria-pressed={recommendations.period === 'evening'}
              onclick={() => onPeriodChange('evening')}
            >{localeStore.current === 'en' ? 'Evening' : 'Buổi tối'}</button>
          </div>

      <div class="practice-recommendations__grid">
      {#each recommendations.recommendations as recommendation (recommendation.id)}
        <article class:holy={recommendation.reason !== 'daily'}>
          <span class="practice-recommendations__icon" aria-hidden="true">
            {recommendation.action === 'ceremony'
              ? '🙏'
              : recommendation.action === 'meditation'
                ? '🪷'
                : recommendation.action === 'rosary'
                  ? '📿'
                  : '📖'}
          </span>
          <div class="practice-recommendations__body">
            {#if recommendation.stepLabel}
              <span class="practice-recommendations__step">{recommendation.stepLabel}</span>
            {/if}
            <h3>{recommendation.title}</h3>
            <p>{recommendation.description}</p>
          </div>
          <button
            type="button"
            onclick={() => onAction(recommendation)}
          >
            {recommendation.buttonLabel
              ?? (recommendation.action === 'ceremony'
                ? (localeStore.current === 'en' ? 'Prostrations' : 'Lễ Phật')
                : recommendation.action === 'meditation'
                  ? (localeStore.current === 'en' ? 'Start Meditation' : 'Bắt đầu thiền')
                  : recommendation.action === 'rosary'
                    ? (localeStore.current === 'en' ? 'Rosary Beads' : 'Lần hạt')
                    : (localeStore.current === 'en' ? 'Select Sutra' : 'Chọn bài kinh'))}
          </button>
        </article>
      {/each}
      </div>
      {@render routines?.()}
      </div>
    </section>
  </div>
</div>
{/if}

<style>
  .tt-modal-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px));background:#0007;backdrop-filter:blur(4px)}
  .tt-modal-container{width:100%;max-width:var(--practice-dialog-width);height:var(--practice-dialog-height);max-height:100%;min-height:0;display:flex;flex-direction:column}
  .practice-recommendations{height:100%;display:flex;flex-direction:column;min-height:0;max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)));overflow:hidden;border:1px solid var(--border2);border-radius:22px;background:var(--bg);color:var(--text);font-family:var(--font-app);box-shadow:var(--shadow-xl)}
  header{display:flex;flex:0 0 auto;align-items:center;justify-content:space-between;gap:12px;padding:22px 20px 18px;border-bottom:1px solid var(--border2)}
  .practice-recommendations__title-wrap{min-width:0}
  h2{margin:0;color:var(--text);font-size:var(--font-size-section-title);line-height:1.4;font-weight:700;letter-spacing:-.4px}
  header p,header small{display:block;margin:5px 0 0;color:var(--muted);font-size:var(--font-size-meta);line-height:1.6}
  .tt-rec-toggle-btn{display:flex;flex-shrink:0;align-items:center;justify-content:center;width:44px;height:44px;padding:0;border:1px solid var(--border2);border-radius:50%;background:var(--card);color:var(--text2);cursor:pointer}
  .tt-rec-toggle-btn:hover{background:var(--bg2)}
  .practice-recommendations__scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:18px 20px 20px}
  .practice-recommendations__period{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px;padding:4px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2)}
  .practice-recommendations__period button{min-height:44px;padding:6px 2px;border:0;border-radius:9px;background:transparent;color:var(--text2);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);line-height:1.4;font-weight:500}
  .practice-recommendations__period button.active{background:var(--card);color:var(--text);box-shadow:var(--shadow);font-weight:700}
  .practice-recommendations__grid{display:grid;grid-template-columns:minmax(0,1fr);margin-top:16px}
  .practice-recommendations__grid article{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;padding:18px 0;border-bottom:1px solid var(--border2)}
  .practice-recommendations__grid article:last-child{border-bottom:0}
  .practice-recommendations__icon{font-size:24px;line-height:1;margin-top:2px}
  .practice-recommendations__body{min-width:0}
  .practice-recommendations__step{display:block;margin-bottom:5px;font-size:var(--font-size-meta);font-weight:700;color:var(--muted)}
  .practice-recommendations__grid h3{margin:0;color:var(--text);font-size:var(--font-size-card-title);line-height:1.5;overflow-wrap:anywhere}
  .practice-recommendations__grid p{margin:5px 0 0;color:var(--text2);font-size:var(--font-size-body);line-height:1.8}
  .practice-recommendations__grid button{grid-column:2;justify-self:start;min-height:44px;padding:8px 14px;border:1px solid var(--border2);border-radius:var(--radius-control);background:var(--card);color:var(--text);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:700;margin-top:4px}
  .practice-recommendations__grid button:hover:not(:disabled){background:var(--bg2)}
  .practice-recommendations__grid button:disabled{opacity:.6;cursor:wait}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:3px}
  @media(max-width:380px){header{padding:18px 16px 16px}.practice-recommendations__scroll{padding:16px}h2{font-size:var(--font-size-section-title)}}

  .tt-modal-overlay{padding:max(16px,var(--app-safe-top,0px)) 12px max(16px,env(safe-area-inset-bottom,0px))}
  .practice-recommendations{max-height:calc(100dvh - max(16px,var(--app-safe-top,0px)) - max(16px,env(safe-area-inset-bottom,0px)))}
  button{min-height:44px}


  .tt-rec-toggle-btn{min-width:44px;min-height:44px}
  @media(prefers-reduced-motion:no-preference){
    .tt-modal-container{animation:recommendations-enter var(--motion-enter) var(--ease-standard) both}
    @keyframes recommendations-enter{from{opacity:0;transform:translateY(var(--radius-control))}to{opacity:1;transform:translateY(0)}}
  }
  .practice-recommendations{background:var(--dialog-glass-background);border-color:var(--dialog-glass-border);-webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);box-shadow:var(--dialog-glass-shadow)}
  @supports not (backdrop-filter:blur(1px)){.practice-recommendations{background:var(--card)}}
  @supports not (background:color-mix(in srgb,currentColor,transparent)){.practice-recommendations{background:var(--card);border-color:var(--border)}}
  @media(prefers-reduced-transparency:reduce){.practice-recommendations{background:var(--card);-webkit-backdrop-filter:none;backdrop-filter:none}}
</style>
