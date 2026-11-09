import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PracticeContinueReadingShelf from '../../../src/lib/components/practice/catalog/PracticeContinueReadingShelf.svelte';
import ContinueReadingShelf from '../../../src/lib/components/library/ContinueReadingShelf.svelte';
import type { PracticeArticleSummary } from '../../../src/lib/domain/practice/state';
import type { LibraryArticle } from '../../../src/lib/components/library/article';

const practiceArticle: PracticeArticleSummary = {
  id: 'tt_1781274943336',
  title: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện',
  category: 'KINH PHẬT',
  publishedAt: '2026-08-01',
  author: 'Tu Tập',
  imageUrl: '',
  hasTableOfContents: true,
  tags: ['Kinh', 'Địa Tạng']
};

const libraryArticle: LibraryArticle = {
  id: 'sample-book',
  title: 'Gieo nhân lành gặt quả thiện',
  summary: 'Bài học nhân quả',
  content: '',
  category: 'CHUYỆN NHÂN QUẢ',
  tags: ['Nhân quả'],
  author: 'Quang Từ',
  imageUrl: '',
  featured: true,
  publishedAt: '2026-07-31',
  hasTableOfContents: false,
  volumeCount: 0,
  status: '',
  pdfUrl: '',
  viewCount: 10
};

describe('practice continue reading shelf', () => {
  it('keeps the practice entry visible while progress loads without fabricating a saved item', () => {
    const { body } = render(PracticeContinueReadingShelf, {
      props: { articles: [practiceArticle] }
    });
    expect(body).toContain('tt-mode-card--continue');
    expect(body).toContain('Tiếp tục công phu');
    expect(body).toContain('Đang tải tiến độ công phu');
    expect(body).not.toContain('tt-continue-card');
    expect(body).not.toContain(practiceArticle.title);
  });

  it('contains expected structure, controls and removal client hooks in source', () => {
    const source = readFileSync(
      'src/lib/components/practice/catalog/PracticeContinueReadingShelf.svelte',
      'utf8'
    );
    expect(source).toContain('Tiếp tục công phu');
    expect(source).toContain('TU TẬP HẰNG NGÀY');
    expect(source).toContain('removeContinueReadingProgressIfCurrent');
    expect(source).toContain('isPracticeProgress');
    expect(source).toContain("row.percent >= 100 ? 'Tụng lại' : 'Tiếp tục'");
    expect(source).toContain('Đang tụng Phẩm');
  });

  it('homepage shelf filters out practice kind and sacred sutras/rituals', () => {
    const shelfSource = readFileSync(
      'src/lib/components/library/ContinueReadingShelf.svelte',
      'utf8'
    );
    expect(shelfSource).toContain('isLibraryProgress');
    expect(shelfSource).toContain("row.contentKind === 'practice'");
    expect(shelfSource).toContain("source.category === 'KINH PHẬT'");
    expect(shelfSource).toContain("source.category === 'CÁC NGHI THỨC'");
    expect(shelfSource).toContain('libraryProgress');

    const shelf = render(ContinueReadingShelf, {
      props: { articles: [libraryArticle] }
    }).body;
    expect(shelf).toContain('Tiếp tục đọc');
    expect(shelf).toContain('href="/trich-dan-cua-toi"');
    expect(shelf).toContain('Trích dẫn của tôi');
  });
});
