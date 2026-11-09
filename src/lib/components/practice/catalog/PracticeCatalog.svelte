<script lang="ts">
  import { ArrowRight, HeartHandshake } from '@lucide/svelte';
  import PracticeEntryArtwork from '$lib/components/guide/PracticeEntryArtwork.svelte';
  import { getPracticeEntryCopy } from '$lib/i18n/practice-entry-cards';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { createInterfaceTranslator as createCopyingTranslator } from '$lib/i18n/copying-interface';
  const localizeCopying = createCopyingTranslator();

  import { getPreceptPracticeCopy } from '$lib/i18n/precept-practice-ui';
  import ActiveObservanceBanner from './ActiveObservanceBanner.svelte';
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';
  import type { Snippet } from 'svelte';
  import PracticeArtwork from '../PracticeArtwork.svelte';
  import {
    getSutraPriorityRank,
    isChuLangNghiem,
    isChuDaiBi,
    type PracticeArticleSummary,
    type PracticeCategory
  } from '$lib/domain/practice/state';
  import ThapTraiBanner from '$lib/components/lunar/ThapTraiBanner.svelte';
  import FixedPracticeGuideBanners from '$lib/components/guide/FixedPracticeGuideBanners.svelte';
  import { parsePositionedImage } from '$lib/domain/positioned-image';
  import { normalizeCoverSrc } from '$lib/domain/cover-url';
  import { sessionCover } from '$lib/browser/session-cover';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import PracticeCatalogSkeleton from './PracticeCatalogSkeleton.svelte';
  import { NAME_COPYING_COPY } from '$lib/domain/practice/name-copying-copy';

  const localeStore = getLocaleContext();
  const localizeUi = createInterfaceTranslator();
  const t = $derived(localeStore.t);
  const isEn = $derived(localeStore.current === 'en');
  const entryCopy = $derived(getPracticeEntryCopy(isEn));
  const preceptCopy = $derived(getPreceptPracticeCopy(isEn));

  export type PracticeSection = 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC';

  interface Props {
    activeCategory?: PracticeCategory;
    currentSection?: PracticeSection | null;
    articles: PracticeArticleSummary[];
    loadError: string | null;
    loading?: boolean;
    onCategoryChange?: (value: PracticeCategory) => void;
    onSelectSection?: (section: PracticeSection | null) => void;
    onCreateArticle?: (category: PracticeSection) => void;
    onOpen: (article: PracticeArticleSummary) => void;
    canManage?: boolean;
    canDelete?: boolean;
    onEdit?: (article: PracticeArticleSummary) => void;
    onDelete?: (article: PracticeArticleSummary) => void;
    onQueryChange: (value: string) => void;
    onMeditationOpen: () => void;
    onRosaryOpen: () => void;
    onLePhatOpen?: () => void;
    onThanhTinhOpen?: () => void;
    onPreceptsOpen?: () => void;
    onEightPreceptsOpen?: () => void;
    onReflectionOpen?: () => void;
    query: string;
    guidePrompt?: Snippet;
    dharmaGivingPrompt?: Snippet;
    continueReading?: Snippet;
    recommendations?: Snippet;
    tracker?: Snippet;
  }

  let {
    activeCategory = 'all',
    currentSection = null,
    articles,
    loadError,
    loading = false,
    onCategoryChange = () => {},
    onSelectSection = () => {},
    onCreateArticle = () => {},
    onOpen,
    canManage = false,
    canDelete = false,
    onEdit = () => {},
    onDelete = () => {},
    onQueryChange,
    onMeditationOpen,
    onRosaryOpen,
    onLePhatOpen = () => {},
    onThanhTinhOpen = () => {},
    onPreceptsOpen = () => {},
    onEightPreceptsOpen = () => {},
    onReflectionOpen,
    query,
    guidePrompt,
    dharmaGivingPrompt,
    continueReading,
    recommendations,
    tracker
  }: Props = $props();

  const sectionConfigs = $derived<Record<PracticeSection, {
    title: string;
    badge: string;
    icon: string;
    desc: string;
    searchPlaceholder: string;
    addBtnLabel: string;
    emptyText: string;
  }>>({
    'KINH PHẬT': {
      title: t.practice.sectionSutrasTitle,
      badge: t.practice.sectionSutrasBadge,
      icon: '📖',
      desc: t.practice.sectionSutrasDesc,
      searchPlaceholder: t.practice.sectionSutrasPlaceholder,
      addBtnLabel: t.practice.sectionSutrasAdd,
      emptyText: t.practice.sectionSutrasEmpty
    },
    'TRÌ CHÚ': {
      title: t.practice.sectionMantrasTitle,
      badge: t.practice.sectionMantrasBadge,
      icon: '🪔',
      desc: t.practice.sectionMantrasDesc,
      searchPlaceholder: t.practice.sectionMantrasPlaceholder,
      addBtnLabel: t.practice.sectionMantrasAdd,
      emptyText: t.practice.sectionMantrasEmpty
    },
    'NGHI THỨC KHÁC': {
      title: t.practice.sectionRitualsTitle,
      badge: t.practice.sectionRitualsBadge,
      icon: '🕯️',
      desc: t.practice.sectionRitualsDesc,
      searchPlaceholder: t.practice.sectionRitualsPlaceholder,
      addBtnLabel: t.practice.sectionRitualsAdd,
      emptyText: t.practice.sectionRitualsEmpty
    }
  });

  const activeConfig = $derived(currentSection ? sectionConfigs[currentSection] : null);

  const currentSectionArticles = $derived.by(() => {
    if (!currentSection) return articles;
    return articles.filter((a) => {
      if (currentSection === 'KINH PHẬT') return a.category === 'KINH PHẬT';
      if (currentSection === 'TRÌ CHÚ') return a.category === 'TRÌ CHÚ';
      return a.category === 'NGHI THỨC KHÁC' || (a.category as string) === 'CÁC NGHI THỨC';
    });
  });

  function handleSectionClick(section: PracticeSection) {
    onCategoryChange(section);
    onSelectSection(section);
  }

</script>

<section class="tt-catalog">
  <ActiveObservanceBanner onOpen={onEightPreceptsOpen} />
  {#snippet renderArticleGrid(items: PracticeArticleSummary[])}
    {#if loadError}
      <p class="tt-state tt-state--error" role="alert">{loadError}</p>
    {:else if loading}
      <p class="tt-sr-only" role="status">{localizeUi("Đang tải danh mục tu tập…")}</p>
      <PracticeCatalogSkeleton />
    {:else if items.length === 0}
      <div class="tt-state">
        <p>{currentSection ? activeConfig?.emptyText : localizeUi("Không tìm thấy bài tu tập phù hợp.")}</p>
        {#if query}
          <button class="tt-state-reset" type="button" onclick={() => onQueryChange('')}>{localizeUi("Xóa từ khóa tìm kiếm")}</button>
        {/if}
      </div>
    {:else}
      <div class="tt-grid">
        {#each items as article (article.id)}
          {@const cover = parsePositionedImage(normalizeCoverSrc(article.imageUrl))}
          {@const sutraRank = getSutraPriorityRank(article)}
          {@const isLangNghiem = isChuLangNghiem(article)}
          {@const isDaiBi = isChuDaiBi(article)}
          <div
            class="tt-card"
            class:tt-card--highlighted={sutraRank <= 4 || isLangNghiem || isDaiBi}
            role="button"
            tabindex="0"
            onclick={(event) => {
              if ((event.target as HTMLElement).closest('.tt-card-edit,.tt-card-delete')) return;
              onOpen(article);
            }}
            onkeydown={(event) => {
              if ((event.target as HTMLElement).closest('.tt-card-edit,.tt-card-delete')) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen(article);
              }
            }}
          >
            {#if canManage}<button class="tt-card-edit" type="button" aria-label={localizeUi("Sửa {0}", article.title)} onclick={(event) => { event.stopPropagation(); onEdit(article); }}>{localizeUi("✏️ Sửa")}</button>{/if}
            {#if canDelete}<button class="tt-card-delete" type="button" aria-label={localizeUi("Xóa {0}", article.title)} onclick={(event) => { event.stopPropagation(); onDelete(article); }}>{localizeUi("🗑")}</button>{/if}

            <!-- HUY HIỆU NỔI BẬT THEO THỨ TỰ ƯU TIÊN -->
            {#if sutraRank === 1}
              <div class="tt-ribbon tt-ribbon--diatang" title={localizeUi("Kinh Địa Tạng — Đệ nhất hiếu kinh")}>{localizeUi("⭐ Địa Tạng #1")}</div>
            {:else if sutraRank === 2}
              <div class="tt-ribbon tt-ribbon--kimcang" title={localizeUi("Kinh Kim Cang — Bát Nhã Ba La Mật")}>⭐ Kim Cang #2</div>
            {:else if sutraRank === 3}
              <div class="tt-ribbon tt-ribbon--phaphoa" title={localizeUi("Kinh Diệu Pháp Liên Hoa — Vua trong các kinh")}>{localizeUi("⭐ Pháp Hoa #3")}</div>
            {:else if sutraRank === 4}
              <div class="tt-ribbon tt-ribbon--langnghiem" title={localizeUi("Kinh Lăng Nghiêm — Khai ngộ tri kiến")}>{localizeUi("⭐ Lăng Nghiêm #4")}</div>
            {:else if article.category === 'TRÌ CHÚ' && isLangNghiem}
              <div class="tt-ribbon tt-ribbon--chu" title={localizeUi("Chú Lăng Nghiêm — Đại Định Như Lai")}>{localizeUi("✨ Chú Lăng Nghiêm")}</div>
            {:else if article.category === 'TRÌ CHÚ' && isDaiBi}
              <div class="tt-ribbon tt-ribbon--chu" title={localizeUi("Chú Đại Bi — Quảng Đại Viên Mãn")}>{localizeUi("✨ Chú Đại Bi")}</div>
            {/if}

            {#if cover.src}
              <img
                class="tt-card-img"
                use:sessionCover={cover.src}
                style:object-position={cover.position}
                alt=""
                loading="lazy"
                onerror={(event) => {
                  const image = event.currentTarget as HTMLImageElement;
                  image.style.display = 'none';
                  const placeholder = image.nextElementSibling as HTMLElement | null;
                  if (placeholder) placeholder.style.display = 'flex';
                }}
              />
              <div class="tt-card-img-placeholder tt-card-img-placeholder--fallback">
                {article.category === 'KINH PHẬT' ? '📖' : (article.category === 'TRÌ CHÚ' ? '🪔' : '🕯️')}
              </div>
            {:else}
              <div class="tt-card-img-placeholder">
                {article.category === 'KINH PHẬT' ? '📖' : (article.category === 'TRÌ CHÚ' ? '🪔' : '🕯️')}
              </div>
            {/if}

            <div class="tt-card-body">
              <span class="tt-card-cat">{article.category}</span>
              <h3 class="tt-card-title">{article.title}</h3>
              <div class="tt-card-footer">
                <span class="tt-card-date">{article.hasTableOfContents ? localizeUi("Nhiều phẩm") : localizeUi("Toàn văn")}</span>
                <span class="tt-card-cta">{localizeUi("Vào tụng →")}</span>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/snippet}

  {#if currentSection === null}
    <!-- ==================== MÀN HÌNH CHÍNH (HUB TU TẬP) ==================== -->

    <div class="tt-hero">
      <div class="tt-hero-icon">🙏</div>
      <h1 class="tt-hero-title">{localizeUi("Chế Độ Tu Tập")}</h1>
      <p class="tt-hero-sub">{localizeUi("Hành trì hằng ngày — tĩnh lặng thân tâm, tinh tấn công phu với các pháp môn thanh tịnh")}</p>
    </div>

    <div class="tt-entry-cards">
    <div class="tt-beginner-guide-wrap tt-entry--newbie">
      <a class="tt-beginner-guide" href="/huong-dan#huong-dan-nguoi-moi">
        <div class="tt-beginner-icon-box" aria-hidden="true"><PracticeEntryArtwork name="beginner" /></div>
        <div class="tt-beginner-content">
          <strong>{entryCopy.beginner}</strong>
        </div>
        <span class="tt-banner-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
      </a>
    </div>


    <!-- BANNER HƯỚNG DẪN BỐ THÍ PHÁP ĐỘ VONG LINH -->
    {#if dharmaGivingPrompt}
      {@render dharmaGivingPrompt()}
    {/if}

    <div class="tt-beginner-guide-wrap tt-entry--study">
      <a class="tt-beginner-guide" href="/huong-dan?phan=tu-hoc">
        <div class="tt-beginner-icon-box" aria-hidden="true"><PracticeEntryArtwork name="study" /></div>
        <div class="tt-beginner-content">
          <strong>{entryCopy.study}</strong>
        </div>
        <span class="tt-banner-arrow" aria-hidden="true"><ArrowRight size={20} /></span>
      </a>
    </div>


    <div class="tt-event-banner"><ThapTraiBanner alwaysShow={true} compact={true} /></div>
    </div>

    <!-- ĐỒNG HÀNH TU TẬP (GRID 3 KHỐI + TIẾP TỤC CÔNG PHU) -->
    <div class="tt-hub-section tt-hub-section--companion">
      <div class="tt-hub-header">
        <h2 class="tt-hub-title">{localizeUi("Đồng Hành Tu Tập")}</h2>
        <p class="tt-hub-desc">{localizeUi("Thời khóa · Công phu · Tinh tấn cộng đồng")}</p>
      </div>
      <div class="tt-modes-grid" role="navigation" aria-label={localizeUi("Đồng hành tu tập")}>
        {#if continueReading}
          {@render continueReading()}
        {/if}
        {#if recommendations}
          {@render recommendations()}
        {/if}
        {#if tracker}
          {@render tracker()}
        {/if}
        {#if onReflectionOpen}
          <button type="button" class="tt-mode-card tt-mode-card--reflection tt-mode-card--copying" aria-label={entryCopy.reflection} onclick={onReflectionOpen}>
            <div class="tt-mode-icon-wrap" aria-hidden="true"><span class="reflection-entry-icon"><HeartHandshake size={32} strokeWidth={1.8} /></span></div>
            <div class="tt-mode-body"><span class="tt-mode-title">{entryCopy.reflection}</span><span class="tt-mode-desc">{entryCopy.reflectionDescription}</span></div>
            <span class="tt-mode-arrow" aria-hidden="true">→</span>
          </button>
        {/if}
        <a
          href="/tien-do-tu-tap#practice-campaigns-title"
          class="tt-mode-card tt-mode-card--community"
          style="text-decoration: none;"
        >
          <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="personal" size={48} /></div>
          <div class="tt-mode-body">
            <span class="tt-mode-title">{localizeUi("Tham gia cộng đồng")}</span>
            <span class="tt-mode-desc">{localizeUi("Cùng tinh tấn với các mục tiêu chung")}</span>
          </div>
          <span class="tt-mode-arrow" aria-hidden="true">→</span>
        </a>
      </div>
    </div>

    <!-- CÁC CHẾ ĐỘ HÀNH TRÌ CÙNG CẤP (4 NHÓM CHUYÊN BIỆT) -->
    <div class="tt-hub-section">
      <div class="tt-hub-header">
        <h2 class="tt-hub-title">{localizeUi("Chế Độ Hành Trì")}</h2>
        <p class="tt-hub-desc">{localizeUi("Chọn pháp môn bạn muốn thực hành hôm nay")}</p>
      </div>

      <div class="tt-practice-groups" role="navigation" aria-label={localizeUi("Các chế độ hành trì")}>
        <!-- Nhóm 1: Công phu thường nhật -->
        <div class="tt-group-block">
          <div class="tt-group-header">
            <h3 class="tt-group-title">{localizeUi("Công phu thường nhật")}</h3>
          </div>
          <div class="tt-modes-grid tt-modes-grid--3">
            <!-- 1. Thiền định -->
            <button type="button" class="tt-mode-card tt-mode-card--thien" onclick={onMeditationOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="meditation" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Thiền định")}</span>
                <span class="tt-mode-desc">{localizeUi("Hẹn giờ chuông tĩnh tâm, quán niệm hơi thở")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- 2. Lần tràng hạt -->
            <button type="button" class="tt-mode-card tt-mode-card--chuoi" onclick={onRosaryOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="rosary" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Lần tràng hạt")}</span>
                <span class="tt-mode-desc">{localizeUi("Chuỗi hạt niệm Phật & trì niệm có âm thanh")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- 3. Lễ Phật & Sám Hối -->
            <button type="button" class="tt-mode-card tt-mode-card--le-phat" onclick={onLePhatOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="bowing" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Lễ Phật & Sám Hối")}</span>
                <span class="tt-mode-desc">{localizeUi("Chiêm bái tôn tượng chư Phật, đếm lạy trang nghiêm")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <!-- Nhóm 2: Biên chép công đức -->
        <div class="tt-group-block">
          <div class="tt-group-header">
            <h3 class="tt-group-title">{localizeUi("Biên chép công đức")}</h3>
          </div>
          <div class="tt-modes-grid tt-modes-grid--2">
            <!-- Chép kinh -->
            <a href="/tu-tap/chep-kinh" class="tt-mode-card tt-mode-card--copying" style="text-decoration: none;">
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="scripture-copying" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Chép kinh")}</span>
                <span class="tt-mode-desc">{localizeUi("Tự tay chép lời kinh, rà soát và lưu bản chép")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </a>

            <!-- Chép danh hiệu -->
            <a href="/tu-tap/chep-danh-hieu" class="tt-mode-card tt-mode-card--name-copying" style="text-decoration: none;">
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="name-copying" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeCopying(NAME_COPYING_COPY.title)}</span>
                <span class="tt-mode-desc">{localizeCopying(NAME_COPYING_COPY.description)}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        <!-- Nhóm 3: Thanh tịnh & Giới luật -->
        <div class="tt-group-block">
          <div class="tt-group-header">
            <h3 class="tt-group-title">{localizeUi("Thanh tịnh & Giới luật")}</h3>
          </div>
          <div class="tt-modes-grid tt-modes-grid--3">
            <!-- Giữ giới thanh tịnh -->
            <button type="button" class="tt-mode-card tt-mode-card--precepts" onclick={onPreceptsOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="precepts" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{preceptCopy.featureTitle}</span>
                <span class="tt-mode-desc">{preceptCopy.dailyIntro}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- Thọ Bát quan trai giới -->
            <button type="button" class="tt-mode-card tt-mode-card--precepts tt-mode-card--eight-precepts" onclick={onEightPreceptsOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="eight-precepts" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{preceptCopy.tabEight}</span>
                <span class="tt-mode-desc">{preceptCopy.eightDescription}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- Tiết dục bảo thân -->
            <!-- Giữ nguyên owner và lịch sử của công cụ tiết dục. -->
            <button type="button" class="tt-mode-card tt-mode-card--thanh-tinh" onclick={onThanhTinhOpen}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="abstinence" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{preceptCopy.abstinenceTitle}</span>
                <span class="tt-mode-desc">{preceptCopy.abstinenceDescription}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <!-- Nhóm 4: Kho kinh điển & Nghi thức -->
        <div class="tt-group-block">
          <div class="tt-group-header">
            <h3 class="tt-group-title">{localizeUi("Kho kinh điển & Nghi thức")}</h3>
          </div>
          <div class="tt-modes-grid tt-modes-grid--3">
            <!-- 4. Tụng, đọc kinh -->
            <button type="button" class="tt-mode-card tt-mode-card--kinh" onclick={() => handleSectionClick('KINH PHẬT')}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="recitation" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Tụng, đọc kinh")}</span>
                <span class="tt-mode-desc">{localizeUi("Kinh Địa Tạng, Kim Cang, Pháp Hoa, Lăng Nghiêm…")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- 5. Trì chú -->
            <button type="button" class="tt-mode-card tt-mode-card--tri-chu" onclick={() => handleSectionClick('TRÌ CHÚ')}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="chanting" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Trì chú")}</span>
                <span class="tt-mode-desc">{localizeUi("Chú Lăng Nghiêm, Chú Đại Bi, các chân ngôn…")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>

            <!-- 6. Nghi thức khác -->
            <button type="button" class="tt-mode-card tt-mode-card--nghi-thuc" onclick={() => handleSectionClick('NGHI THỨC KHÁC')}>
              <div class="tt-mode-icon-wrap" aria-hidden="true"><AppArtwork name="ritual" size={48} /></div>
              <div class="tt-mode-body">
                <span class="tt-mode-title">{localizeUi("Nghi thức khác")}</span>
                <span class="tt-mode-desc">{localizeUi("Sám hối, phóng sinh, cúng ngọ, phát nguyện…")}</span>
              </div>
              <span class="tt-mode-arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>


    {#if guidePrompt}{@render guidePrompt()}{/if}

  {:else}
    <!-- ==================== GIAO DIỆN CHUYÊN BIỆT (TỤNG ĐỌC KINH & NGHI THỨC) ==================== -->
    <div class="tt-section-view" data-practice-route-back>
      <!-- THANH ĐIỀU HƯỚNG TRÊN CÙNG -->
      {#if canManage}
        <div class="tt-section-topbar">
          <button
            type="button"
            class="tt-create-btn"
            onclick={() => onCreateArticle(activeCategory === 'all' || (activeCategory as string) === 'CÁC NGHI THỨC' ? (currentSection ?? 'KINH PHẬT') : (activeCategory as PracticeSection))}
          >
            <span class="tt-create-plus">+</span>
            <span>{localizeUi("Thêm bài mới")}</span>
          </button>
        </div>
      {/if}

      <!-- TIÊU ĐỀ SECTION -->
      <div class="tt-section-header">
        <h1 class="tt-section-title">
          {#if activeConfig}
            {activeConfig.icon} {activeConfig.title}
          {:else}
            {localizeUi("Kho Kinh Điển & Nghi Thức")}
          {/if}
        </h1>
        <p class="tt-section-desc">
          {#if activeConfig}
            {activeConfig.desc}
          {:else}
            {localizeUi("Đọc tụng kinh Phật, trì chú đà la ni và nghi thức công phu hằng ngày")}
          {/if}
        </p>
      </div>

      <!-- FILTER CONTAINER (CHỈ CÓ TÌM KIẾM) -->
      <div class="tt-filter-container">
        <div class="tt-search-wrap">
          <svg class="tt-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>
          <input
            class="tt-search"
            type="search"
            placeholder={currentSection === 'KINH PHẬT' ? localizeUi("Tìm kiếm kinh Phật…") : currentSection === 'TRÌ CHÚ' ? localizeUi("Tìm kiếm thần chú…") : localizeUi("Tìm kiếm nghi thức…")}
            aria-label={activeConfig?.searchPlaceholder.replace(/^🔍\s*/u, '') ?? localizeUi("Tìm kiếm bài tu tập")}
            value={query}
            oninput={(event) => onQueryChange((event.currentTarget as HTMLInputElement).value)}
          />
          {#if query}
            <button class="tt-search-clear" type="button" aria-label={localizeUi("Xóa tìm kiếm")} onclick={() => onQueryChange('')}>✕</button>
          {/if}
        </div>
      </div>

      {@render renderArticleGrid(articles)}
    </div>
  {/if}
</section>

<style>
  .reflection-entry-icon { display:flex; color:var(--practice-meditation-ink); }
  .tt-entry-cards { display:flex; flex-direction:column; gap:calc(var(--space-page) * .7); }
  .tt-entry--newbie { --entry-tint:var(--gold-muted); }
  .tt-entry--study { --entry-tint:var(--practice-name-copy-card-start); }
  .tt-entry-cards :global(.dharma-giving-banner-wrap) { --entry-tint:var(--practice-scripture-copy-card-end); }
  .tt-entry-cards .tt-event-banner { --entry-tint:var(--practice-meditation-tint); }
  .tt-entry-cards :global(:is(.tt-beginner-guide-wrap,.dharma-giving-banner-wrap,.tt-event-banner)) {
    width:calc(100% - var(--space-page) * 1.6); max-width:968px; margin:0 auto;
  }
  .tt-entry-cards :global(:is(.tt-beginner-guide,.dharma-giving-prompt,.thap-trai-banner)) {
    box-sizing:border-box;
    min-height:calc(var(--space-page) * 4.8);
    margin:0;
    padding:calc(var(--space-page) * .8);
    border:1px solid color-mix(in srgb,var(--card) 80%,var(--entry-tint));
    border-radius:var(--radius-feature);
    background:linear-gradient(135deg,color-mix(in srgb,var(--entry-tint) 45%,var(--card)),color-mix(in srgb,var(--entry-tint) 70%,var(--card)));
    box-shadow:inset 0 1px 0 var(--card),var(--shadow);
    color:var(--text);
    font-family:var(--font-app);
    transition:box-shadow var(--motion-press) var(--ease-standard),transform var(--motion-press) var(--ease-standard);
  }
  .tt-entry-cards :global(.dharma-giving-prompt.permanent) { display:flex; padding:0; }
  .tt-entry-cards :global(.dharma-giving-prompt.permanent .dharma-giving-main-action) {
    display:flex; align-items:center; min-height:calc(var(--space-page) * 4.8 - 2px);
    padding:calc(var(--space-page) * .8); gap:calc(var(--space-page) * .7); border-radius:inherit;
  }
  .tt-entry-cards :global(:is(.tt-beginner-guide,.dharma-giving-left,.banner-main-group,.banner-top-row)) {
    align-items:center; gap:calc(var(--space-page) * .7);
  }
  .tt-entry-cards :global(:is(.tt-beginner-icon-box,.dharma-giving-icon-box,.banner-icon-box)) {
    display:grid; place-items:center; box-sizing:border-box;
    width:calc(var(--space-page) * 2.6); height:calc(var(--space-page) * 2.6); flex:0 0 calc(var(--space-page) * 2.6);
    border-radius:var(--radius-card);
    background:linear-gradient(135deg,color-mix(in srgb,var(--card) 85%,transparent),color-mix(in srgb,var(--card) 40%,transparent));
    border:1px solid color-mix(in srgb,var(--card) 85%,var(--border2));
    box-shadow:inset 0 1px 0 var(--card),var(--shadow);
    color:var(--gold);
  }
  .tt-entry-cards :global(.dharma-giving-icon),
  .tt-entry-cards :global(.banner-icon-box .icon) { display:flex; width:100%; height:100%; }
  .tt-entry-cards :global(:is(.tt-beginner-content strong,.dharma-giving-title,.banner-badge-text)) {
    margin:0; font-family:var(--font-app); font-size:var(--font-size-card-title); font-weight:700;
    line-height:1.4; letter-spacing:normal; color:var(--text); text-wrap:pretty; overflow-wrap:anywhere;
  }
  .tt-entry-cards :global(:is(.tt-banner-arrow,.dharma-giving-compact-arrow,.banner-chevron-btn)) {
    display:grid; place-items:center; box-sizing:border-box;
    flex:0 0 calc(var(--space-page) * 2.2); width:calc(var(--space-page) * 2.2); height:calc(var(--space-page) * 2.2);
    border:1px solid color-mix(in srgb,var(--card) 85%,var(--border2)); border-radius:50%;
    background:color-mix(in srgb,var(--card) 55%,transparent); color:var(--gold);
    box-shadow:inset 0 1px 0 var(--card),var(--shadow); font-size:var(--font-size-body);
  }
  .tt-entry-cards :global(.banner-actions) { flex-direction:row; align-self:center; }
  .tt-entry-cards :global(.dharma-giving-main-action:focus-visible) { outline:3px solid var(--gold); outline-offset:3px; }
  .tt-entry-cards :global(:is(.tt-beginner-guide,.dharma-giving-prompt,.thap-trai-banner):active) {
    transform:translateY(1px); box-shadow:inset 0 1px 0 var(--card);
  }
  @media(hover:hover) {
    .tt-entry-cards :global(:is(.tt-beginner-guide,.dharma-giving-prompt,.thap-trai-banner):hover) { box-shadow:inset 0 1px 0 var(--card),var(--shadow-lg); }
  }
  @media(prefers-reduced-motion:reduce) {
    .tt-entry-cards :global(:is(.tt-beginner-guide,.dharma-giving-prompt,.thap-trai-banner)) { transition:none; transform:none; }
  }
  .tt-beginner-guide-wrap{width:calc(100% - 32px);max-width:968px;margin:0 auto 12px}
  .tt-beginner-guide{display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius-card);background:var(--gold-light);color:var(--text);text-decoration:none;line-height:1.5;box-shadow:0 2px 8px rgba(60,40,10,.03);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
  :global([data-theme="dark"]) .tt-beginner-guide{background:var(--bg2);border-color:var(--border2);color:var(--text)}
  .tt-beginner-icon-box{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border-radius:14px;background:color-mix(in srgb,var(--gold) 14%,transparent);border:1px solid color-mix(in srgb,var(--gold) 28%,transparent);color:var(--gold)}
  :global([data-theme="dark"]) .tt-beginner-icon-box{background:rgba(200,150,62,.15);border-color:rgba(200,150,62,.3);color:var(--gold2)}
  .tt-beginner-content{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .tt-beginner-guide strong{display:block;font-size:var(--font-size-card-title);font-weight:700;margin:2px 0 1px;color:var(--text);line-height:1.35}
  .tt-banner-arrow{display:grid;place-items:center;width:32px;height:32px;flex-shrink:0;border-radius:50%;background:color-mix(in srgb,var(--gold) 15%,transparent);color:var(--gold);font-weight:700;font-size:15px;transition:all .15s ease}
  :global([data-theme="dark"]) .tt-banner-arrow{background:rgba(200,150,62,.15);color:var(--gold2)}
  .tt-beginner-guide:hover{border-color:var(--gold);background:var(--hover);transform:translateY(-2px);box-shadow:var(--shadow)}
  .tt-beginner-guide:hover .tt-banner-arrow{transform:translateX(3px);background:var(--gold);color:#fff}
  .tt-beginner-guide:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
  :global(body){font-family:var(--font-app)!important}
  .tt-catalog{width:100%;margin:0 auto;padding:0}
  .tt-hero{padding:12px 20px 24px;text-align:center}
  .tt-hero-icon{margin-bottom:12px;font-size:52px;line-height:1;filter:drop-shadow(0 2px 8px rgba(200,150,62,.3))}
  .tt-hero-title{margin:0 0 6px;color:var(--brown);font-family:var(--font-app);font-size:var(--font-size-section-title);font-weight:700;text-align:center}
  .tt-hero-sub{max-width:48ch;margin:0 auto;color:var(--text2);font-size:var(--font-size-body);line-height:1.6}
  .tt-event-banner{width:calc(100% - 32px);max-width:968px;margin:0 auto 16px}

  /* HUB PRACTICES SECTION */
  .tt-hub-section{width:calc(100% - 32px);max-width:968px;margin:28px auto 0}
  .tt-hub-section--companion{margin-bottom:28px}
  .tt-hub-header{margin-bottom:16px;text-align:center}
  .tt-hub-title{margin:0 0 4px;font-size:var(--font-size-section-title);font-weight:700;color:var(--text);font-family:var(--font-app);text-align:center}
  .tt-hub-desc{margin:0;font-size:var(--font-size-body);color:var(--muted)}

  /* PRACTICE GROUPS (TÁI CẤU TRÚC 4 CỤM CHUYÊN BIỆT) */
  .tt-practice-groups{display:flex;flex-direction:column;gap:24px}
  .tt-group-block{display:flex;flex-direction:column;gap:12px}
  .tt-group-header{display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 0;text-align:center;width:100%}
  .tt-group-header::before,.tt-group-header::after{content:'';height:1px;flex:1;max-width:54px;background:color-mix(in srgb,var(--gold) 35%,var(--border2))}
  .tt-group-title{margin:0;font-size:var(--font-size-label);font-weight:700;color:var(--brown);text-transform:uppercase;letter-spacing:.08em;font-family:var(--font-app);text-align:center;white-space:nowrap}
  :global([data-theme="dark"]) .tt-group-title{color:var(--gold2)}

  /* PRACTICE MODES GRID */
  .tt-modes-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:0}
  .tt-hub-section--companion .tt-modes-grid{grid-auto-rows:1fr}
  @media(min-width:860px){
    .tt-modes-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
    .tt-modes-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
  }
  @media(min-width:541px) and (max-width:859px){
    .tt-modes-grid--3 > :last-child:nth-child(3){grid-column:span 2}
  }
  @media(max-width:540px){.tt-modes-grid{grid-template-columns:1fr;gap:12px}}

  /* FILTER CONTAINER & TABS */
  .tt-filter-container{display:flex;flex-direction:column;gap:12px;width:calc(100% - 32px);max-width:968px;margin:0 auto 20px}


  :global(.tt-mode-card){position:relative;display:flex;align-items:center;gap:14px;padding:18px 18px;border:none;border-radius:18px;color:#fff;cursor:pointer;font:inherit;text-align:left;box-shadow:0 6px 18px rgba(0,0,0,.1);transition:transform .18s ease,box-shadow .18s ease}
  :global(.tt-mode-card:hover){transform:translateY(-3px);box-shadow:0 10px 24px rgba(0,0,0,.18)}
  :global(.tt-mode-card:active){transform:translateY(-1px)}

  /* MÀU SẮC ĐỒNG BỘ CHO CÁC NÚT HÀNH TRÌ VÀ ĐỒNG HÀNH */
  :global(.tt-mode-card--thien){background:linear-gradient(135deg,#7e6bb2 0%,#513d80 100%);box-shadow:0 6px 18px rgba(100,70,160,.25)}
  :global(.tt-mode-card--chuoi){background:linear-gradient(135deg,#a87342 0%,#7a4e25 100%);box-shadow:0 6px 18px rgba(120,70,30,.25)}
  :global(.tt-mode-card--le-phat){background:linear-gradient(135deg,#d4af37 0%,#aa8214 100%);box-shadow:0 6px 18px rgba(212,175,55,.28);color:#1c1307}
  :global(.tt-mode-card--thanh-tinh){background:linear-gradient(135deg,#0d9488 0%,#115e59 100%);box-shadow:0 6px 18px rgba(13,148,136,.28)}
  :global(.tt-mode-card--kinh){background:linear-gradient(135deg,#a83c2a 0%,#7a2416 100%);box-shadow:0 6px 18px rgba(168,60,42,.26)}
  :global(.tt-mode-card--tri-chu){background:linear-gradient(135deg,#2b6cb0 0%,#1c4b7a 100%);box-shadow:0 6px 18px rgba(43,108,176,.26)}
  :global(.tt-mode-card--nghi-thuc){background:linear-gradient(135deg,#5c5243 0%,#3d3428 100%);box-shadow:0 6px 18px rgba(80,70,55,.26)}
  :global(.tt-mode-card--rec){background:linear-gradient(135deg,#c8963e 0%,#8c5d17 100%);box-shadow:0 6px 18px rgba(200,150,62,.26)}
  :global(.tt-mode-card--tracker){background:linear-gradient(135deg,#4a5568 0%,#2d3748 100%);box-shadow:0 6px 18px rgba(74,85,104,.26)}
  :global(.tt-mode-card--community){background:linear-gradient(135deg,#1b5e20 0%,#0a3a10 100%);box-shadow:0 6px 18px rgba(27,94,32,.26)}

  :global(.tt-mode-icon-wrap){display:grid;width:48px;height:48px;flex-shrink:0;place-items:center;border-radius:14px;background:rgba(255,255,255,.2);font-size:24px;box-shadow:0 2px 8px rgba(0,0,0,.1)}
  :global(.tt-mode-card--le-phat .tt-mode-icon-wrap){background:rgba(0,0,0,.08)}

  :global(.tt-mode-body){flex:1;min-width:0;display:flex;flex-direction:column}
  :global(.tt-mode-title){font-size:var(--font-size-card-title);font-weight:700;line-height:1.25;letter-spacing:.2px}
  :global(.tt-mode-desc){font-size:var(--font-size-body);opacity:.88;margin-top:3px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  :global(.tt-mode-card--le-phat .tt-mode-desc){opacity:.95}

  :global(.tt-mode-arrow){display:grid;width:28px;height:28px;flex-shrink:0;place-items:center;border-radius:50%;background:rgba(255,255,255,.22);font-size:14px;font-weight:700;transition:transform .15s ease}
  :global(.tt-mode-card--le-phat .tt-mode-arrow){background:rgba(0,0,0,.1)}
  :global(.tt-mode-card:hover .tt-mode-arrow){transform:translateX(3px)}

  /* SECTION DETAIL VIEW */
  .tt-section-view{width:100%;margin:0 auto;animation:tt-section-fade-in .2s ease-out}
  @keyframes tt-section-fade-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

  .tt-section-topbar{display:flex;align-items:center;justify-content:flex-end;width:calc(100% - 32px);max-width:968px;margin:16px auto 12px;gap:12px}

  .tt-create-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:none;border-radius:24px;background:var(--gold);color:#fff;font:inherit;font-size:var(--font-size-label);font-weight:700;cursor:pointer;box-shadow:0 3px 10px rgba(200,150,62,.28);transition:all .15s ease}
  .tt-create-btn:hover{background:var(--gold2);transform:translateY(-1px);box-shadow:0 5px 14px rgba(200,150,62,.35)}
  .tt-create-plus{font-size:15px;line-height:1}

  .tt-section-header{padding:16px 20px 20px;text-align:center;max-width:720px;margin:0 auto}
  .tt-section-title{margin:0 0 6px;color:var(--brown);font-family:var(--font-app);font-size:var(--font-size-section-title);font-weight:700;text-align:center}
  .tt-section-desc{margin:0 auto;color:var(--muted);font-size:var(--font-size-body);line-height:1.6;max-width:540px}

  /* SEARCH BAR */
  .tt-search-wrap{position:relative;flex:1;min-width:0;display:flex;align-items:center;color:var(--practice-ink,var(--gold))}
  .tt-search-icon{position:absolute;left:16px;pointer-events:none}
  .tt-search{box-sizing:border-box;width:100%;min-width:0;min-height:52px;padding:14px 56px 14px 46px;border:1.5px solid var(--practice-line,var(--border));border-radius:16px;outline:none;appearance:none;background:var(--practice-tint,var(--card));color:var(--text);font:inherit;font-size:var(--font-size-body);line-height:22px;box-shadow:0 2px 8px rgba(0,0,0,.03);transition:border-color .15s,box-shadow .15s}
  .tt-search::-webkit-search-cancel-button{appearance:none}
  .tt-search:focus{border-color:var(--gold);box-shadow:0 0 0 3px rgba(200,150,62,.18)}
  .tt-search::placeholder{color:var(--text2);opacity:1;font-size:var(--font-size-label)}
  .tt-search-clear{position:absolute;right:5px;display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:12px;background:transparent;color:var(--practice-ink,var(--text2));cursor:pointer;font-size:16px;font-weight:700;line-height:1}
  .tt-search-clear:focus-visible{outline:2px solid var(--practice-start,var(--gold));outline-offset:1px}
  .tt-search-clear:hover{background:var(--gold);color:#fff}

  /* EMPTY / ERROR STATES */
  .tt-state{max-width:600px;margin:30px auto;padding:48px 20px;border:1.5px dashed var(--border2);border-radius:18px;color:var(--muted);text-align:center}
  .tt-state-reset{margin-top:14px;padding:8px 18px;border:0;border-radius:20px;background:var(--gold);color:#fff;cursor:pointer;font:inherit;font-size:var(--font-size-label);font-weight:600}
  .tt-sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  .tt-state--error{color:var(--red)}

  /* GRID AND CARDS */
  .tt-grid{display:grid;width:100%;max-width:1000px;margin:0 auto;padding:0 0 32px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
  .tt-section-view .tt-grid{width:calc(100% - 32px);max-width:968px}
  .tt-card{position:relative;display:flex;overflow:hidden;flex-direction:column;border:1.5px solid var(--border2);border-radius:16px;background:var(--white);color:inherit;cursor:pointer;transition:transform .18s,box-shadow .18s,border-color .18s;animation:practice-card-reveal .2s ease-out backwards}
  :global([data-theme="dark"]) .tt-card{background:var(--bg2)}
  .tt-card:hover{border-color:var(--gold);box-shadow:var(--shadow-lg,0 10px 25px rgba(0,0,0,.08));transform:translateY(-3px)}
  .tt-card--highlighted{border-color:color-mix(in srgb,var(--gold) 50%,var(--border2))}
  .tt-card--highlighted:hover{border-color:var(--gold2)}

  /* RIBBON / BADGES FOR FOUNDATIONAL SUTRAS & MANTRAS */
  .tt-ribbon{position:absolute;top:10px;right:10px;z-index:3;padding:4px 10px;border-radius:12px;font-size:var(--font-size-meta);font-weight:800;letter-spacing:.3px;box-shadow:0 3px 10px rgba(0,0,0,.15);text-transform:uppercase}
  .tt-ribbon--diatang{background:linear-gradient(135deg,#c8963e,#916719);color:#fff}
  .tt-ribbon--kimcang{background:linear-gradient(135deg,#2b7cb5,#1b4f75);color:#fff}
  .tt-ribbon--phaphoa{background:linear-gradient(135deg,#b2537c,#7a274e);color:#fff}
  .tt-ribbon--langnghiem{background:linear-gradient(135deg,#7e6bb2,#513d80);color:#fff}
  .tt-ribbon--chu{background:linear-gradient(135deg,#d4af37,#aa8214);color:#1c1307}

  .tt-card-img,.tt-card-img-placeholder{width:100%;aspect-ratio:16/8;flex-shrink:0}
  .tt-card-img{display:block;object-fit:cover;background:var(--gold-muted)}
  .tt-card-img-placeholder{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,var(--gold-muted) 0%,var(--bg3) 100%);font-size:32px}
  .tt-card-img-placeholder--fallback{display:none}

  .tt-card-body{display:flex;flex:1;flex-direction:column;padding:14px 16px 16px}
  .tt-card-cat{display:inline-flex;align-self:flex-start;margin-bottom:8px;padding:3px 9px;border-radius:10px;background:var(--gold-light);color:var(--gold);font-size:var(--font-size-meta);font-weight:700;letter-spacing:.3px}
  :global([data-theme="dark"]) .tt-card-cat{background:rgba(200,150,62,.15)}
  .tt-card-title{display:-webkit-box;overflow:hidden;flex:1;color:var(--text);font-family:var(--font-app);font-size:var(--font-size-card-title);font-weight:600;line-height:1.5;line-clamp:2;-webkit-box-orient:vertical;-webkit-line-clamp:2}
  .tt-card-footer{display:flex;align-items:center;justify-content:space-between;margin-top:12px}
  .tt-card-date{color:var(--muted);font-size:var(--font-size-meta)}
  .tt-card-cta{display:flex;align-items:center;gap:5px;padding:5px 12px;border:0;border-radius:20px;background:var(--gold);color:#fff;cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:600;transition:background .15s}
  .tt-card-cta:hover{background:var(--gold2)}

  .tt-card-edit,.tt-card-delete{position:absolute;z-index:4;top:10px;min-height:32px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,.94);cursor:pointer;font:inherit;font-size:var(--font-size-label);font-weight:700}
  .tt-card-edit{left:10px;border:1px solid var(--border);color:var(--brown)}
  .tt-card-delete{left:72px;border:1px solid rgba(192,80,80,.3);color:var(--red)}
  .tt-card-edit:hover{border-color:var(--gold);background:var(--gold);color:#fff}
  .tt-card-delete:hover{border-color:var(--red);background:var(--red);color:#fff}
  .tt-card-edit:focus-visible,.tt-card-delete:focus-visible{outline:3px solid var(--gold);outline-offset:2px}

  @keyframes practice-card-reveal{from{opacity:.15}to{opacity:1}}
  .tt-hero-title,.tt-card-title,.tt-section-title,.tt-hub-title{font-family:var(--font-app)}

  @media(max-width:600px){.tt-grid{grid-template-columns:1fr}}
  @media(prefers-reduced-motion:reduce){.tt-card{animation:none}}

  /* Match the app's portrait covers and compact two-column catalog on phones. */
  .tt-card-img,.tt-card-img-placeholder{aspect-ratio:2/3}
  .tt-card-img{object-fit:contain}
  @media(max-width:600px){
    .tt-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .tt-card-body{padding:12px;min-width:0}
    .tt-card-title{font-size:var(--font-size-card-title);line-height:1.5}
    .tt-card-footer{flex-wrap:wrap;gap:8px}
    .tt-card-cta{font-size:var(--font-size-label);padding:5px 9px}
  }
  @media(max-width:359px){
    .tt-grid{grid-template-columns:minmax(0,1fr)}
    .tt-modes-grid{grid-template-columns:minmax(0,1fr)}
    .tt-modes-grid :global(.tt-mode-card){gap:var(--radius-sm);padding:var(--radius-control)}
    .tt-modes-grid :global(.tt-mode-title){overflow-wrap:anywhere}
  }
</style>
