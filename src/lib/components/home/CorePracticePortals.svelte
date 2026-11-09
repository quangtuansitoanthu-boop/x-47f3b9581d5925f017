<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';
  import PracticeArtwork from '$lib/components/practice/PracticeArtwork.svelte';
  import AppArtwork from '$lib/components/icons/AppArtwork.svelte';

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  type PillarType = 'practice' | 'books' | 'talks';
  let activePillar = $state<PillarType>('practice');

  interface SatelliteItem {
    id: string;
    title: string;
    titleEn: string;
    sub?: string;
    icon?: string;
    cover?: string;
    href: string;
  }

  const PRACTICE_SATELLITES: SatelliteItem[] = [
    {
      id: 'thien-dinh',
      title: 'Thiền định',
      titleEn: 'Meditation',
      icon: '🧘',
      href: '/tu-tap?mode=meditation'
    },
    {
      id: 'tung-kinh',
      title: 'Tụng kinh',
      titleEn: 'Chanting',
      icon: '📜',
      href: '/tu-tap?category=kinh-phat'
    },
    {
      id: 'tri-chu',
      title: 'Trì chú',
      titleEn: 'Mantras',
      icon: '📿',
      href: '/tu-tap?category=tri-chu'
    },
    {
      id: 'rosary',
      title: 'Lần tràng hạt',
      titleEn: 'Rosary Beads',
      cover: '/images/rosary/hat-kim-cang-bo-de-clean-20261023.webp',
      icon: '📿',
      href: '/tu-tap?action=rosary'
    },
    {
      id: 'thanh-tinh',
      title: 'Tiết dục bảo thân',
      titleEn: 'Sexual Restraint & Well-being',
      icon: '🪷',
      href: '/tu-tap?action=thanh-tinh'
    }
  ];

  const BOOK_SATELLITES: SatelliteItem[] = [
    {
      id: 'su-menh-do-vong',
      title: 'Sứ Mệnh Độ Vong',
      titleEn: 'Spirit Rescue',
      cover: '/covers/1781137575322_czofm.webp',
      href: '/?book=tt_1781081372340_1_xqcxo'
    },
    {
      id: 'bao-ung-hien-doi',
      title: 'Báo Ứng Hiện Đời',
      titleEn: 'Karmic Retribution',
      cover: '/covers/1781137669714_a8ooz.webp',
      href: '/?book=tt_1781081525279_1_t5eqk'
    },
    {
      id: 'kinh-dia-tang-tranh',
      title: 'Truyện Tranh Địa Tạng',
      titleEn: 'Ksitigarbha Comic',
      cover: '/covers/1783263779955_v6sks.webp',
      href: '/?book=tt_1783263563410_ndzd5'
    },
    {
      id: 'am-luat-vo-tinh',
      title: 'Âm Luật Vô Tình',
      titleEn: 'Ruthless Nether Law',
      cover: '/covers/1781604170713_8erjg.webp',
      href: '/?book=tt_1781604218473'
    },
    {
      id: 'dia-nguc-du-ky',
      title: 'Địa Ngục Du Ký',
      titleEn: 'Hell Journeys',
      cover: '/covers/1781452621916_nkfh5.webp',
      href: '/?book=tt_1781452671270'
    },
    {
      id: 'ngoc-lich-buu-phieu',
      title: 'Ngọc Lịch Bửu Phiêu',
      titleEn: 'Precious Scroll',
      cover: '/covers/1781451781080_lo8k9.webp',
      href: '/?book=tt_1781449424574'
    }
  ];

  const TALK_SATELLITES: SatelliteItem[] = [
    {
      id: 'do-vong',
      title: 'Sứ Mệnh Độ Vong',
      titleEn: 'Spirit Rescue',
      cover: '/covers/talk_su_menh_do_vong.webp',
      href: '/phap-thoai?id=pt_drive_69bc37dd604011a70e5c4e38337865a8'
    },
    {
      id: 'ngoc-lich',
      title: 'Ngọc Lịch Bửu Phiêu',
      titleEn: 'Precious Scroll',
      cover: '/covers/talk_ngoc_lich_buu_phieu.webp',
      href: '/phap-thoai?id=pt_drive_fe9e0a4dd98d9d73cb08d1cd12970f37'
    },
    {
      id: 'dia-nguc',
      title: 'Địa Ngục Du Ký',
      titleEn: 'Underworld Journeys',
      cover: '/covers/talk_dia_nguc_du_ky.webp',
      href: '/phap-thoai?id=pt_drive_74959767068eaae1db4846f62b62eda8'
    },
    {
      id: 'gay-kim-cang',
      title: 'Gậy Kim Cang Hét',
      titleEn: 'Vajra Roar',
      cover: '/covers/talk_gay_kim_cang_het.webp',
      href: '/phap-thoai?id=pt_drive_9332ba09c8672ac69faf1ed7fca0a8b9'
    },
    {
      id: 'am-luat',
      title: 'Âm Luật Vô Tình',
      titleEn: 'Karmic Law',
      cover: '/covers/talk_am_luat_vo_tinh.webp',
      href: '/phap-thoai'
    },
    {
      id: 'khai-thi-1',
      title: 'Khai Thị — Quyển 1',
      titleEn: 'Dharma Instructions — Vol. 1',
      cover: '/covers/khai-thi-quyen-1.jpg',
      href: '/phap-thoai?id=pt_drive_74fa64d7652c4e94a56d5e8b1184f16e'
    }
  ];

  const currentSatellites = $derived.by(() => {
    switch (activePillar) {
      case 'books':
        return BOOK_SATELLITES;
      case 'talks':
        return TALK_SATELLITES;
      default:
        return PRACTICE_SATELLITES;
    }
  });

  const pillarHero = $derived.by(() => {
    switch (activePillar) {
      case 'books':
        return {
          title: isEn ? 'Sutra Library' : 'Kho Kinh Sách',
          icon: '📖',
          href: '/kinh-sach',
          viewAll: isEn ? 'Explore All 100+ Sutras →' : 'Xem toàn bộ 100+ bộ kinh sách →',
          tag: isEn ? 'Reading & Contemplation' : 'Đọc & Thấu triệt chánh pháp'
        };
      case 'talks':
        return {
          title: isEn ? 'Dharma Audio' : 'Kho Pháp Thoại',
          icon: '🎧',
          href: '/phap-thoai',
          viewAll: isEn ? 'Listen to All Dharma Lectures →' : 'Xem toàn bộ bài giảng pháp thoại →',
          tag: isEn ? 'Hearing & Wisdom' : 'Lắng nghe & Khai mở trí tuệ'
        };
      default:
        return {
          title: isEn ? 'Practice Mode' : 'Chế Độ Tu Tập',
          icon: '🙏',
          href: '/tu-tap',
          viewAll: isEn ? 'Open Full Practice Hall →' : 'Mở giảng đường tu tập đầy đủ →',
          tag: isEn ? 'Cultivation & Mind' : 'Huân tập & Chuyển hóa thân tâm'
        };
    }
  });

  function setPillar(p: PillarType): void {
    if (activePillar !== p) {
      triggerHaptic('selection');
      activePillar = p;
    }
  }

  function handleSatelliteClick(event: MouseEvent, item: SatelliteItem): void {
    triggerHaptic('light');
    if (activePillar === 'books') {
      event.preventDefault();
      const match = item.href.match(/[?&]book=([^&]+)/);
      const bookId = match ? match[1] : item.id;
      window.dispatchEvent(new CustomEvent('quangtu:open-book', { detail: { bookId } }));
    }
  }
</script>

<section class="core-practice-portals" aria-labelledby="home-portals-title">
  <header class="portals-heading">
    <div><p>{isEn ? 'Your daily companion' : 'Đồng hành mỗi ngày'}</p><h2 id="home-portals-title">{isEn ? 'Nurture a peaceful mind' : 'Nuôi dưỡng tâm an'}</h2></div>
    <a href={pillarHero.href} aria-label={isEn ? 'Explore this collection' : 'Khám phá danh mục này'}>{isEn ? 'View all' : 'Xem tất cả'} <span aria-hidden="true">↗</span></a>
  </header>
  <div class="portal-switcher" role="group" aria-label={isEn ? 'Choose a collection' : 'Chọn danh mục'}>
    {#each [{id:'practice', vi:'Tu tập', en:'Practice'}, {id:'books', vi:'Kinh sách', en:'Books'}, {id:'talks', vi:'Pháp thoại', en:'Audio'}] as pillar}
      <button type="button" aria-pressed={activePillar === pillar.id} onclick={() => setPillar(pillar.id as PillarType)}>{isEn ? pillar.en : pillar.vi}</button>
    {/each}
  </div>
  <div class="portal-grid">
    {#each currentSatellites as item (item.id)}
      <a href={item.href} class="portal-card" onclick={(event) => handleSatelliteClick(event, item)}>
        <span class="portal-art" aria-hidden="true">
          {#if activePillar !== 'practice' && item.cover}
            <img src={item.cover} alt="" loading="lazy" width="48" height="56" />
          {:else if activePillar === 'practice'}
            <PracticeArtwork kind={item.id} />
          {:else}
            <AppArtwork name={activePillar} />
          {/if}
        </span>
        <span class="portal-label">{isEn ? item.titleEn : item.title}</span>
        <span class="portal-arrow" aria-hidden="true">↗</span>
      </a>
    {/each}
    {#if activePillar === 'practice'}
      <a href="/tu-tap?action=le-phat" class="portal-card" onclick={() => triggerHaptic('light')}>
        <span class="portal-art" aria-hidden="true"><PracticeArtwork kind="le-phat" /></span>
        <span class="portal-label">{isEn ? 'Bowing' : 'Lễ Phật'}</span><span class="portal-arrow" aria-hidden="true">↗</span>
      </a>
    {/if}
  </div>
</section>

<style>
  .core-practice-portals{min-width:0}
  .portals-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}
  .portals-heading p{margin:0 0 4px;color:var(--text2);font-size: var(--font-size-label);line-height:1.5}
  .portals-heading h2{margin:0;font-size: var(--font-size-section-title);letter-spacing:-.4px;line-height:1.35;color:var(--text)}
  .portals-heading>a{display:inline-flex;gap:8px;align-items:center;min-height:48px;color:var(--brown);font-size: var(--font-size-label);font-weight:600;text-decoration:none;flex-shrink:0}
  .portal-switcher{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;margin-bottom:14px;background:var(--bg2);border:1px solid var(--border2);border-radius:var(--radius-control)}
  .portal-switcher button{min-width:0;min-height:48px;padding:8px 6px;border:0;border-radius:10px;background:transparent;color:var(--text2);font:inherit;font-size: var(--font-size-body);font-weight:600;line-height:1.45;cursor:pointer;transition:background var(--motion-fast),color var(--motion-fast)}
  .portal-switcher button[aria-pressed='true']{background:var(--card);color:var(--brown);box-shadow:0 2px 6px rgba(60,40,10,.06)}
  .portal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
  .portal-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;min-width:0;min-height:92px;padding:16px;border:1px solid var(--border2);border-radius:var(--radius-card);background:var(--card);color:var(--text);text-align:center;text-decoration:none;transition:transform var(--motion-press) var(--ease-standard),border-color var(--motion-fast),box-shadow var(--motion-fast)}
  .portal-card:hover{border-color:var(--gold);box-shadow:var(--shadow)}.portal-card:active{transform:scale(.98)}
  .portal-art{display:grid;place-items:center;flex:0 0 auto;width:48px;height:56px;border-radius:12px;background:var(--gold-light);color:var(--brown)}
  .portal-art img{display:block;width:48px;height:56px;object-fit:cover;border-radius:8px}
  .portal-label{font-size: var(--font-size-card-title);font-weight:600;line-height:1.5;overflow-wrap:anywhere}
  .portal-arrow{position:absolute;top:8px;right:10px;color:var(--muted);font-size:13px}
  @media(max-width:650px){.portal-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.portal-card{min-height:92px;padding:12px;gap:10px}.portal-art{width:44px;height:48px;flex-basis:44px}.portal-art img{width:44px;height:48px}.portals-heading h2{font-size: var(--font-size-section-title)}}
  @media(max-width:480px){.portal-card{gap:8px}.portal-art{flex-basis:auto}.portal-label{width:100%}}
  @media(prefers-reduced-motion:reduce){.portal-card,.portal-switcher button{transition:none}.portal-card:active{transform:none}}
</style>
