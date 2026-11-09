<script lang="ts">
  import type { ArticleCategory, LibraryArticle } from './article';
  import { LIBRARY_SECTIONS } from './article';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  interface Props {
    articles: LibraryArticle[];
    active: 'all' | ArticleCategory;
    onSelect?: (value: 'all' | ArticleCategory) => void;
  }

  let { articles, active, onSelect = () => {} }: Props = $props();

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  const getSectionLabel = (key: 'all' | ArticleCategory) => {
    switch (key) {
      case 'all': return t.library.all;
      case 'CHUYỆN NHÂN QUẢ': return t.library.karma;
      case 'SÁCH KHUYẾN THIỆN': return t.library.moral;
      case 'KINH PHẬT': return t.library.sutras;
      case 'CÁC NGHI THỨC': return t.library.rituals;
      case 'KHÁC': return t.library.other;
      default: return key;
    }
  };

  const count = (key: 'all' | ArticleCategory) => key === 'all'
    ? articles.length
    : articles.filter((article) => article.category === key).length;
</script>

<nav class="section-nav" aria-label="Danh mục bài viết">
  <div class="section-nav-inner">
    {#each LIBRARY_SECTIONS.filter((section) => section.key === 'all' || count(section.key) > 0) as section}
      <button
        class:active={section.key === active}
        class="sec-tab"
        type="button"
        aria-pressed={section.key === active}
        onclick={() => onSelect(section.key)}
      >
        {section.icon} {getSectionLabel(section.key)} <span class="tab-count">{count(section.key)}</span>
      </button>
    {/each}
  </div>
</nav>
