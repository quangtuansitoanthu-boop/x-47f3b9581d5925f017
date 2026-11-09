<script lang="ts">
  interface Props { count?: number; }
  let { count = 6 }: Props = $props();
</script>

<div class="practice-skeleton-grid" aria-hidden="true">
  {#each Array(count) as _}
    <article class="practice-card-skeleton">
      <div class="practice-card-skeleton__image"></div>
      <div class="practice-card-skeleton__body">
        <span class="practice-card-skeleton__category shimmer"></span>
        <span class="practice-card-skeleton__title shimmer"></span>
        <div class="practice-card-skeleton__footer">
          <span class="practice-card-skeleton__date shimmer"></span><span class="practice-card-skeleton__action shimmer"></span>
        </div>
      </div>
    </article>
  {/each}
</div>

<style>
  .practice-skeleton-grid{display:grid;max-width:1000px;margin:0 auto;padding:0 16px 100px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}.practice-card-skeleton{overflow:hidden;border:1.5px solid var(--border2);border-radius:14px;background:var(--white)}.practice-card-skeleton__image{width:100%;aspect-ratio:16/7;background:var(--gold-muted)}.practice-card-skeleton__body{display:flex;min-height:116px;flex-direction:column;padding:14px 16px 16px}.practice-card-skeleton__category{width:35%;height:16px;border-radius:10px}.practice-card-skeleton__title{width:82%;height:18px;margin-top:10px;border-radius:6px}.practice-card-skeleton__footer{display:flex;align-items:center;justify-content:space-between;margin-top:auto}.practice-card-skeleton__date{width:62px;height:11px;border-radius:6px}.practice-card-skeleton__action{width:82px;height:27px;border-radius:20px}.shimmer{position:relative;display:block;overflow:hidden;background:var(--bg3)}.shimmer::after{position:absolute;inset:0;content:'';background:linear-gradient(90deg,transparent,rgba(255,255,255,.58),transparent);transform:translateX(-100%);animation:practice-skeleton-shimmer 1.35s ease-in-out infinite}@keyframes practice-skeleton-shimmer{to{transform:translateX(100%)}}@media(max-width:600px){.practice-skeleton-grid{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){.shimmer::after{animation:none}}
</style>
