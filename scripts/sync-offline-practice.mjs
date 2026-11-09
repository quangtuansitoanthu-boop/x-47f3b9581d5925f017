import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Chỉ đọc API công khai; mặc định xem trước, không đụng kho dữ liệu người dùng.
const root = fileURLToPath(new URL('../', import.meta.url));
const apply = process.argv.includes('--apply');
// Sửa riêng chương không luôn đổi timestamp bài cha; bật cờ này khi cần rà lại các chương.
const refreshChapters = process.argv.includes('--refresh-chapters');
const bundlePaths = ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json'];
const current = JSON.parse(fs.readFileSync(path.join(root, bundlePaths[0]), 'utf8'));
const existing = new Map(current.map(row => [row.id, row]));
let requests = 0;
let bytes = 0;
async function readRows(endpoint, params) {
  const url = new URL(endpoint, 'https://quangtu.vn');
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } });
  requests++;
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
  const text = await response.text();
  bytes += Buffer.byteLength(text);
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error(`Invalid rows: ${url.pathname}`);
  return rows;
}
async function paged(endpoint, params) {
  const rows = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const page = await readRows(endpoint, { ...params, limit: '100', offset: String(offset) });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
  throw new Error(`Pagination exceeded: ${endpoint}`);
}
const timestamp = value => Date.parse(String(value ?? '').replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1').replace(/\+00$/, '+00:00'));
const catalog = await paged('/api/articles', {
  select: 'id,tieu_de,danh_muc,has_muc_luc,updated_at', order: 'id.asc',
});
if (new Set(catalog.map(row => row.id)).size !== catalog.length) throw new Error('Duplicate catalog IDs');
const categories = new Set([
  'KINH PHẬT', 'KINH PHAT', 'KINH ĐIỂN PHẬT GIÁO', 'KINH DIEN PHAT GIAO', 'KINH',
  'TRÌ CHÚ', 'TRI CHU', 'CÁC NGHI THỨC', 'CAC NGHI THUC',
  'NGHI THỨC KHÁC', 'NGHI THUC KHAC', 'NGHI THỨC', 'NGHI THUC',
]);
const isPracticeCategory = category => categories.has(String(category ?? '').trim().toUpperCase());
const candidates = catalog.filter(row => isPracticeCategory(row.danh_muc) &&
  (!existing.has(row.id) || timestamp(row.updated_at) > timestamp(existing.get(row.id).updated_at)
    || (refreshChapters && Boolean(row.has_muc_luc)
      && timestamp(row.updated_at) >= timestamp(existing.get(row.id).updated_at))));
console.log(JSON.stringify({ mode: apply ? 'apply' : 'preview', refreshChapters, candidates }, null, 2));
if (apply) {
  const staged = [];
  const covers = new Map();
  for (const candidate of candidates) {
    if (!/^[a-zA-Z0-9_-]+$/.test(candidate.id)) throw new Error('Unsafe article ID');
    const rows = await readRows('/api/articles', { id: `eq.${candidate.id}`, limit: '1' });
    const article = rows[0];
    if (!article || article.id !== candidate.id || !isPracticeCategory(article.danh_muc)) throw new Error('Article mismatch');
    if (article.pdf_url || article.link_ngoai) throw new Error(`External content needs separate review: ${article.id}`);
    const chapters = article.has_muc_luc ? await paged('/api/data/tap_noi_dung', {
      bai_viet_id: `eq.${article.id}`, order: 'so_thu_tu.asc',
    }) : [];
    if (article.has_muc_luc && (!chapters.length || !chapters.every(row => row.bai_viet_id === article.id && typeof row.noi_dung === 'string' && row.noi_dung.trim()))) {
      throw new Error(`Incomplete chapters: ${article.id}`);
    }
    if (!chapters.length && !article.noi_dung?.trim()) throw new Error(`Empty article: ${article.id}`);
    // Resolver ưu tiên file chương: thay bản mục lục cũ bằng toàn văn mới khi bài chuyển sang nội dung đơn.
    if (!article.has_muc_luc && fs.existsSync(path.join(root, 'static/offline-data/chapters', `${article.id}.json`))) {
      chapters.push({
        id: `${article.id}_full`, bai_viet_id: article.id, so_thu_tu: 0,
        tieu_de: article.tieu_de, tom_tat: article.tom_tat ?? '', noi_dung: article.noi_dung,
      });
    }
    // Giữ ảnh bìa cục bộ đã chọn và các field riêng của bundle.
    const previous = existing.get(article.id);
    const next = { ...previous, ...article, is_pdf_book: false, bundled_offline: true };
    if (previous?.anh_url && !/^https?:/.test(previous.anh_url)) next.anh_url = previous.anh_url;
    else if (article.anh_url) {
      const coverUrl = new URL(article.anh_url, 'https://quangtu.vn');
      if (!['quangtu.vn', 'media.quangtu.vn'].includes(coverUrl.hostname) || coverUrl.protocol !== 'https:') throw new Error('Cover requires review');
      const filename = path.basename(coverUrl.pathname);
      if (!/^[\w.-]+\.(webp|png|jpe?g)$/i.test(filename)) throw new Error('Invalid cover filename');
      next.anh_url = `covers/${filename}`;
      if (!fs.existsSync(path.join(root, 'static', next.anh_url)) && !covers.has(filename)) {
        const response = await fetch(coverUrl, { signal: AbortSignal.timeout(30_000) });
        requests++;
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Invalid cover: ${filename}`);
        const content = Buffer.from(await response.arrayBuffer());
        bytes += content.length;
        covers.set(filename, content);
      }
    }
    staged.push({ article: next, chapters });
  }
  // Chỉ ghi sau khi toàn bộ bài/chương đã tải và kiểm tra thành công.
  for (const [filename, content] of covers) fs.writeFileSync(path.join(root, 'static/covers', filename), content);
  for (const { article, chapters } of staged) {
    const index = current.findIndex(row => row.id === article.id);
    if (index < 0) current.push(article); else current[index] = article;
    if (chapters.length) fs.writeFileSync(path.join(root, 'static/offline-data/chapters', `${article.id}.json`), JSON.stringify(chapters));
    console.log(`${article.id}: ${chapters.length} chapters`);
  }
  for (const file of bundlePaths) fs.writeFileSync(path.join(root, file), JSON.stringify(current));
}
console.log(JSON.stringify({ requests, payloadBytes: bytes, writesToServer: 0 }));
