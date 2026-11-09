import offlineBooksEnRaw from '$lib/data/offline-books-en.json';
import offlineBooksViRaw from '$lib/data/offline-books-vi.json';
import chaptersEnAvailabilityRaw from '$lib/data/chapters-en-availability.json';
import type { LibraryArticle } from '$lib/components/library/article';

export interface LocalizedBookMeta {
  title: string;
  author?: string;
  summary?: string;
}

export const offlineBooksEn = (offlineBooksEnRaw || {}) as Record<string, LocalizedBookMeta>;
export const offlineBooksVi = (offlineBooksViRaw || {}) as Record<string, LocalizedBookMeta>;

export const ENGLISH_TRANSLATION_NOTICE = 'AI is used to prepare English translations, which may contain errors. Please refer to the Vietnamese original when needed.';

/** Presentation only: keep cached/source content, attribution and licence records intact. */
export function prepareLocalizedReadingContent(raw: string, locale: string): string {
  if (locale !== 'en') return raw;
  // Only these optional, standalone website labels occur in the audited Facebook collection.
  // Do not strip translator credits, unknown source labels, prose or media <source> elements.
  return raw.replace(/<p\b[^>]*>([^<>]*)<\/p\s*>/giu, (paragraph, text: string) =>
    /^\s*Source:\s*(?:https?:\/\/)?(?:nhanqua\.com\.vn|cafef\.vn)\/?\s*$/iu.test(text) ? '' : paragraph
  );
}

const chaptersEnIds = new Set<string>(
  ((chaptersEnAvailabilityRaw as { ids?: string[] }).ids ?? []).map((id: string) => String(id))
);
const chaptersEnMtIds = new Set<string>(
  ((chaptersEnAvailabilityRaw as { mtIds?: string[] }).mtIds ?? []).map((id: string) => String(id))
);

/** Lookup VI canonical meta theo id, chịu được 3 dạng key book_/thô. */
export function getCanonicalVietnameseArticle(id: string): LocalizedBookMeta | null {
  const key = String(id ?? '');
  if (!key) return null;
  return (
    offlineBooksVi[key] ||
    offlineBooksVi[key.replace(/^book_/u, '')] ||
    offlineBooksVi[`book_${key}`] ||
    null
  );
}

/** Lookup EN meta theo id, chịu được 3 dạng key book_/thô. */
export function getEnglishBookMeta(id: string): LocalizedBookMeta | null {
  const key = String(id ?? '');
  if (!key) return null;
  return (
    offlineBooksEn[key] ||
    offlineBooksEn[key.replace(/^book_/u, '')] ||
    offlineBooksEn[`book_${key}`] ||
    null
  );
}

/**
 * Trả về thông tin bài viết / cuốn sách đã được bản địa hóa theo ngôn ngữ hiện tại.
 * - Nếu ngôn ngữ là 'en' và sách có trong từ điển offlineBooksEn, sử dụng tiêu đề, tóm tắt và tác giả tiếng Anh.
 * - Nếu ngôn ngữ là 'vi' (hoặc khác 'en'), đảm bảo khôi phục lại tiêu đề, tóm tắt và tác giả tiếng Việt gốc.
 */
export function getLocalizedArticle(article: LibraryArticle, locale: string): LibraryArticle;
export function getLocalizedArticle(article: LibraryArticle | null | undefined, locale: string): LibraryArticle | null;
export function getLocalizedArticle(article: LibraryArticle | null | undefined, locale: string): LibraryArticle | null {
  if (!article) return null;

  if (locale === 'en') {
    const en = getEnglishBookMeta(article.id);
    if (!en) return article;

    return {
      ...article,
      title: en.title || article.title,
      summary: en.summary || article.summary,
      author: en.author || article.author,
      originalTitle: article.originalTitle || article.title,
      originalSummary: article.originalSummary || article.summary,
      originalAuthor: article.originalAuthor || article.author,
    };
  }

  // Chế độ tiếng Việt (locale !== 'en'):
  // Đảm bảo khôi phục lại tiêu đề, tóm tắt và tác giả tiếng Việt gốc
  const canonicalVi = getCanonicalVietnameseArticle(article.id);
  const targetTitle = article.originalTitle || canonicalVi?.title || article.title;
  const targetSummary = article.originalSummary ?? canonicalVi?.summary ?? article.summary;
  const targetAuthor = article.originalAuthor || canonicalVi?.author || article.author;

  if (
    targetTitle !== article.title ||
    targetSummary !== article.summary ||
    targetAuthor !== article.author
  ) {
    return {
      ...article,
      title: targetTitle,
      summary: targetSummary,
      author: targetAuthor,
    };
  }

  return article;
}

/** True khi sách có file chương tiếng Anh offline (nội dung EN đầy đủ). */
export function hasEnglishChapters(id: string): boolean {
  const key = String(id ?? '');
  if (!key) return false;
  const variants = [key, key.replace(/^book_/u, ''), `book_${key}`];
  return variants.some((v) => chaptersEnIds.has(v) || chaptersEnMtIds.has(v));
}

/** Loaded single-article English content is separate from the chapter-pack contract. */
export function hasEnglishReadingContent(id: string, singleArticleContent?: string | null): boolean {
  return hasEnglishChapters(id) || Boolean(singleArticleContent?.trim());
}

/** True khi bản EN chỉ là bản dịch máy (chưa biên tập). */
export function isMachineTranslatedEnglish(id: string): boolean {
  const key = String(id ?? '');
  if (!key) return false;
  const variants = [key, key.replace(/^book_/u, ''), `book_${key}`];
  return variants.some((v) => chaptersEnMtIds.has(v));
}

const LITURGY_CHAPTER_TITLES: Record<string, string> = {
  'NGHI THỨC TRÌ TỤNG BẢN TIẾNG PHẠN': 'Part 1: Liturgy & Recitation (Sanskrit Pronunciation)',
  'NGHI THỨC TRÌ TỤNG BẢN TIẾNG VIỆT': 'Part 2: Liturgy & Recitation (Traditional Romanization)',
  'CÔNG NĂNG DIỆU DỤNG CỦA THẦN CHÚ LĂNG NGHIÊM': 'Part 3: Inconceivable Power & Virtues of the Śūraṅgama Mantra',
  'CÔNG NĂNG OAI LỰC THẦN CHÚ ĐẠI BI': 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
  'CÔNG NĂNG OAI LỰC CỦA THẦN CHÚ ĐẠI BI': 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
  'RITUAL RECITATION IN SANSKRIT': 'Part 1: Liturgy & Recitation (Sanskrit Pronunciation)',
  'VIETNAMESE VERSION OF RECITATION': 'Part 2: Liturgy & Recitation (Traditional Romanization)',
  'THE USEFUL FUNCTION OF THE SHANG NGHIEM MANTRA': 'Part 3: Inconceivable Power & Virtues of the Śūraṅgama Mantra',
  'THE POWERFUL FUNCTION OF THE GREAT COMPASSION MANTRA': 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
  'PART 1: THE ŚŪRAṄGAMA MANTRA LITURGY (SANSKRIT PRONUNCIATION)': 'Part 1: Liturgy & Recitation (Sanskrit Pronunciation)',
  'PART 2: THE ŚŪRAṄGAMA MANTRA LITURGY (TRADITIONAL EAST-ASIAN PRONUNCIATION)': 'Part 2: Liturgy & Recitation (Traditional Romanization)',
  'PART 3: INCONCEIVABLE POWER & VIRTUES OF THE ŚŪRAṄGAMA MANTRA': 'Part 3: Inconceivable Power & Virtues of the Śūraṅgama Mantra',
  'PART 1: THE GREAT COMPASSION MANTRA LITURGY (SANSKRIT PRONUNCIATION)': 'Part 1: Liturgy & Recitation (Sanskrit Pronunciation)',
  'PART 2: THE GREAT COMPASSION MANTRA LITURGY (TRADITIONAL PRONUNCIATION)': 'Part 2: Liturgy & Recitation (Traditional Romanization)',
  'PART 3: INCONCEIVABLE POWER & VIRTUES OF THE GREAT COMPASSION MANTRA': 'Part 3: Inconceivable Power & Virtues of the Great Compassion Mantra',
};

/**
 * Chuẩn hoá tiêu đề chương khi ở locale EN (Tập/Phẩm/Chương/Quyển...).
 * Giữ nguyên khi locale vi hoặc không khớp pattern.
 */
export function localizeChapterTitle(title: string | undefined, locale: string): string {
  if (!title) return '';
  if (locale !== 'en') return title;

  const trimmed = title.trim();
  const upper = trimmed.toUpperCase();
  const cleanedUpper = upper.replace(/^(\d+[\.\:\-]\s*|PART\s*\d+[\.\:\-]\s*)/i, '').trim();

  if (LITURGY_CHAPTER_TITLES[trimmed]) {
    return LITURGY_CHAPTER_TITLES[trimmed];
  }
  if (LITURGY_CHAPTER_TITLES[upper]) {
    return LITURGY_CHAPTER_TITLES[upper];
  }
  if (LITURGY_CHAPTER_TITLES[cleanedUpper]) {
    return LITURGY_CHAPTER_TITLES[cleanedUpper];
  }
  if (/^Part\s+[123]:/i.test(trimmed)) {
    return trimmed;
  }

  return title
    .replace(/^Tập\s+/i, 'Chapter ')
    .replace(/^Phẩm\s+thứ\s+/i, 'Chapter ')
    .replace(/^Phẩm\s+/i, 'Chapter ')
    .replace(/^Chương\s+/i, 'Chapter ')
    .replace(/^Quyển\s+/i, 'Volume ')
    .replace(/^Phần\s+mở\s+đầu/i, 'Prologue')
    .replace(/^Phần\s+kết/i, 'Epilogue')
    .replace(/^Lời\s+giới\s+thiệu/i, 'Introduction')
    .replace(/^Lời\s+tựa/i, 'Preface')
    .replace(/^Lời\s+tri\s+ân/i, 'Acknowledgements')
    .replace(/^Phần\s+một\b/i, 'Part One')
    .replace(/^Phần\s+hai\b/i, 'Part Two')
    .replace(/^Phần\s+ba\b/i, 'Part Three')
    .replace(/^Phần\s+bốn\b/i, 'Part Four')
    .replace(/^Phần\s+năm\b/i, 'Part Five')
    .replace(/^Phần\s+sáu\b/i, 'Part Six')
    .replace(/^Phần\s+bảy\b/i, 'Part Seven')
    .replace(/^Phần\s+tám\b/i, 'Part Eight')
    .replace(/^Phần\s+chín\b/i, 'Part Nine')
    .replace(/^Phần\s+mười\b/i, 'Part Ten')
    .replace(/^Mở\s+đầu/i, 'Opening');
}
