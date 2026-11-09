<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
</script>

<div class="fixed-practice-banners" aria-label={isEn ? 'Practice Guides' : 'Hướng dẫn tu tập'}>
  <!-- 1. BANNER HƯỚNG DẪN CHO NGƯỜI MỚI TÌM HIỂU -->
  <div class="tt-guide-banner-wrap">
    <a
      href="/huong-dan#huong-dan-nguoi-moi"
      class="tt-guide-banner tt-newbie-banner"
      aria-label={isEn ? 'Buddhist practice guide for beginners' : 'Hướng dẫn tu học Phật cho người mới tìm hiểu'}
    >
      <div class="tt-guide-banner__left">
        <div class="tt-guide-banner__icon-box tt-icon-box--green" aria-hidden="true">
          <span class="tt-guide-banner__icon">🌱</span>
        </div>
        <div class="tt-guide-banner__body">
          <div class="tt-guide-banner__tag tt-tag--green">
            <span class="tt-guide-banner__dot" aria-hidden="true"></span>
            <span>{isEn ? 'For Beginners' : 'Dành cho người mới tìm hiểu'}</span>
          </div>
          <h2 class="tt-guide-banner__title">
            {isEn ? 'Buddhist Practice Guide for Beginners' : 'Hướng dẫn tu học Phật cho người mới tìm hiểu'}
          </h2>
          <p class="tt-guide-banner__desc">
            {isEn
              ? '4-Stage Roadmap: Karma Books · Great Compassion Mantra · Dharma Talks · Daily Practice'
              : 'Lộ trình 4 giai đoạn: Sách nhân quả · Trì chú Đại Bi · Nghe giảng kinh · Công phu mỗi ngày'}
          </p>
        </div>
      </div>
      <div class="tt-guide-banner__cta" aria-hidden="true">
        <span class="tt-guide-banner__cta-arrow">→</span>
      </div>
    </a>
  </div>

  <!-- 2. BANNER HƯỚNG DẪN BỐ THÍ PHÁP ĐỘ VONG LINH -->
  <div class="tt-guide-banner-wrap">
    <a
      href="/huong-dan#bo-thi-may-nghe-phap"
      class="tt-guide-banner tt-dharma-giving-banner"
      aria-label={isEn ? 'Dharma Giving Guide — Recitation players for spirits' : 'Hướng dẫn bố thí pháp máy nghe pháp độ vong linh'}
    >
      <div class="tt-guide-banner__left">
        <div class="tt-guide-banner__icon-box tt-icon-box--amber" aria-hidden="true">
          <span class="tt-guide-banner__icon">📻</span>
        </div>
        <div class="tt-guide-banner__body">
          <div class="tt-guide-banner__tag tt-tag--amber">
            <span class="tt-guide-banner__dot" aria-hidden="true"></span>
            <span>{isEn ? 'Dharma Giving' : 'Bố Thí Pháp · Độ Vong Linh'}</span>
          </div>
          <h2 class="tt-guide-banner__title">
            {isEn ? 'Offering Recitation Players to Spirits & Cemeteries' : 'Bố thí máy nghe pháp nơi cõi âm, nghĩa địa'}
          </h2>
          <p class="tt-guide-banner__desc">
            {isEn
              ? 'Vast merits at low cost: Setup 4G FAT32 audio players at accident sites, cemeteries, hospitals...'
              : 'Tăng trưởng công đức vô lượng: Hướng dẫn đặt máy niệm Phật thẻ nhớ 4G tại nghĩa trang, điểm tai nạn...'}
          </p>
        </div>
      </div>
      <div class="tt-guide-banner__cta" aria-hidden="true">
        <span class="tt-guide-banner__cta-arrow">→</span>
      </div>
    </a>
  </div>
</div>

<style>
  .fixed-practice-banners {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    box-sizing: border-box;
  }

  .tt-guide-banner-wrap {
    width: 100%;
    box-sizing: border-box;
  }

  .tt-guide-banner {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    text-decoration: none;
    border-radius: 18px;
    border: 1.5px solid rgba(200, 150, 62, 0.35);
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.12) 0%, rgba(39, 174, 96, 0.08) 100%);
    box-shadow: 0 4px 14px rgba(60, 40, 10, 0.05);
    transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
    overflow: hidden;
    box-sizing: border-box;
  }

  :global([data-theme='dark']) .tt-guide-banner {
    background: linear-gradient(135deg, rgba(200, 150, 62, 0.18) 0%, rgba(39, 174, 96, 0.12) 100%);
    border-color: rgba(200, 150, 62, 0.38);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }

  .tt-guide-banner:hover {
    transform: translateY(-2px);
    border-color: var(--gold, #c8963e);
    box-shadow: 0 8px 22px rgba(200, 150, 62, 0.18);
  }

  .tt-guide-banner:active {
    transform: scale(0.99);
  }

  .tt-guide-banner:hover .tt-guide-banner__cta-arrow {
    transform: translateX(3px);
  }

  .tt-newbie-banner {
    border-color: rgba(39, 174, 96, 0.32);
    background: linear-gradient(135deg, rgba(39, 174, 96, 0.1) 0%, rgba(200, 150, 62, 0.08) 100%);
  }

  :global([data-theme='dark']) .tt-newbie-banner {
    border-color: rgba(39, 174, 96, 0.38);
    background: linear-gradient(135deg, rgba(39, 174, 96, 0.16) 0%, rgba(200, 150, 62, 0.12) 100%);
  }

  .tt-dharma-giving-banner {
    border-color: rgba(217, 119, 6, 0.35);
    background: linear-gradient(135deg, rgba(217, 119, 6, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%);
  }

  :global([data-theme='dark']) .tt-dharma-giving-banner {
    background: linear-gradient(135deg, rgba(217, 119, 6, 0.18) 0%, rgba(245, 158, 11, 0.1) 100%);
    border-color: rgba(217, 119, 6, 0.38);
  }

  .tt-guide-banner__left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }

  .tt-guide-banner__icon-box {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border-radius: 14px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  }

  .tt-icon-box--green {
    background: rgba(39, 174, 96, 0.14);
    border: 1px solid rgba(39, 174, 96, 0.28);
  }

  :global([data-theme='dark']) .tt-icon-box--green {
    background: rgba(39, 174, 96, 0.2);
    border-color: rgba(39, 174, 96, 0.38);
  }

  .tt-icon-box--amber {
    background: rgba(217, 119, 6, 0.14);
    border: 1px solid rgba(217, 119, 6, 0.28);
  }

  :global([data-theme='dark']) .tt-icon-box--amber {
    background: rgba(217, 119, 6, 0.22);
    border-color: rgba(217, 119, 6, 0.4);
  }

  .tt-guide-banner__icon {
    font-size: 22px;
    line-height: 1;
  }

  .tt-guide-banner__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tt-guide-banner__tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    width: fit-content;
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: anywhere;
    padding: 2px 7px;
    border-radius: 999px;
    font-family: inherit;
    font-size: var(--font-size-meta);
    font-weight: 700;
    letter-spacing: 0.3px;
    text-transform: uppercase;
    line-height: 1.3;
  }

  .tt-tag--green {
    background: rgba(39, 174, 96, 0.12);
    border: 1px solid rgba(39, 174, 96, 0.24);
    color: #1e7e34;
  }

  :global([data-theme='dark']) .tt-tag--green {
    background: rgba(46, 204, 113, 0.16);
    border-color: rgba(46, 204, 113, 0.3);
    color: #4cd964;
  }

  .tt-tag--amber {
    background: rgba(217, 119, 6, 0.12);
    border: 1px solid rgba(217, 119, 6, 0.24);
    color: #b45309;
  }

  :global([data-theme='dark']) .tt-tag--amber {
    background: rgba(245, 158, 11, 0.16);
    border-color: rgba(245, 158, 11, 0.3);
    color: #fbbf24;
  }

  .tt-guide-banner__dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  .tt-guide-banner__title {
    margin: 1px 0 0;
    font-family: inherit;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    line-height: 1.35;
    color: var(--brown-dark, #422d16);
    letter-spacing: -0.1px;
  }

  :global([data-theme='dark']) .tt-guide-banner__title {
    color: var(--gold2, #f5d77f);
  }

  .tt-guide-banner__desc {
    margin: 1px 0 0;
    font-family: inherit;
    font-size: var(--font-size-body);
    line-height: 1.5;
    color: var(--muted, #857460);
  }

  .tt-guide-banner__cta {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .tt-guide-banner__cta-arrow {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--gold, #c8963e);
    color: #fff;
    font-size: 16px;
    font-weight: 700;
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.28);
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .tt-guide-banner:hover .tt-guide-banner__cta-arrow {
    transform: scale(1.08);
  }
</style>
