<script lang="ts">
  import { categoryIcon, type LibraryArticle } from '$lib/components/library/article';
  import { formatVietnamDateWithWeekday } from '$lib/utils/vietnam-date-format';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getLocalizedArticle } from '$lib/domain/library/localized-article';

  interface Props {
    currentArticle: LibraryArticle;
    articles?: LibraryArticle[];
    onOpen?: (article: LibraryArticle) => void;
  }

  let { currentArticle, articles = [], onOpen = () => {} }: Props = $props();

  const localeStore = getLocaleContext();

  function getLocalizedCategory(cat: string): string {
    if (localeStore.current !== 'en') return cat;
    switch (cat?.toUpperCase()) {
      case 'SÁCH KHUYẾN THIỆN': return 'MORAL BOOKS';
      case 'KINH PHẬT': return 'BUDDHIST SUTRAS';
      case 'CÁC NGHI THỨC': return 'RITUALS';
      case 'CHUYỆN NHÂN QUẢ': return 'KARMA STORIES';
      case 'SÁCH': return 'BOOKS';
      default: return cat;
    }
  }

  function getLocalizedBadge(badge: string | null): string | null {
    if (!badge || localeStore.current !== 'en') return badge;
    if (badge === 'Tập tiếp theo') return 'Next volume';
    if (badge.startsWith('Tập ')) return badge.replace('Tập ', 'Volume ');
    if (badge.startsWith('Quyển ')) return badge.replace('Quyển ', 'Volume ');
    if (badge.startsWith('Phần ')) return badge.replace('Phần ', 'Part ');
    return badge;
  }

  interface SeriesInfo {
    baseTitle: string;
    volume: number | null;
    hasVolume: boolean;
  }

  function parseRoman(str: string): number | null {
    const romanMap: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    const s = str.toLowerCase();
    let result = 0;
    for (let i = 0; i < s.length; i++) {
      const current = romanMap[s[i]];
      const next = romanMap[s[i + 1]];
      if (!current) return null;
      if (next && current < next) {
        result -= current;
      } else {
        result += current;
      }
    }
    return result > 0 ? result : null;
  }

  function normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseSeriesInfo(title: string): SeriesInfo {
    const volumeRegex = /[\s\-_—–:,./(]+(?:tập|tap|quyển|quyen|phần|phan|cuốn|cuon|hồi|hoi|vol|volume|part)\s*(\d+|[ivxlcdm]+)[\s\-_—–:,./)]*/i;
    const match = title.match(volumeRegex);
    if (match && match.index !== undefined) {
      const rawVol = match[1];
      let volNumber = Number(rawVol);
      if (isNaN(volNumber)) {
        volNumber = parseRoman(rawVol) ?? 0;
      }
      const base = title.slice(0, match.index) + title.slice(match.index + match[0].length);
      const cleanedBase = base.replace(/^[\s\-_—–:,./]+|[\s\-_—–:,./]+$/g, '').trim();
      return {
        baseTitle: cleanedBase,
        volume: volNumber > 0 ? volNumber : null,
        hasVolume: volNumber > 0
      };
    }

    const trailingNumRegex = /[\s\-_—–:,./]+(\d+)[\s\-_—–:,./)]*$/i;
    const trailingMatch = title.match(trailingNumRegex);
    if (trailingMatch && trailingMatch.index !== undefined) {
      const volNumber = Number(trailingMatch[1]);
      const cleanedBase = title.slice(0, trailingMatch.index).replace(/^[\s\-_—–:,./]+|[\s\-_—–:,./]+$/g, '').trim();
      if (cleanedBase.length >= 3 && volNumber > 0 && volNumber <= 99) {
        return {
          baseTitle: cleanedBase,
          volume: volNumber,
          hasVolume: true
        };
      }
    }

    return {
      baseTitle: title.trim(),
      volume: null,
      hasVolume: false
    };
  }

  function isSameSeries(curr: SeriesInfo, cand: SeriesInfo): boolean {
    if (!curr.baseTitle || !cand.baseTitle) return false;
    const normCurr = normalizeText(curr.baseTitle);
    const normCand = normalizeText(cand.baseTitle);

    if (!normCurr || !normCand) return false;
    if (normCurr === normCand) return true;

    const splitSubphrases = (text: string) =>
      text.split(/[\-—–:]/).map((part) => normalizeText(part)).filter((part) => part.length >= 4);

    const currParts = splitSubphrases(curr.baseTitle);
    const candParts = splitSubphrases(cand.baseTitle);

    for (const cp of currParts) {
      for (const cdp of candParts) {
        if (cp === cdp) return true;
        if (cp.includes(cdp) && cdp.length >= 6) return true;
        if (cdp.includes(cp) && cp.length >= 6) return true;
      }
    }

    if (normCurr.includes(normCand) && normCand.length >= 6) return true;
    if (normCand.includes(normCurr) && normCurr.length >= 6) return true;

    return false;
  }

  function getBadgeLabel(curr: SeriesInfo, cand: SeriesInfo): string | null {
    if (!isSameSeries(curr, cand)) return null;
    if (curr.hasVolume && cand.hasVolume && cand.volume !== null && curr.volume !== null) {
      if (cand.volume === curr.volume + 1) return 'Tập tiếp theo';
      if (cand.volume > curr.volume) return `Tập ${cand.volume}`;
      if (cand.volume < curr.volume) return `Tập ${cand.volume}`;
    }
    return 'Cùng bộ';
  }

  function viewCount(article: LibraryArticle): number {
    const count = Number(article.viewCount ?? 0);
    return Number.isFinite(count) && count > 0 ? count : 0;
  }

  function rank(items: LibraryArticle[]): { article: LibraryArticle; badge: string | null }[] {
    const currSeries = parseSeriesInfo(currentArticle.title);

    function getScore(candArticle: LibraryArticle): number {
      const candSeries = parseSeriesInfo(candArticle.title);
      const same = isSameSeries(currSeries, candSeries);

      if (same) {
        if (currSeries.hasVolume && candSeries.hasVolume && currSeries.volume !== null && candSeries.volume !== null) {
          if (candSeries.volume > currSeries.volume) {
            // Next immediate volume gets highest priority
            return 10000000 - (candSeries.volume - currSeries.volume) * 1000;
          } else if (candSeries.volume < currSeries.volume) {
            // Earlier volumes get second priority, closer to current first
            return 5000000 + candSeries.volume * 100;
          } else {
            return 4000000;
          }
        } else {
          return 3000000 + (candSeries.volume ?? 0);
        }
      }

      // Non-series fallback: preserve exact same category + view count + featured ranking
      let baseScore = 0;
      if (candArticle.category === currentArticle.category) {
        baseScore += 100000;
      }
      if (candArticle.featured) {
        baseScore += 5000;
      }
      baseScore += viewCount(candArticle);
      return baseScore;
    }

    return [...items]
      .sort((left, right) => getScore(right) - getScore(left))
      .slice(0, 5)
      .map((article) => ({
        article,
        badge: getBadgeLabel(currSeries, parseSeriesInfo(article.title))
      }));
  }

  const candidates = $derived(articles.filter((article) => article.id !== currentArticle.id));
  const sameCategory = $derived(candidates.filter((article) => article.category === currentArticle.category));
  const related = $derived(rank(candidates));
  const heading = $derived(
    localeStore.current === 'en'
      ? (sameCategory.length ? `Most Viewed — ${getLocalizedCategory(currentArticle.category)}` : 'Most Viewed Articles')
      : (sameCategory.length ? `Bài viết xem nhiều — ${currentArticle.category}` : 'Bài viết được xem nhiều')
  );
</script>

{#if related.length}
  <section class="most-viewed" aria-labelledby="most-viewed-title">
    <div class="most-viewed__header">
      <span class="most-viewed__icon" aria-hidden="true">{categoryIcon(currentArticle.category)}</span>
      <h2 id="most-viewed-title">{heading}</h2>
    </div>
    <div class="most-viewed__list">
      {#each related as { article, badge }, index (article.id)}
        {@const localizedArt = getLocalizedArticle(article, localeStore.current) ?? article}
        <button class:top-rank={index < 2} class="most-viewed__item" type="button" onclick={() => onOpen(article)}>
          <span class="most-viewed__rank" aria-hidden="true">{index + 1}</span>
          <span class="most-viewed__body">
            <strong class="most-viewed__title">
              <span>{localizedArt.title}</span>
              {#if badge}<span class="most-viewed__badge">{getLocalizedBadge(badge)}</span>{/if}
            </strong>
            <span class="most-viewed__meta">
              {#if viewCount(article)}<span>👁 {viewCount(article)} {localeStore.current === 'en' ? 'views' : ''}</span>{/if}
              {#if formatVietnamDateWithWeekday(article.publishedAt, localeStore.current)}<time datetime={article.publishedAt}>{formatVietnamDateWithWeekday(article.publishedAt, localeStore.current)}</time>{/if}
            </span>
          </span>
          <svg class="most-viewed__arrow" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .most-viewed{margin-top:32px;padding-top:24px;border-top:2px solid var(--border2);font-family:var(--font-app)}.most-viewed__header{display:flex;align-items:center;gap:8px;margin-bottom:16px;color:var(--muted);font-size:var(--font-size-label);font-weight:700;letter-spacing:1px;text-transform:uppercase}.most-viewed__header h2{margin:0;font:inherit}.most-viewed__icon{font-size:15px}.most-viewed__list{display:flex;flex-direction:column;gap:10px}.most-viewed__item{display:flex;width:100%;min-height:68px;overflow:hidden;align-items:stretch;gap:0;padding:0;border:1.5px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--text);cursor:pointer;font:inherit;text-align:left;transition:border-color .15s,box-shadow .15s,transform .15s}.most-viewed__item:hover{border-color:var(--gold);box-shadow:0 4px 14px rgba(76,48,24,.09);transform:translateY(-1px)}.most-viewed__item:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}.most-viewed__rank{display:flex;width:36px;flex:0 0 36px;align-items:center;justify-content:center;background:var(--gold-muted);color:var(--brown);font-size:14px;font-weight:800}.most-viewed__item.top-rank .most-viewed__rank{background:var(--gold);color:#fff}.most-viewed__body{display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;padding:11px 12px}.most-viewed__body strong{display:-webkit-box;overflow:hidden;color:var(--text);font-size:var(--font-size-card-title);font-weight:600;line-clamp:2;line-height:1.45;text-transform:uppercase;-webkit-box-orient:vertical;-webkit-line-clamp:2}.most-viewed__badge{display:inline-flex;align-items:center;padding:1px 7px;border-radius:4px;background:var(--gold-muted, rgba(200,150,62,.15));color:var(--brown,#8c581e);font-size:var(--font-size-meta);font-weight:700;letter-spacing:.3px;margin-left:6px;vertical-align:middle;text-transform:none}.most-viewed__meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:5px;color:var(--muted);font-size:var(--font-size-meta)}.most-viewed__arrow{align-self:center;flex:0 0 auto;margin-right:12px;color:var(--muted);opacity:.45;transition:color .15s,opacity .15s,transform .15s}.most-viewed__item:hover .most-viewed__arrow{color:var(--gold);opacity:1;transform:translateX(2px)}
  @media(max-width:768px){.most-viewed__rank{width:38px;flex-basis:38px;font-size:15px}.most-viewed__body strong{font-size:var(--font-size-card-title)}.most-viewed__meta{font-size:var(--font-size-meta)}}
  @media(prefers-reduced-motion:reduce){.most-viewed__item,.most-viewed__arrow{transition:none}.most-viewed__item:hover,.most-viewed__item:hover .most-viewed__arrow{transform:none}}
</style>
