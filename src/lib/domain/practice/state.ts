import { compareContentRecency } from '../content-recency';
import { normalizePracticeLogs, type PracticeLog, type PracticeType } from './logs';
import { getVietnamIsoDate } from './stats';

export type PracticeScreen = 'catalog' | 'preview' | 'practice' | 'rosary' | 'le-phat' | 'thanh-tinh' | 'precepts';
export type PracticeCategory = 'all' | 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | 'CÁC NGHI THỨC';

export interface PracticeArticleSummary {
  id: string;
  title: string;
  category: 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | 'CÁC NGHI THỨC';
  publishedAt: string;
  author: string;
  imageUrl: string;
  hasTableOfContents: boolean;
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  originalTitle?: string;
}

export interface PracticeArticleDetail extends PracticeArticleSummary {
  content: string;
  tocTitles: string[];
}

export interface PracticeChapterPreview {
  index: number;
  title: string;
  summary: string;
}

export interface PracticeChapterContent {
  index: number;
  title: string;
  content: string;
}

export interface PracticeExitDraft {
  count: number;
  date: string;
  note: string;
  type: PracticeType;
}

export interface PracticeExitState {
  committedRequestId: number | null;
  draft: PracticeExitDraft | null;
  open: boolean;
  requestId: number | null;
}

export const INITIAL_EXIT_STATE: PracticeExitState = {
  committedRequestId: null,
  draft: null,
  open: false,
  requestId: null
};

export function inferPracticeType(category: PracticeArticleDetail['category']): PracticeType {
  if (category === 'KINH PHẬT') return 'Tụng kinh';
  if (category === 'TRÌ CHÚ') return 'Trì chú';
  return 'Lễ Phật';
}

export function normalizePracticeCategory(
  rawCategory: string,
  title = '',
  tags: string[] = []
): 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | string {
  const cat = (rawCategory ?? '').trim().toUpperCase();
  if (cat === 'TRÌ CHÚ' || cat === 'TRI CHU') return 'TRÌ CHÚ';
  if (cat === 'NGHI THỨC KHÁC' || cat === 'NGHI THUC KHAC') return 'NGHI THỨC KHÁC';

  const text = `${title} ${tags.join(' ')}`.normalize('NFC').toLocaleLowerCase('vi');

  if (
    cat === 'CÁC NGHI THỨC' ||
    cat === 'CAC NGHI THUC' ||
    cat === 'NGHI THỨC' ||
    cat === 'NGHI THUC' ||
    cat === 'NGHI THỨC CŨ' ||
    cat === 'NGHI THUC CU'
  ) {
    if (
      text.includes('chú') ||
      text.includes('chu ') ||
      text.includes('đà la ni') ||
      text.includes('da la ni') ||
      text.includes('đà ra ni') ||
      text.includes('da ra ni') ||
      text.includes('đại bi') ||
      text.includes('lăng nghiêm') ||
      text.includes('lang nghiem')
    ) {
      return 'TRÌ CHÚ';
    }
    return 'NGHI THỨC KHÁC';
  }

  if (
    cat === 'KINH PHẬT' ||
    cat === 'KINH PHAT' ||
    cat === 'KINH ĐIỂN PHẬT GIÁO' ||
    cat === 'KINH DIEN PHAT GIAO' ||
    cat === 'KINH ĐIỂN' ||
    cat === 'KINH DIEN' ||
    cat === 'KINH'
  ) {
    if (
      text.includes('nghi thức sám hối') ||
      text.includes('nghi thuc sam hoi') ||
      text.includes('nghi thức') ||
      text.includes('nghi thuc')
    ) {
      return 'NGHI THỨC KHÁC';
    }
    if (text.includes('nghi thức trì chú') || text.includes('nghi thuc tri chu')) {
      return 'TRÌ CHÚ';
    }
    return 'KINH PHẬT';
  }

  return rawCategory;
}

export function createPracticeExitDraft(
  article: Pick<PracticeArticleDetail, 'category' | 'title'>,
  practiceCount: number,
  now = new Date()
): PracticeExitDraft {
  return {
    count: Math.max(1, practiceCount),
    date: getVietnamIsoDate(now),
    note: article.title ? `Công phu: ${article.title}` : '',
    type: inferPracticeType(article.category)
  };
}

export function openExitConfirmation(state: PracticeExitState, draft: PracticeExitDraft): PracticeExitState {
  const nextRequestId = (state.requestId ?? 0) + 1;
  return {
    committedRequestId: state.committedRequestId,
    draft,
    open: true,
    requestId: nextRequestId
  };
}

export function cancelExitConfirmation(state: PracticeExitState): PracticeExitState {
  return {
    ...state,
    draft: null,
    open: false
  };
}

export function confirmExitConfirmation(state: PracticeExitState): { next: PracticeExitState; shouldWrite: boolean } {
  const shouldWrite = state.open && state.requestId !== null && state.requestId !== state.committedRequestId;

  return {
    next: {
      committedRequestId: shouldWrite ? state.requestId : state.committedRequestId,
      draft: null,
      open: false,
      requestId: state.requestId
    },
    shouldWrite
  };
}

export function isDiaTangScripture(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    title.includes('địa tạng') ||
    title.includes('dia tang') ||
    title.includes('ksitigarbha') ||
    title.includes('earth store') ||
    id.includes('dia-tang') ||
    id.includes('dia_tang') ||
    id.includes('1780910773084') ||
    tags.some((tag) => tag.includes('địa tạng') || tag.includes('dia tang') || tag.includes('ksitigarbha'))
  );
}

export function isKimCangScripture(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    title.includes('kim cang') ||
    title.includes('kim cuong') ||
    title.includes('kim cương') ||
    title.includes('diamond') ||
    title.includes('vajracchedika') ||
    title.includes('vajra') ||
    id.includes('kim-cang') ||
    id.includes('kim_cang') ||
    id.includes('1781359043077') ||
    tags.some((tag) => /^(?:(?:kinh )?kim (?:cang|cương|cuong)|diamond(?: sutra)?|kinh kim cang bát nhã ba la mật)$/u.test(tag.trim()))
  );
}

export function isDieuPhapLienHoaScripture(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    title.includes('diệu pháp liên hoa') ||
    title.includes('dieu phap lien hoa') ||
    title.includes('pháp hoa') ||
    title.includes('phap hoa') ||
    title.includes('lotus') ||
    title.includes('saddharma') ||
    id.includes('phap-hoa') ||
    id.includes('dieu-phap-lien-hoa') ||
    id.includes('1787189827026_8b568f64') ||
    tags.some((tag) => tag.includes('diệu pháp liên hoa') || tag.includes('pháp hoa') || tag.includes('phap hoa') || tag.includes('lotus'))
  );
}

export function isLangNghiemScripture(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    title.includes('lăng nghiêm') ||
    title.includes('lang nghiem') ||
    title.includes('thủ lăng nghiêm') ||
    title.includes('thu lang nghiem') ||
    title.includes('shurangama') ||
    title.includes('surangama') ||
    title.includes('śūraṅgama') ||
    id.includes('lang-nghiem') ||
    id.includes('lang_nghiem') ||
    id.includes('1788482371938_34f43522') ||
    tags.some((tag) => tag.includes('lăng nghiêm') || tag.includes('lang nghiem') || tag.includes('shurangama') || tag.includes('surangama'))
  );
}

export function isChuLangNghiem(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    id.includes('1781275267452') ||
    ((title.includes('chú') || title.includes('chu') || title.includes('mantra') || tags.some((t) => t.includes('chú') || t.includes('mantra'))) &&
    (title.includes('lăng nghiêm') || title.includes('lang nghiem') || title.includes('shurangama') || title.includes('surangama') || title.includes('śūraṅgama') || tags.some((t) => t.includes('lăng nghiêm') || t.includes('shurangama'))))
  );
}

export function isChuDaiBi(article: { title?: string; id?: string; tags?: string[] }): boolean {
  const title = (article.title ?? '').normalize('NFC').toLocaleLowerCase('vi');
  const id = (article.id ?? '').toLowerCase();
  const tags = (article.tags ?? []).map((t) => t.normalize('NFC').toLocaleLowerCase('vi'));
  return (
    id.includes('1781274943336') ||
    title.includes('đại bi') ||
    title.includes('dai bi') ||
    title.includes('great compassion') ||
    title.includes('maha karuna') ||
    tags.some((t) => t.includes('đại bi') || t.includes('dai bi') || t.includes('great compassion'))
  );
}


export function getSutraPriorityRank(article: { title?: string; id?: string; tags?: string[] }): number {
  if (isDiaTangScripture(article)) return 1;
  if (isKimCangScripture(article)) return 2;
  if (isDieuPhapLienHoaScripture(article)) return 3;
  if (isLangNghiemScripture(article)) return 4;
  return 999;
}

export function getMantraPriorityRank(article: { title?: string; id?: string; tags?: string[] }): number {
  if (isChuLangNghiem(article)) return 1;
  if (isChuDaiBi(article)) return 2;
  return 999;
}

export function sortPracticeCatalog<T extends { title?: string; id?: string; tags?: string[]; updatedAt?: string; createdAt?: string; publishedAt?: string }>(
  articles: T[],
  category?: PracticeCategory
): T[] {
  return [...articles].sort((a, b) => {
    if (category === 'TRÌ CHÚ') {
      const aRank = getMantraPriorityRank(a);
      const bRank = getMantraPriorityRank(b);
      if (aRank !== bRank) return aRank - bRank;
    } else {
      const aRank = getSutraPriorityRank(a);
      const bRank = getSutraPriorityRank(b);
      if (aRank !== bRank) return aRank - bRank;
    }
    return compareContentRecency(a, b);
  });
}

export function filterPracticeCatalog(
  articles: PracticeArticleSummary[],
  query: string,
  category: PracticeCategory
): PracticeArticleSummary[] {
  const needle = query.trim().toLocaleLowerCase('vi');
  const filtered = articles.filter((article) => {
    // Bỏ nghi thức khỏi catalog nhưng giữ ID và dữ liệu công phu đã lưu.
    if (article.id === 'tt_1781742129070') return false;
    if (category !== 'all') {
      if (category === 'KINH PHẬT') {
        if (article.category !== 'KINH PHẬT') return false;
      } else if (category === 'TRÌ CHÚ') {
        if (article.category !== 'TRÌ CHÚ') return false;
      } else if (category === 'NGHI THỨC KHÁC' || category === 'CÁC NGHI THỨC') {
        if (article.category !== 'NGHI THỨC KHÁC' && article.category !== 'CÁC NGHI THỨC') return false;
      } else if (article.category !== category) {
        return false;
      }
    }
    if (!needle) return true;
    const extra = (article as { originalTitle?: string }).originalTitle ?? '';
    return `${article.title} ${extra} ${article.tags.join(' ')}`.toLocaleLowerCase('vi').includes(needle);
  });
  return sortPracticeCatalog(filtered, category);
}


export function mergePracticeLogs(localLogs: PracticeLog[], cloudLogs: PracticeLog[]): PracticeLog[] {
  const map = new Map<string, PracticeLog>();
  for (const log of cloudLogs ?? []) {
    if (log && log.id !== undefined && log.id !== null) {
      map.set(String(log.id), log);
    }
  }
  for (const log of localLogs ?? []) {
    if (log && log.id !== undefined && log.id !== null) {
      const key = String(log.id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, log);
      } else {
        const existingTime = Date.parse(existing.created) || 0;
        const localTime = Date.parse(log.created) || 0;
        if (localTime > existingTime) {
          map.set(key, log);
        }
      }
    }
  }
  return normalizePracticeLogs(Array.from(map.values()));
}
