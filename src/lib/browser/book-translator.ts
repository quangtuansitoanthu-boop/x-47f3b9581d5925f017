/**
 * Bộ dịch nội dung sách tự động và lưu bộ nhớ đệm Offline (IndexedDB).
 * Sử dụng cơ chế máy dịch Google tự động, miễn phí 100%, không tốn token.
 * Sau khi dịch, toàn bộ dữ liệu lưu đệm vĩnh viễn vào bộ nhớ app (IndexedDB + RAM)
 * để những lần sau mở sách sẽ tải NGAY LẬP TỨC (0ms) và hoạt động hoàn hảo khi mất mạng.
 */

const DB_NAME = 'tutam_translations_db';
const DB_VERSION = 1;
const STORE_NAME = 'book_translations';

interface StoredTranslation {
  id: string; // docId_lang
  docId: string;
  lang: string;
  title: string;
  content: string;
  timestamp: number;
}

// In-memory cache cho tốc độ truy cập 0ms (ngay lập tức) trong toàn bộ phiên đọc
const memoryCache = new Map<string, { title: string; content: string }>();
const chaptersMemoryCache = new Map<string, Record<string, { tieu_de: string; tom_tat?: string }>>();

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }
  return dbPromise;
}

/** Lấy bản dịch đồng bộ từ RAM cache (trả về tức thì 0ms nếu đã từng đọc/nạp) */
export function getCachedTranslationSync(
  docId: string,
  lang = 'en'
): { title: string; content: string } | null {
  const key = `${docId}_${lang}`;
  return memoryCache.get(key) || null;
}

/** Lấy bản dịch mục lục đồng bộ từ RAM cache */
export function getCachedChaptersSync(
  bookId: string,
  lang = 'en'
): Record<string, { tieu_de: string; tom_tat?: string }> | null {
  const key = `${bookId}_chapters_${lang}`;
  return chaptersMemoryCache.get(key) || null;
}

/** Đọc bản dịch từ bộ nhớ IndexedDB */
export async function getCachedTranslation(
  docId: string,
  lang = 'en'
): Promise<{ title: string; content: string } | null> {
  const cacheKey = `${docId}_${lang}`;
  const memHit = memoryCache.get(cacheKey);
  if (memHit) return memHit;

  try {
    const db = await getDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cacheKey);
      req.onsuccess = () => {
        const record = req.result as StoredTranslation | undefined;
        if (record && record.content) {
          const hit = { title: record.title, content: record.content };
          memoryCache.set(cacheKey, hit);
          resolve(hit);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Lưu bản dịch vào IndexedDB và RAM Cache */
export async function setCachedTranslation(
  docId: string,
  title: string,
  content: string,
  lang = 'en'
): Promise<void> {
  const cacheKey = `${docId}_${lang}`;
  memoryCache.set(cacheKey, { title, content });

  try {
    const db = await getDb();
    if (!db) return;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        id: cacheKey,
        docId,
        lang,
        title,
        content,
        timestamp: Date.now(),
      } satisfies StoredTranslation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Không để lỗi cache làm gián đoạn trải nghiệm đọc
  }
}

/** Nạp trước các bản dịch đã có của một cuốn sách từ IndexedDB vào RAM */
export async function preloadBookTranslations(bookId: string, lang = 'en'): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const record = cursor.value as StoredTranslation;
        if (record && record.lang === lang && record.docId.startsWith(bookId)) {
          memoryCache.set(record.id, { title: record.title, content: record.content });
          if (record.id === `${bookId}_chapters_${lang}`) {
            try {
              chaptersMemoryCache.set(record.id, JSON.parse(record.content));
            } catch {}
          }
        }
        cursor.continue();
      }
    };
  } catch {}
}

/** Dịch một đoạn văn bản qua Google Translate */
async function translateChunk(text: string, targetLang = 'en', sourceLang = 'vi'): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;
  try {
    const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${sourceLang}&tl=${targetLang}&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) return text;
    const data = await response.json();
    if (Array.isArray(data) && typeof data[0] === 'string') {
      return data[0];
    }
    return text;
  } catch {
    return text;
  }
}

/**
 * Tự động chia đoạn văn thông minh và dịch song song để đạt tốc độ tối đa
 */
export async function translateText(
  text: string,
  targetLang = 'en',
  sourceLang = 'vi'
): Promise<string> {
  if (!text || !text.trim() || targetLang === sourceLang) return text;

  // Nếu chuỗi ngắn dưới 1500 ký tự: dịch trong 1 request duy nhất (siêu tốc)
  if (text.length <= 1500) {
    return translateChunk(text, targetLang, sourceLang);
  }

  // Nếu nội dung HTML có thẻ <p>, nhóm các đoạn thành các cụm ~1500 ký tự
  if (text.includes('</p>')) {
    const parts = text.split(/(<\/p>)/i);
    // Ghép các thẻ <p> thành từng khối gom ~1500 ký tự để giảm thiểu số lượng HTTP request
    const chunks: Array<{ text: string; indices: number[] }> = [];
    let currentChunk = '';
    let currentIndices: number[] = [];

    for (let i = 0; i < parts.length; i += 2) {
      const paragraph = parts[i];
      const closer = parts[i + 1] || '';
      const combined = paragraph + closer;
      if (!paragraph.trim()) {
        continue;
      }
      if (currentChunk.length + combined.length > 1500 && currentChunk.length > 0) {
        chunks.push({ text: currentChunk, indices: currentIndices });
        currentChunk = combined;
        currentIndices = [i];
      } else {
        currentChunk += (currentChunk ? '\n' : '') + combined;
        currentIndices.push(i);
      }
    }
    if (currentChunk) {
      chunks.push({ text: currentChunk, indices: currentIndices });
    }

    // Nếu chỉ có 1 khối
    if (chunks.length <= 1) {
      return translateChunk(text, targetLang, sourceLang);
    }

    // Dịch các khối với giới hạn đồng thời (concurrency = 3) để tránh bị chặn
    const translatedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const slice = chunks.slice(i, i + 3);
      const res = await Promise.all(slice.map(c => translateChunk(c.text, targetLang, sourceLang)));
      translatedChunks.push(...res);
    }
    return translatedChunks.join('\n');
  }

  // Tách theo dòng mới nếu là plain text
  const paragraphs = text.split('\n');
  const chunks: string[] = [];
  let cur = '';
  for (const p of paragraphs) {
    if (!p.trim()) continue;
    if (cur.length + p.length > 1500 && cur.length > 0) {
      chunks.push(cur);
      cur = p;
    } else {
      cur += (cur ? '\n' : '') + p;
    }
  }
  if (cur) chunks.push(cur);

  if (chunks.length <= 1) {
    return translateChunk(text, targetLang, sourceLang);
  }

  const results: string[] = [];
  for (let i = 0; i < chunks.length; i += 3) {
    const slice = chunks.slice(i, i + 3);
    const res = await Promise.all(slice.map(c => translateChunk(c, targetLang, sourceLang)));
    results.push(...res);
  }
  return results.join('\n');
}

/**
 * Hàm tổng hợp: Lấy bản dịch tiếng Anh từ bộ nhớ app (IndexedDB / RAM) nếu có;
 * nếu chưa có thì dịch ngầm và tự động lưu vào máy để lần sau mở tải ngay lập tức.
 */
export async function getOrTranslateContent(
  docId: string,
  rawTitle: string,
  rawContent: string,
  targetLang = 'en'
): Promise<{ title: string; content: string; fromCache: boolean; isOriginal: boolean }> {
  if (targetLang === 'vi') {
    return { title: rawTitle, content: rawContent, fromCache: false, isOriginal: true };
  }

  // 1. Kiểm tra RAM cache trước (0ms)
  const syncHit = getCachedTranslationSync(docId, targetLang);
  if (syncHit) {
    return { title: syncHit.title, content: syncHit.content, fromCache: true, isOriginal: false };
  }

  // 2. Kiểm tra bộ nhớ IndexedDB
  const cached = await getCachedTranslation(docId, targetLang);
  if (cached) {
    return { title: cached.title, content: cached.content, fromCache: true, isOriginal: false };
  }

  // 3. Nếu đang offline và chưa có cache -> trả về bản gốc an toàn
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { title: rawTitle, content: rawContent, fromCache: false, isOriginal: true };
  }

  // 4. Có mạng: Tự động dịch ngầm tiêu đề và nội dung
  try {
    const [transTitle, transContent] = await Promise.all([
      rawTitle ? translateText(rawTitle, targetLang, 'vi') : Promise.resolve(rawTitle),
      rawContent ? translateText(rawContent, targetLang, 'vi') : Promise.resolve(rawContent),
    ]);

    // 5. Lưu ngay vào bộ nhớ máy (IndexedDB + RAM) để lần sau đọc nhanh tức thì & dùng offline
    void setCachedTranslation(docId, transTitle, transContent, targetLang);

    return { title: transTitle, content: transContent, fromCache: false, isOriginal: false };
  } catch {
    // Nếu gặp lỗi mạng, giữ an toàn bản gốc
    return { title: rawTitle, content: rawContent, fromCache: false, isOriginal: true };
  }
}

/**
 * Dịch toàn bộ mục lục (các tựa đề chương/phẩm) của một cuốn sách và lưu đệm IndexedDB.
 */
export async function getOrTranslateChapters(
  bookId: string,
  chapters: Array<{ id: string; tieu_de: string; tom_tat?: string }>,
  targetLang = 'en'
): Promise<Record<string, { tieu_de: string; tom_tat?: string }>> {
  if (!chapters.length || targetLang === 'vi') return {};

  const cacheKey = `${bookId}_chapters_${targetLang}`;

  // Kiểm tra RAM cache
  const memHit = chaptersMemoryCache.get(cacheKey);
  if (memHit) return memHit;

  // Kiểm tra IndexedDB cache
  const cached = await getCachedTranslation(cacheKey, targetLang);
  if (cached && cached.content) {
    try {
      const parsed = JSON.parse(cached.content) as Record<string, { tieu_de: string; tom_tat?: string }>;
      if (parsed && typeof parsed === 'object') {
        chaptersMemoryCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch {}
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {};
  }

  try {
    // Ghép các tựa đề thành danh sách để dịch 1 lượt siêu nhanh
    const titles = chapters.map((c, i) => `${i}|||${c.tieu_de || `Tập ${i + 1}`}`);
    const joined = titles.join('\n');
    const translatedJoined = await translateText(joined, targetLang, 'vi');
    const lines = translatedJoined.split('\n');

    const result: Record<string, { tieu_de: string; tom_tat?: string }> = {};
    for (const line of lines) {
      const sepIdx = line.indexOf('|||');
      if (sepIdx !== -1) {
        const idx = Number(line.slice(0, sepIdx).trim());
        const transTitle = line.slice(sepIdx + 3).trim();
        if (Number.isInteger(idx) && chapters[idx]) {
          result[chapters[idx].id] = { tieu_de: transTitle };
        }
      }
    }

    if (Object.keys(result).length > 0) {
      chaptersMemoryCache.set(cacheKey, result);
      void setCachedTranslation(cacheKey, 'Chapters Translation', JSON.stringify(result), targetLang);
    }
    return result;
  } catch {
    return {};
  }
}

