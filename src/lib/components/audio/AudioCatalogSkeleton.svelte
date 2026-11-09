<script lang="ts">
  interface Props { count?: number; }
  let { count = 4 }: Props = $props();
</script>

<div class="album-grid pt-grid audio-skeleton-grid" aria-hidden="true">
  {#each Array(count) as _}
    <article class="audio-card-skeleton">
      <div class="audio-card-skeleton__thumb shimmer">
        <span class="audio-card-skeleton__count shimmer"></span>
      </div>
      <div class="audio-card-skeleton__body">
        <span class="audio-card-skeleton__topic shimmer"></span>
        <span class="audio-card-skeleton__title shimmer"></span>
        <div class="audio-card-skeleton__meta">
          <span class="audio-card-skeleton__meta-item shimmer"></span>
          <span class="audio-card-skeleton__meta-item shimmer"></span>
          <span class="audio-card-skeleton__meta-item shimmer"></span>
        </div>
      </div>
      <div class="audio-card-skeleton__actions">
        <span class="audio-card-skeleton__btn shimmer"></span>
        <span class="audio-card-skeleton__btn shimmer"></span>
        <span class="audio-card-skeleton__play shimmer"></span>
      </div>
    </article>
  {/each}
</div>

<style>
  .audio-skeleton-grid{display:flex;flex-direction:column;gap:8px;border:0;background:transparent}
  .audio-card-skeleton{display:flex;align-items:center;background:var(--card);border:1px solid var(--border2);border-radius:14px;min-height:169px}
  .audio-card-skeleton__thumb{position:relative;width:76px;height:76px;aspect-ratio:16/7;margin:8px 0 8px 10px;border-radius:12px;flex-shrink:0;background:var(--gold-muted)}
  .audio-card-skeleton__count.shimmer{position:absolute;top:4px;right:4px;width:18px;height:14px;border-radius:4px}
  .audio-card-skeleton__body{display:flex;min-width:0;flex:1;flex-direction:column;gap:6px;padding:10px 12px}
  .audio-card-skeleton__topic{width:28%;height:10px;border-radius:6px}
  .audio-card-skeleton__title{width:72%;height:16px;border-radius:6px}
  .audio-card-skeleton__meta{display:flex;align-items:center;gap:8px;margin-top:2px}
  .audio-card-skeleton__meta-item{height:11px;border-radius:6px}
  .audio-card-skeleton__meta-item:first-child{width:46px}
  .audio-card-skeleton__meta-item:nth-child(2){width:78px}
  .audio-card-skeleton__meta-item:last-child{width:72px}
  .audio-card-skeleton__actions{display:flex;align-items:center;gap:8px;padding:0 14px 0 6px;flex-shrink:0;margin-left:auto}
  .audio-card-skeleton__btn{display:block;width:34px;height:34px;border-radius:10px}
  .audio-card-skeleton__play{display:block;width:44px;height:44px;border-radius:14px}
  .shimmer{position:relative;display:block;overflow:hidden;background:var(--bg3)}
  .audio-card-skeleton__thumb.shimmer{background:var(--gold-muted)}
  .shimmer::after{position:absolute;inset:0;content:'';background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);transform:translateX(-100%);animation:audio-skeleton-shimmer 1.35s ease-in-out infinite}
  @keyframes audio-skeleton-shimmer{to{transform:translateX(100%)}}
  @media(max-width:600px){.audio-card-skeleton__thumb{width:70px;height:70px}.audio-skeleton-grid{border-radius:10px}}
  @media(prefers-reduced-motion:reduce){.shimmer::after{animation:none}}
</style>
