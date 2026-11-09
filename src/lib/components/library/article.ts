export type ArticleCategory =
  | 'CHUYỆN NHÂN QUẢ'
  | 'SÁCH KHUYẾN THIỆN'
  | 'KINH PHẬT'
  | 'CÁC NGHI THỨC'
  | 'TRÌ CHÚ'
  | 'NGHI THỨC KHÁC'
  | 'KHÁC';

export interface LibraryArticle {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: ArticleCategory;
  tags: string[];
  author: string;
  imageUrl: string;
  featured: boolean;
  publishedAt: string;
  hasTableOfContents: boolean;
  volumeCount: number;
  status: string;
  pdfUrl: string;
  externalUrl?: string;
  viewCount?: number;
  createdAt?: string;
  updatedAt?: string;
  originalTitle?: string;
  originalSummary?: string;
  originalAuthor?: string;
}

export const LIBRARY_SECTIONS: Array<{ key: 'all' | ArticleCategory; label: string; icon: string }> = [
  { key: 'all', label: 'TẤT CẢ', icon: '☸️' },
  { key: 'SÁCH KHUYẾN THIỆN', label: 'SÁCH KHUYẾN THIỆN', icon: '📚' },
  { key: 'KHÁC', label: 'KHÁC', icon: '🌿' }
];

const ALL_CATEGORY_ICONS: Record<string, string> = {
  'SÁCH KHUYẾN THIỆN': '📚',
  'KHÁC': '🌿',
  'CHUYỆN NHÂN QUẢ': '⚖️',
  'KINH PHẬT': '📖',
  'TRÌ CHÚ': '📿',
  'NGHI THỨC KHÁC': '🙏',
  'CÁC NGHI THỨC': '🙏'
};

export function categoryIcon(category: string): string {
  return ALL_CATEGORY_ICONS[category] ?? '🌿';
}

export const CATEGORY_LABELS_EN: Record<string, string> = {
  all: 'ALL',
  'SÁCH KHUYẾN THIỆN': 'VIRTUOUS BOOKS',
  'CHUYỆN NHÂN QUẢ': 'KARMA STORIES',
  'KINH PHẬT': 'BUDDHIST SUTRAS',
  'TRÌ CHÚ': 'MANTRAS',
  'CÁC NGHI THỨC': 'RITUALS',
  'NGHI THỨC KHÁC': 'OTHER RITUALS',
  'KHÁC': 'OTHER'
};

export function getCategoryLabel(key: string, isEn = false): string {
  if (isEn && CATEGORY_LABELS_EN[key]) return CATEGORY_LABELS_EN[key];
  const sec = LIBRARY_SECTIONS.find((s) => s.key === key);
  return sec?.label ?? key;
}
