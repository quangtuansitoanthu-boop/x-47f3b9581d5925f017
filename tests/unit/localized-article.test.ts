import { describe, expect, it } from 'vitest';
import {
  getCanonicalVietnameseArticle,
  getEnglishBookMeta,
  getLocalizedArticle,
  prepareLocalizedReadingContent,
  ENGLISH_TRANSLATION_NOTICE,
  hasEnglishChapters,
  hasEnglishReadingContent
} from '../../src/lib/domain/library/localized-article';
import type { LibraryArticle } from '../../src/lib/components/library/article';

describe('localized-article domain', () => {
  const sampleBookId = 'book_cfab6dea8430aada3d2cf19180dd4d27';

  it('removes only optional standalone website-source paragraphs in English reading content', () => {
    const body = '<p>Keep the teaching.</p><p style="text-align:justify">Source: nhanqua.com.vn</p><p>Source: https://cafef.vn</p><video><source src="/videos/teaching.mp4"></video>';
    expect(prepareLocalizedReadingContent(body, 'en')).toBe('<p>Keep the teaching.</p><video><source src="/videos/teaching.mp4"></video>');
    expect(prepareLocalizedReadingContent(body, 'vi')).toBe(body);
  });

  it('preserves authors, translators, licences, uncertain source credits and doctrinal uses of source', () => {
    const body = '<p>English translation by Bhikkhu Sujato, via SuttaCentral (public domain, CC0).</p>'
      + '<p>English Translation by Tsugunari Kubo and Akira Yuyama — CC BY-NC-SA 3.0.</p>'
      + '<p>English translation: Buddhist Text Translation Society. Source: cttbusa.org.</p>'
      + '<p>Source: Lê Tơ Hồng</p><p>Source: dharmasite.net</p>'
      + '<p>The source of suffering is craving. Source: https://cafef.vn</p>'
      + '{align:center|*(Source: Cattāri Brahmavihārā & Buddhist Text Translation Society / Sagely City of Ten Thousand Buddhas)*}';
    expect(prepareLocalizedReadingContent(body, 'en')).toBe(body);
  });

  it('discloses AI preparation and possible errors without claiming every English work is AI translated', () => {
    expect(ENGLISH_TRANSLATION_NOTICE).toBe('AI is used to prepare English translations, which may contain errors. Please refer to the Vietnamese original when needed.');
  });

  it('recognizes a loaded single-article translation without changing chapter availability', () => {
    const id = 'tt_kinh_duoc_su';
    expect(hasEnglishChapters(id)).toBe(false);
    expect(hasEnglishReadingContent(id, null)).toBe(false);
    expect(hasEnglishReadingContent(id, '   ')).toBe(false);
    expect(hasEnglishReadingContent(id, '<p>English translation</p>')).toBe(true);
    expect(hasEnglishReadingContent(sampleBookId, null)).toBe(true);
    expect(hasEnglishChapters(id)).toBe(false);
  });

  it('provides canonical Vietnamese metadata and English translations for bundled books', () => {
    const viMeta = getCanonicalVietnameseArticle(sampleBookId);
    expect(viMeta).toBeDefined();
    expect(viMeta?.title).toBe('Lá Thư Tịnh Độ');
    expect(viMeta?.summary).toContain('Bức tâm thư quý giá đúc kết');

    const enMeta = getEnglishBookMeta(sampleBookId);
    expect(enMeta).toBeDefined();
    expect(enMeta?.title).toBe('Letters from the Pure Land');
    expect(enMeta?.summary).toContain('Collection of letters');
  });

  it('works with both book_ prefixed and raw un-prefixed IDs', () => {
    const rawId = sampleBookId.replace(/^book_/, '');
    const vi1 = getCanonicalVietnameseArticle(sampleBookId);
    const vi2 = getCanonicalVietnameseArticle(rawId);
    expect(vi1?.title).toBe(vi2?.title);

    const en1 = getEnglishBookMeta(sampleBookId);
    const en2 = getEnglishBookMeta(rawId);
    expect(en1?.title).toBe(en2?.title);
  });

  it('localizes a Vietnamese article to English when locale is en', () => {
    const baseArticle: LibraryArticle = {
      id: sampleBookId,
      title: 'Lá Thư Tịnh Độ',
      summary: 'Bản dịch truyền cảm...',
      author: 'Ấn Quang Pháp Sư',
      content: '<p>Content</p>',
      category: 'SÁCH KHUYẾN THIỆN',
      tags: ['Tịnh Độ'],
      imageUrl: '',
      featured: false,
      publishedAt: '2026-01-01',
      hasTableOfContents: true,
      volumeCount: 1,
      status: 'Hoàn thành',
      pdfUrl: '',
      originalTitle: 'Lá Thư Tịnh Độ',
      originalSummary: 'Bản dịch truyền cảm...',
      originalAuthor: 'Ấn Quang Pháp Sư'
    };

    const enArticle = getLocalizedArticle(baseArticle, 'en');
    expect(enArticle.title).toBe('Letters from the Pure Land');
    expect(enArticle.summary).toContain('Collection of letters');
    expect(enArticle.originalTitle).toBe('Lá Thư Tịnh Độ');
  });

  it('reliably restores canonical Vietnamese title and summary when switching to vi mode', () => {
    // Giả lập tình huống article đang mang tên và mô tả tiếng Anh (do tải từ cache hoặc phiên EN trước)
    const englishArticle: LibraryArticle = {
      id: sampleBookId,
      title: 'Letters from the Pure Land',
      summary: 'Collection of letters and Dharma instructions...',
      author: 'Master Yin Kuang',
      content: '<p>Content</p>',
      category: 'SÁCH KHUYẾN THIỆN',
      tags: ['Pure Land'],
      imageUrl: '',
      featured: false,
      publishedAt: '2026-01-01',
      hasTableOfContents: true,
      volumeCount: 1,
      status: 'Completed',
      pdfUrl: ''
    };

    // Khi chuyển về vi:
    const viArticle = getLocalizedArticle(englishArticle, 'vi');
    expect(viArticle.title).toBe('Lá Thư Tịnh Độ');
    expect(viArticle.summary).toContain('Bức tâm thư quý giá đúc kết');
    expect(viArticle.author).toContain('Ấn Quang');
  });

  it('restores using originalTitle if article has custom original metadata', () => {
    const articleWithOriginal: LibraryArticle = {
      id: 'custom_book_123',
      title: 'English Title',
      summary: 'English Summary',
      author: 'English Author',
      content: '',
      category: 'KHÁC',
      tags: [],
      imageUrl: '',
      featured: false,
      publishedAt: '',
      hasTableOfContents: false,
      volumeCount: 0,
      status: '',
      pdfUrl: '',
      originalTitle: 'Tiêu Đề Gốc Tiếng Việt',
      originalSummary: 'Mô Tả Gốc Tiếng Việt',
      originalAuthor: 'Tác Giả Gốc'
    };

    const viArticle = getLocalizedArticle(articleWithOriginal, 'vi');
    expect(viArticle.title).toBe('Tiêu Đề Gốc Tiếng Việt');
    expect(viArticle.summary).toBe('Mô Tả Gốc Tiếng Việt');
    expect(viArticle.author).toBe('Tác Giả Gốc');
  });
});
