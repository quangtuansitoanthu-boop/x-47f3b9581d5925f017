import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import ArticleCard from '../../../src/lib/components/library/ArticleCard.svelte';
import ArticleCardSkeleton from '../../../src/lib/components/library/ArticleCardSkeleton.svelte';
import LibrarySidebar from '../../../src/lib/components/library/LibrarySidebar.svelte';
import ContinueReadingShelf from '../../../src/lib/components/library/ContinueReadingShelf.svelte';
import PresenceChip from '../../../src/lib/components/presence/PresenceChip.svelte';
import type { LibraryArticle } from '../../../src/lib/components/library/article';
import { isHomepageArticleVisible } from '../../../src/lib/domain/library/homepage-visibility';

const article: LibraryArticle = {
  id: 'sample', title: 'Gieo nhân lành', summary: 'Một bài viết thử nghiệm', content: '',
  category: 'CHUYỆN NHÂN QUẢ', tags: ['Nhân quả', 'Hành thiện'], author: 'Quang Từ',
  imageUrl: '', featured: true, publishedAt: '2026-07-31', hasTableOfContents: false,
  volumeCount: 0, status: '', pdfUrl: '', viewCount: 38
};

describe('library foundation', () => {
  it('exposes complete continue-reading and private quote states', () => {
    const shelf = render(ContinueReadingShelf, { props: { articles: [article] } }).body;
    const shelfSource = readFileSync('src/lib/components/library/ContinueReadingShelf.svelte', 'utf8');
    const removalSource = readFileSync('src/lib/components/library/continue-reading-removal.ts', 'utf8');
    const quotesSource = readFileSync('src/routes/trich-dan-cua-toi/+page.svelte', 'utf8');
    expect(shelf).toContain('Tiếp tục đọc');
    expect(shelf).toContain('/trich-dan-cua-toi');
    expect(shelfSource).toContain('Nội dung không còn khả dụng');
    expect(shelfSource).toContain("'Read again' : 'Đọc lại'");
    expect(shelfSource).toContain("'Continue' : 'Tiếp tục'");
    expect(shelfSource).toContain('removeContinueReadingProgress');
    expect(shelfSource).toContain('principalGuard.isCurrent(principalToken)');
    expect(shelfSource).toContain("removingKey = '';");
    expect(removalSource).toContain('enqueueProgressDelete');
    expect(removalSource).toContain('Hàng đợi đọc ngoại tuyến đã đầy');
    expect(shelfSource).toContain('role="alert"');
    expect(quotesSource).toContain('KHÔNG GIAN RIÊNG TƯ');
    expect(quotesSource).toContain('anchorStatus === \'orphaned\'');
    expect(quotesSource).not.toContain('{@html');
  });
  it('renders an article card without nested interactive controls', () => {
    const { body } = render(ArticleCard, { props: { article } });
    expect(body).toContain('GIEO NHÂN LÀNH');
    expect(body).toContain('CHUYỆN NHÂN QUẢ');
    const openButton = body.match(/<button class="art-card__open"[\s\S]*?<\/button>/u)?.[0] ?? '';
    expect(openButton.match(/<button/gu)).toHaveLength(1);
  });

  it('keeps the catalog card focused on reading with no management controls', () => {
    const { body } = render(ArticleCard, { props: { article: { ...article, status: 'Chờ duyệt' } } });
    expect(body).toContain('art-card__open');
    expect(body).not.toContain('card-edit-btn');
    expect(body).not.toContain('card-del-btn');
    expect(body).not.toContain('card-status-badge');
    expect(body).not.toContain('art-read');
    expect(body).toContain('art-cover');
  });

  it('renders the saved cover position and distinct production metadata badges', () => {
    const positionedBook: LibraryArticle = {
      ...article,
      imageUrl: 'https://media.quangtu.vn/covers/book.webp#pos=50%25%2024%25',
      hasTableOfContents: true,
      volumeCount: 40,
      status: 'Đang cập nhật'
    };
    const { body } = render(ArticleCard, { props: { article: positionedBook } });
    // Bìa do action đọc cache sau hydrate, không phát sinh thêm request từ src SSR.
    expect(body.match(/<img\b[^>]*>/u)?.[0]).not.toMatch(/\ssrc=/u);
    expect(body).toMatch(/style="object-position:\s*50% 24%;?"/);
    expect(body).toContain('class="art-volume"');
    expect(body).toContain('📚 40 phẩm');
    expect(body).toContain('class="art-status"');
    expect(body).toContain('📝 Đang cập nhật');
  });

  it('renders single most-viewed badge when mostViewed is true', () => {
    const { body } = render(ArticleCard, { props: { article, mostViewed: true } });
    expect(body).toContain('Xem nhiều nhất');
    expect(body).toContain('class="art-badge-most-viewed"');
    expect(body).not.toContain('class="art-badge-top-viewed"');
  });

  it('keeps the presence count hidden until a real response exists', () => {
    expect(render(PresenceChip, { props: { count: null } }).body).not.toContain('presence-chip');
    expect(render(PresenceChip, { props: { count: 12 } }).body).toContain('12 đang xem');
  });

  it('keeps catalog search without restarting retired live presence', () => {
    const page = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');
    const styles = readFileSync('src/lib/styles/library.css', 'utf8');
    expect(page).toContain('placeholder={t.library.searchPlaceholder}');
    expect(page).not.toContain('<PresenceChip');
    expect(page).not.toMatch(/\b(?:startPresence|listenPresence)\s*\(/u);
    expect(page).not.toContain('presenceCount');
    expect(styles).toContain('position:absolute');
    expect(styles).toContain('.search-input');
  });

  it('keeps placeholder cards visually responsive like production image cards', () => {
    const styles = readFileSync('src/lib/styles/library.css', 'utf8');
    expect(styles).toContain('.art-thumb img,.art-thumb-placeholder');
    expect(styles).toContain('.art-card:hover .art-thumb img,.art-card:hover .art-thumb-placeholder');
    expect(styles).toContain('.art-card:hover .art-thumb img,.art-card:hover .art-thumb-placeholder { transform:none; }');
    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('renders card-shaped loading placeholders without exposing decorative content', () => {
    const regular = render(ArticleCardSkeleton).body;
    const featured = render(ArticleCardSkeleton, { props: { featured: true, compact: true, short: true } }).body;
    const page = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');

    expect(regular).toMatch(/class="article-skeleton\s/u);
    expect(regular).toContain('aria-hidden="true"');
    expect(featured).toMatch(/class="article-skeleton[^"\n]*\sfeatured(?:\s|")/u);
    expect(featured).toContain('compact');
    expect(featured).toContain('short');
    expect(page).toContain('aria-busy={loading}');
    expect(page).toContain('{#each Array(5) as _, index}');
    expect(page).toContain('featured={index === 0}');
    expect(page).toContain('short={index === 1}');
    expect(page).toContain('compact={index >= 3}');
    expect(page).toContain('role="status">{t.common.loading}');
  });

  it('keeps the two production share actions and Facebook icon anatomy', () => {
    const { body } = render(LibrarySidebar, { props: { articles: [article] } });
    expect(body).toContain('Chia sẻ Facebook');
    expect(body).toContain('Sao chép liên kết');
    expect(body).toContain('class="share-facebook');
    expect(body).toContain('class="share-copy-button');
    expect(body).toContain('<svg');
  });

  it('ranks the popular list by views and renders the production eye badge', () => {
    const mostViewed: LibraryArticle = {
      ...article,
      id: 'most-viewed',
      title: 'Bài xem nhiều nhất',
      featured: false,
      viewCount: 138
    };
    const { body } = render(LibrarySidebar, { props: { articles: [article, mostViewed] } });
    expect(body.indexOf('BÀI XEM NHIỀU NHẤT')).toBeLessThan(body.indexOf('GIEO NHÂN LÀNH'));
    expect(body).toContain('class="pop-views"');
    expect(body).toContain('👁 138');
  });

  it('reserves popular-list and topic-pill geometry while homepage data loads', () => {
    const { body } = render(LibrarySidebar, { props: { articles: [], loading: true } });
    const page = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');
    expect(body).toContain('sidebar-popular-skeleton');
    expect(body.match(/sidebar-popular-skeleton__row/gu)).toHaveLength(5);
    expect(body).toContain('sidebar-tags-skeleton');
    expect(body).toContain('aria-hidden="true"');
    expect(page).toMatch(/<details\b[^>]*\bclass="library-disclosure"/u);
    expect(page).toContain('compactLibrary={true}');
    expect(page).toContain('bind:value={activeSection}');
  });

  it('ranks popular tags by frequency and keeps the larger production pills', () => {
    const firstArticle: LibraryArticle = { ...article, tags: ['Hành thiện', 'Nhân quả'] };
    const secondArticle: LibraryArticle = {
      ...article,
      id: 'second',
      title: 'Bài thứ hai',
      tags: ['Phật giáo', 'Nhân quả']
    };
    const { body } = render(LibrarySidebar, { props: { articles: [firstArticle, secondArticle] } });
    const tagCloud = body.slice(body.indexOf('class="tag-cloud"'));
    expect(tagCloud.indexOf('Nhân quả')).toBeLessThan(tagCloud.indexOf('Hành thiện'));
    expect(tagCloud.match(/>Nhân quả<\/button>/gu)).toHaveLength(1);

    const styles = readFileSync('src/lib/styles/library.css', 'utf8');
    expect(styles).toContain('.tag-cloud .art-tag');
    expect(styles).toContain('padding:4px 10px');
    expect(styles).toMatch(/\.tag-cloud \.art-tag\s*\{[^}]*font-size:\s*var\(--font-size-meta\)/);
  });

  it('keeps legacy substring tag filtering and dynamic article metadata', () => {
    const page = readFileSync('src/routes/kinh-sach/+page.svelte', 'utf8');
    const catalogs = readFileSync('src/lib/browser/content-catalogs.ts', 'utf8');
    expect(page).toContain("tag.toLocaleLowerCase('vi').includes(normalizedTag)");
    expect(page).toContain('selectedArticle.title');
    expect(page).toContain('selectedArticle?.summary');
    expect(page).toContain('selectedArticle?.imageUrl');
    expect(catalogs).toContain('link_ngoai');
    expect(catalogs).toContain('externalUrl: String(row.link_ngoai');
  });

  it('enforces public category visibility during CSR catalog mapping', () => {
    expect(isHomepageArticleVisible({ danh_muc: 'KINH PHẬT' })).toBe(false);
    expect(isHomepageArticleVisible({ danh_muc: 'CÁC NGHI THỨC' }, 'ctv')).toBe(false);
    expect(isHomepageArticleVisible({ danh_muc: 'PHÁP THOẠI' }, 'admin')).toBe(false);
    expect(isHomepageArticleVisible({ danh_muc: 'KINH PHẬT' }, 'admin')).toBe(true);
  });
});
