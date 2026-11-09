<script lang="ts">
  import { uiScrollBehavior } from '$lib/browser/ui-motion';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { getGuideNavigationCopy } from '$lib/i18n/guide-navigation';
  import { onMount, tick } from 'svelte';
  import GuideInstallSection from '$lib/components/guide/GuideInstallSection.svelte';
  import GuideSection from '$lib/components/guide/GuideSection.svelte';
  import GuideConfirmModal from '$lib/components/guide/GuideConfirmModal.svelte';
  import { isNativeApp } from '$lib/browser/native-platform';
  import {
    createGuideSearchTargets,
    guideJumpLinks,
    searchGuideTargets,
    selectGuideSections,
    softwareGuideSections,
    type GuideSearchTarget,
  } from '$lib/content/guide-content';
  import { doctrinalGuideSections } from '$lib/content/guide-doctrinal-content';
  import {
    enSoftwareGuideSections,
    enDoctrinalGuideSections,
    enGuideJumpLinks,
  } from '$lib/content/guide-content.en';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import '$lib/styles/global.css';
  import '$lib/styles/guide-page.css';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const t = $derived(localeStore.t.guidePage);
  const navigationCopy = $derived(getGuideNavigationCopy(isEn));
  const guidePart = $derived(page.url.searchParams.get('phan'));
  const isStudy = $derived(guidePart === 'tu-hoc');
  const isAppGuide = $derived(guidePart === 'ung-dung');
  const guideTitle = $derived(isStudy ? navigationCopy.studyTitle : isAppGuide ? navigationCopy.appTitle : t.heroTitle);

  const inApp = $derived(browser && isNativeApp());

  const currentSoftwareSections = $derived(isEn ? enSoftwareGuideSections : softwareGuideSections);
  const currentDoctrinalSections = $derived(isEn ? enDoctrinalGuideSections : doctrinalGuideSections);
  const currentJumpLinks = $derived(isEn ? enGuideJumpLinks : guideJumpLinks);

  const combinedGuideSections = $derived(
    inApp
      ? [
          ...currentSoftwareSections.map((s) =>
            s.id === 'dung-web'
              ? {
                  ...s,
                  title: isEn ? 'Using the Mobile App' : 'Hướng dẫn sử dụng Ứng Dụng',
                  shortTitle: isEn ? 'Using App' : 'Dùng App',
                }
              : s
          ),
          ...currentDoctrinalSections,
        ]
      : [...currentSoftwareSections, ...currentDoctrinalSections]
  );

  const effectiveGuideSections = $derived(selectGuideSections(combinedGuideSections, currentSoftwareSections.map(section => section.id), guidePart));

  const combinedJumpLinks = $derived(
    inApp
      ? currentJumpLinks
          .filter((l) => l.id !== 'cai-app')
          .map((l) => (l.id === 'dung-web' ? { ...l, label: isEn ? 'Using App' : 'Dùng App' } : l))
      : currentJumpLinks
  );

  const effectiveJumpLinks = $derived(combinedJumpLinks.filter(link =>
    (!isStudy && link.id === 'cai-app') || effectiveGuideSections.some(section => section.id === link.id)
  ));
  const searchTargets = $derived(createGuideSearchTargets(effectiveGuideSections).filter(target => target.id !== 'cai-app' || (!isStudy && !inApp)));
  let query = $state('');
  let openSectionIds = $state<Set<string>>(new Set(['dung-web', 'cai-app']));
  let openFaqIds = $state(new Set<string>());
  const searchResults = $derived(searchGuideTargets(searchTargets, query));

  function setOpen(set: Set<string>, id: string, open: boolean): Set<string> {
    const next = new Set(set);
    if (open) next.add(id);
    else next.delete(id);
    return next;
  }

  function setSectionOpen(id: string, open: boolean): void {
    openSectionIds = setOpen(openSectionIds, id, open);
  }

  function setFaqOpen(id: string, open: boolean): void {
    openFaqIds = setOpen(openFaqIds, id, open);
  }

  async function navigateToTarget(target: GuideSearchTarget, updateHash = true): Promise<void> {
    openSectionIds = setOpen(openSectionIds, target.sectionId, true);
    if (target.kind === 'faq') openFaqIds = setOpen(openFaqIds, target.id, true);
    if (updateHash && browser) {
      window.history.replaceState(window.history.state, '', `#${target.id}`);
    }
    query = '';
    await tick();
    const element = document.getElementById(target.id);
    if (!element) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduceMotion ? 'auto' : uiScrollBehavior(), block: 'start' });
    const focusTarget = target.kind === 'topic' ? element : element.querySelector<HTMLElement>('summary');
    focusTarget?.focus({ preventScroll: true });
  }

  function targetForId(id: string): GuideSearchTarget | undefined {
    return searchTargets.find((target) => target.id === id);
  }

  onMount(() => {
    if (isNativeApp()) {
      openSectionIds = new Set(['dung-web']);
    }
    const openHash = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.replace(/^#/u, ''));
      } catch {
        return;
      }
      const target = targetForId(id);
      if (target) void navigateToTarget(target, false);
    };
    openHash();
    window.addEventListener('hashchange', openHash);
    return () => window.removeEventListener('hashchange', openHash);
  });
</script>

<svelte:head>
  <title>{isStudy || isAppGuide ? guideTitle : t.pageTitle}</title>
  <meta name="description" content={t.metaDescription} />
  <meta name="robots" content="index, follow" />
</svelte:head>

<main class="guide-page">
  <div class="guide-top-nav">
    <button
      type="button"
      class="guide-back-btn"
      onclick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back();
        } else {
          void goto('/ca-nhan');
        }
      }}
      aria-label="Quay lại"
    >
      <span aria-hidden="true">←</span>
      <span>{isEn ? 'Back' : 'Quay lại'}</span>
    </button>
  </div>

  <header class="guide-hero">
    <div class="guide-hero__badge" aria-hidden="true">
      <span>☸</span> {isEn ? 'Practice Handbook & Guides' : 'Cẩm Nang Tu Học & Hướng Dẫn'}
    </div>
    <div class="guide-hero__icon-wrap" aria-hidden="true">
      <span class="guide-hero__icon">🙏</span>
    </div>
    <h1>{guideTitle}</h1>
    <p>{isStudy ? navigationCopy.studyDescription : isAppGuide ? navigationCopy.appDescription : inApp ? t.heroSubtitleApp : t.heroSubtitleWeb}</p>
  </header>

  <!-- aria-label="Mục lục nhanh" -->
  <nav class="guide-jump-bar" aria-label={t.tocAria}>
    <div class="guide-jump-bar__scroller">
      {#each effectiveJumpLinks as link}
        <a
          href={`#${link.id}`}
          onclick={(event) => {
            event.preventDefault();
            const target = targetForId(link.id);
            if (target) void navigateToTarget(target);
          }}
        >
          <span class="guide-jump-badge" aria-hidden="true">{link.icon}</span>
          <span class="guide-jump-label">{link.label}</span>
        </a>
      {/each}
    </div>
  </nav>

  <section class="guide-search" aria-labelledby="guide-search-title">
    <div class="guide-search__heading">
      <div>
        <span class="guide-search__icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <h2 id="guide-search-title">{t.searchTitle}</h2>
      </div>
      <span class="guide-search__hint">{t.searchHint}</span>
    </div>
    <label for="guide-search-input" class="sr-only">{t.searchPlaceholder}</label>
    <input
      id="guide-search-input"
      type="search"
      placeholder={t.searchPlaceholder}
      autocomplete="off"
      bind:value={query}
      aria-controls="guide-search-results"
      onkeydown={(event) => {
        if (event.key === 'Escape') query = '';
      }}
    />
    {#if query.trim()}
      <div class="guide-search__results" id="guide-search-results">
        <p class="guide-search__count" role="status">
          {searchResults.length ? t.searchResultsCount.replace('{count}', String(searchResults.length)) : t.searchNoResults}
        </p>
        {#if searchResults.length}
          <ul>
            {#each searchResults as result}
              <li>
                <button type="button" onclick={() => navigateToTarget(result)}>
                  <span>{result.title}</span><small>{result.context}</small>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <div class="guide-sections">
    {#if !inApp && !isStudy}
      <GuideInstallSection
        open={openSectionIds.has('cai-app')}
        onToggle={(open) => setSectionOpen('cai-app', open)}
      />
    {/if}
    {#each effectiveGuideSections as section}
      <GuideSection
        {section}
        open={openSectionIds.has(section.id)}
        {openFaqIds}
        onToggle={setSectionOpen}
        onFaqToggle={setFaqOpen}
      />
    {/each}
  </div>

  <p class="guide-closing">{t.closingQuote}</p>

  <GuideConfirmModal />
</main>
