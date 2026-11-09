<script lang="ts">
  interface Props {
    featured?: boolean;
    compact?: boolean;
    short?: boolean;
  }

  let { featured = false, compact = false, short = false }: Props = $props();
</script>

<div class="article-skeleton" class:featured class:compact class:short aria-hidden="true">
  <div class="article-skeleton__thumb">
    <span class="article-skeleton__badge"></span>
  </div>
  <div class="article-skeleton__body">
    <div class="article-skeleton__meta">
      <span class="article-skeleton__line article-skeleton__line--author"></span>
      <span class="article-skeleton__line article-skeleton__line--date"></span>
    </div>
    <span class="article-skeleton__line article-skeleton__line--title"></span>
    <span class="article-skeleton__line article-skeleton__line--copy"></span>
    <span class="article-skeleton__line article-skeleton__line--copy-short"></span>
    <div class="article-skeleton__formats"><span></span></div>
    <div class="article-skeleton__footer">
      <div class="article-skeleton__tags">
        <span></span>
        <span></span>
      </div>
      <span class="article-skeleton__line article-skeleton__line--action"></span>
    </div>
  </div>
</div>

<style>
  .article-skeleton {
    position: relative;
    display: flex;
    overflow: hidden;
    min-width: 0;
    height: 405px;
    flex-direction: column;
    border: 1px solid var(--border2);
    border-radius: var(--radius);
    background: var(--white);
  }
  .article-skeleton.featured { height: 421px; grid-column: 1 / -1; }
  .article-skeleton.compact { height: 381px; }
  .article-skeleton::after {
    position: absolute;
    z-index: 2;
    inset: 0;
    background: linear-gradient(105deg, transparent 32%, rgba(255,255,255,.52) 48%, transparent 64%);
    content: '';
    pointer-events: none;
    transform: translateX(-110%);
    animation: article-skeleton-shimmer 1.35s ease-in-out infinite;
  }
  .article-skeleton__thumb {
    position: relative;
    height: 186px;
    flex-shrink: 0;
    background: var(--bg3);
  }
  .featured .article-skeleton__thumb { height: 240px; }
  .article-skeleton__badge {
    position: absolute;
    bottom: 10px;
    left: 10px;
    width: 132px;
    height: 24px;
    border-radius: 20px;
    background: var(--bg2);
  }
  .article-skeleton__body {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    padding: 16px 18px;
  }
  .article-skeleton__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 12px;
  }
  .article-skeleton__line,
  .article-skeleton__tags span {
    display: block;
    border-radius: 999px;
    background: var(--bg3);
  }
  .article-skeleton__line--author { width: 104px; height: 11px; }
  .article-skeleton__line--date { width: 72px; height: 11px; }
  .article-skeleton__line--title { width: 78%; height: 18px; margin-bottom: 13px; }
  .featured .article-skeleton__line--title { width: 46%; height: 21px; }
  .article-skeleton__line--copy { width: 94%; height: 12px; margin-bottom: 9px; }
  .article-skeleton__line--copy-short { width: 68%; height: 12px; }
  .article-skeleton__formats { display: flex; margin-top: 8px; }
  .article-skeleton__formats span { width: 28px; height: 12px; border-radius: 3px; background: var(--bg3); }
  .article-skeleton__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: auto;
    padding-top: 11px;
    border-top: 1px solid var(--border2);
  }
  .article-skeleton__tags { display: flex; gap: 6px; }
  .article-skeleton__tags span { width: 76px; height: 22px; }
  .article-skeleton__tags span:last-child { width: 92px; }
  .article-skeleton__line--action { width: 78px; height: 13px; }

  @keyframes article-skeleton-shimmer {
    0% { transform: translateX(-110%); }
    65%, 100% { transform: translateX(110%); }
  }

  @media (max-width: 768px) {
    .article-skeleton {
      height: 187px;
      flex-direction: row;
      align-items: stretch;
      border-radius: 12px;
      box-shadow: 0 1px 6px rgba(60,40,10,.07);
    }
    .article-skeleton.featured {
      height: 355px;
      flex-direction: column;
      box-shadow: 0 3px 16px rgba(60,40,10,.1);
    }
    .article-skeleton.compact { height: 187px; }
    .article-skeleton.short { height: 167px; }
    .article-skeleton__thumb { width: 108px; height: auto; min-height: 0; }
    .featured .article-skeleton__thumb { width: 100%; height: 185px; min-height: 0; }
    .article-skeleton__badge { bottom: 7px; left: 7px; width: 88px; height: 20px; }
    .featured .article-skeleton__badge { width: 124px; }
    .article-skeleton__body { padding: 11px 13px; }
    .article-skeleton__meta { gap: 8px; margin-bottom: 9px; }
    .article-skeleton__line--author { width: 70px; }
    .article-skeleton__line--date { width: 55px; }
    .article-skeleton__line--title { width: 90%; height: 16px; margin-bottom: 10px; }
    .featured .article-skeleton__line--title { width: 72%; height: 18px; }
    .article-skeleton__line--copy { width: 96%; height: 10px; margin-bottom: 7px; }
    .article-skeleton__line--copy-short { width: 76%; height: 10px; }
    .article-skeleton__formats { margin-top: 6px; }
    .article-skeleton__footer { margin-top: auto; padding-top: 8px; }
    .article-skeleton__tags { display: none; }
    .article-skeleton__line--action { width: 68px; height: 11px; margin-left: auto; }
  }

  @media (prefers-reduced-motion: reduce) {
    .article-skeleton::after { display: none; animation: none; }
  }
</style>
