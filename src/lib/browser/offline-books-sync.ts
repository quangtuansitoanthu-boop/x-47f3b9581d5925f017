import type { LibraryArticle } from '$lib/components/library/article';
import { isOnlineOnlyBook } from '$lib/domain/online-only-policy';
import { isContentAvailable } from './ios-content-policy';
import { isHtmlResponse, resolveApiUrl } from '$lib/browser/native-api';
import offlineArticlesRaw from '$lib/data/offline-bundled-articles.json';

export const DOWNLOADED_BOOKS_STORAGE_KEY = 'tutam_downloaded_books_v1';
export const DISMISSED_NEW_BOOKS_STORAGE_KEY = 'tutam_dismissed_new_books_v1';
const CACHE_NAME = 'tutam-api-v1';
const CACHE_ORIGIN = 'https://tutam-cache.local';

export interface DownloadedBookInfo {
  id: string;
  title: string;
  downloadedAt: number;
  chapterCount: number;
  updatedAt?: string;
}

// Tập hợp ID các sách đã được đóng gói sẵn trong file app tĩnh
const bundledArticles = Array.isArray(offlineArticlesRaw) ? offlineArticlesRaw : [];
const bundledBookIds = new Set<string>(
  bundledArticles
    .filter((a: any) => Boolean(a.has_muc_luc || (Number(a.so_tap || 0) > 0)))
    .map((a: any) => String(a.id || ''))
);

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {}
  return null;
}

export function readDownloadedBooks(): Record<string, DownloadedBookInfo> {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(DOWNLOADED_BOOKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveDownloadedBooks(books: Record<string, DownloadedBookInfo>): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DOWNLOADED_BOOKS_STORAGE_KEY, JSON.stringify(books));
  } catch {}
}

/** Chỉ gọi sau khi gói nội dung đã lưu và kiểm tra đầy đủ. */
export function rememberCompletedBook(info: DownloadedBookInfo): void {
  saveDownloadedBooks({ ...readDownloadedBooks(), [info.id]: info });
}

export function isBookOffline(bookId: string): boolean {
  if (!bookId || !isContentAvailable({ id: bookId })) return false;
  if (isOnlineOnlyBook(null, null, bookId)) return false;
  if (bundledBookIds.has(bookId)) return true;
  const downloaded = readDownloadedBooks();
  return Boolean(downloaded[bookId]);
}

/**
 * Kiểm tra xem một bài viết có phải là sách thường (không phải sách bản quyền chỉ đọc online)
 */
export function isRegularBook(article: LibraryArticle): boolean {
  if (!article || !isContentAvailable(article)) return false;
  const isEbook = Boolean(article.hasTableOfContents || (article.volumeCount && article.volumeCount > 0));
  if (!isEbook) return false;
  if (isOnlineOnlyBook(article.title, article.author, article.id)) return false;
  return true;
}

/**
 * Lấy danh sách các sách thường mới từ web mà máy chưa có offline.
 */
export function findNewWebBooks(articles: LibraryArticle[]): LibraryArticle[] {
  if (!Array.isArray(articles) || articles.length === 0) return [];
  const downloaded = readDownloadedBooks();

  return articles.filter((art) => {
    if (!isRegularBook(art)) return false;
    // Đã có sẵn trong bộ cài app
    if (bundledBookIds.has(art.id)) return false;
    // Đã tải về máy rồi
    if (downloaded[art.id]) return false;
    return true;
  });
}

export function readDismissedBookIds(): Set<string> {
  const storage = getStorage();
  if (!storage) return new Set();
  try {
    const raw = storage.getItem(DISMISSED_NEW_BOOKS_STORAGE_KEY);
    if (!raw) return new Set();
    const list = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function dismissNewBooks(bookIds: string[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    const current = readDismissedBookIds();
    bookIds.forEach((id) => current.add(id));
    storage.setItem(DISMISSED_NEW_BOOKS_STORAGE_KEY, JSON.stringify([...current]));
  } catch {}
}

async function cacheJson(path: string, payload: unknown): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('offline_book_cache_unavailable');
  const cache = await caches.open(CACHE_NAME);
  const key = `${CACHE_ORIGIN}${path}`;
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'x-tutam-cached-at': new Date().toISOString()
    }
  });
  await cache.put(key, response);
}

export function purgeOnlineOnlyBooksFromOfflineStorage(): void {
  const downloaded = readDownloadedBooks();
  let changed = false;
  for (const id of Object.keys(downloaded)) {
    if (isOnlineOnlyBook(downloaded[id]?.title, null, id)) {
      delete downloaded[id];
      changed = true;
    }
  }
  if (changed) {
    saveDownloadedBooks(downloaded);
  }
}

/**
 * Tự động tải trọn bộ một cuốn sách về máy (metadata + toàn bộ các chương) để đọc offline.
 */
export async function downloadBookOffline(
  book: LibraryArticle,
  onProgress?: (step: string) => void
): Promise<boolean> {
  if (!isContentAvailable(book) || isOnlineOnlyBook(book.title, book.author, book.id)) {
    throw new Error('Sách này chỉ được đọc trực tuyến, không hỗ trợ tải về máy.');
  }

  onProgress?.(`Đang tải mục lục sách "${book.title}"...`);

  // 1. Tải danh sách chương
  const chaptersEndpoint = `/api/articles/${encodeURIComponent(book.id)}/chapters?order=so_thu_tu.asc&limit=5000`;
  const chaptersUrl = resolveApiUrl(chaptersEndpoint);
  const chaptersRes = await fetch(chaptersUrl, { headers: { accept: 'application/json' } });
  if (!chaptersRes.ok || isHtmlResponse(chaptersRes)) {
    throw new Error('Không thể tải mục lục sách từ máy chủ.');
  }
  const chapters: unknown = await chaptersRes.json();
  if (!Array.isArray(chapters) || chapters.some(ch => !ch || typeof ch !== 'object' || Array.isArray(ch))
    || (!chapters.length && (book.hasTableOfContents || book.volumeCount > 0 || !book.content.trim()))) {
    throw new Error('Định dạng mục lục sách không hợp lệ.');
  }

  // 2. Tải và cache nội dung từng chương nếu chương chưa có nội dung nhúng
  const total = chapters.length;
  for (let i = 0; i < total; i++) {
    const ch = chapters[i];
    if (typeof ch.noi_dung !== 'string' || !ch.noi_dung.trim()) {
      const order = Number(ch.so_thu_tu);
      if (ch.so_thu_tu == null || ch.so_thu_tu === '' || !Number.isSafeInteger(order) || order < 0) {
        throw new Error('offline_book_invalid_chapter');
      }
      onProgress?.(`Đang lưu chương ${i + 1}/${total}...`);
      const singleChapPath = `/api/articles/${encodeURIComponent(book.id)}/chapters?so_thu_tu=eq.${order}&limit=5000`;
      const chapRes = await fetch(resolveApiUrl(singleChapPath), { headers: { accept: 'application/json' } });
      if (!chapRes.ok || isHtmlResponse(chapRes)) throw new Error('offline_book_chapter_download_failed');
      const chapPayload: unknown = await chapRes.json();
      const complete = Array.isArray(chapPayload) ? chapPayload.find(row => row && typeof row === 'object'
        && !Array.isArray(row) && Number(row.so_thu_tu) === order
        && (ch.id == null || String(row.id) === String(ch.id))
        && typeof row.noi_dung === 'string' && row.noi_dung.trim()) : null;
      if (!complete) {
        throw new Error('offline_book_incomplete_chapter');
      }
      await cacheJson(singleChapPath, [complete]);
      chapters[i] = { ...ch, ...complete };
    }
  }

  // 3. Cache thông tin chi tiết bài viết
  await cacheJson(`/api/articles/${encodeURIComponent(book.id)}`, book);
  // Chỉ thay mục lục cũ sau khi mọi chương đã đầy đủ; cache từng chương vẫn giữ để thử lại.
  await cacheJson(chaptersEndpoint, chapters);

  // 4. Lưu vào danh sách đã tải
  const downloaded = readDownloadedBooks();
  downloaded[book.id] = {
    id: book.id,
    title: book.title,
    downloadedAt: Date.now(),
    chapterCount: total,
    updatedAt: book.updatedAt
  };
  const storage = getStorage();
  if (!storage) throw new Error('offline_book_storage_unavailable');
  storage.setItem(DOWNLOADED_BOOKS_STORAGE_KEY, JSON.stringify(downloaded));

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('quangtu:offline-books-updated', { detail: { bookId: book.id } }));
  }

  return true;
}

/**
 * Tải toàn bộ danh sách sách mới về máy
 */
export async function downloadAllNewBooks(
  books: LibraryArticle[],
  onStatus?: (current: number, total: number, title: string) => void
): Promise<number> {
  let count = 0;
  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    onStatus?.(i + 1, books.length, b.title);
    try {
      await downloadBookOffline(b);
      count++;
    } catch (err) {
      console.warn(`Lỗi khi tải sách ${b.title}:`, err);
    }
  }
  return count;
}
