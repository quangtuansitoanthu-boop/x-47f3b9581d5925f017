import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import missionImages from '../src/lib/data/mission-book-images.json' with { type: 'json' };

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const safeId = id => typeof id === 'string' && /^[\w.-]+$/u.test(id);

export async function syncOfflineContent({ root = process.cwd(), fetcher = fetch } = {}) {
  const read = (file, fallback) => fs.existsSync(path.join(root, file))
    ? JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) : fallback;
  let requests = 0;
  let payloadBytes = 0;
  async function json(params, endpoint = '/api/content-updates') {
    const url = new URL(endpoint, 'https://quangtu.vn');
    url.search = new URLSearchParams(params).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(30_000), headers: { accept: 'application/json' } });
    requests++;
    if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
    const text = await response.text();
    payloadBytes += Buffer.byteLength(text);
    return JSON.parse(text);
  }
  const items = [];
  const query = {};
  for (let pageNumber = 0; ; pageNumber++) {
    if (pageNumber >= 1000) throw new Error('Catalog pagination exceeded');
    const page = await json(query);
    if (!Array.isArray(page.items)) throw new Error('Invalid catalog');
    items.push(...page.items);
    for (const name of ['articles', 'talks']) {
      const next = page[`${name}Next`];
      if (next === null) query[`${name}Done`] = '1';
      else {
        if (typeof next !== 'string' || !next || next === query[`${name}After`]) throw new Error('Invalid catalog cursor');
        query[`${name}After`] = next;
      }
    }
    if (page.articlesNext === null && page.talksNext === null) break;
  }
  if (new Set(items.map(item => `${item.kind}:${item.row?.id}`)).size !== items.length) throw new Error('Duplicate catalog IDs');
  // Legacy data adapter không phân trang offset; tuyệt đối không lặp lại trang đầu.
  const chapterIndex = await json({ select: 'id,bai_viet_id,so_thu_tu,updated_at', order: 'id.asc', limit: '5000' }, '/api/data/tap_noi_dung');
  if (!Array.isArray(chapterIndex) || chapterIndex.length >= 5000
    || new Set(chapterIndex.map(row => row.id)).size !== chapterIndex.length) throw new Error('Incomplete chapter index: server pagination required');
  console.log(`Web snapshot: ${items.length} catalog items, ${chapterIndex.length} chapter revisions.`);
  const previous = read('src/lib/data/offline-content-versions.json', {});
  const existing = new Map(read('src/lib/data/offline-bundled-articles.json', []).map(row => [row.id, row]));
  // Catalog cập nhật chỉ gồm các nhóm tải offline; giữ các mục ngoài phạm vi đó.
  const articles = new Map(existing);
  const talks = new Map(read('src/lib/data/offline-talks.json', []).map(row => [row.id, row]));
  const staged = new Map();
  const versions = {};
  let changedArticles = 0;
  for (const item of items) {
    if (!safeId(item.row?.id) || !/^[a-f0-9]{64}$/u.test(item.version) || !['article', 'talk'].includes(item.kind)) throw new Error('Invalid catalog item');
    const id = item.row.id;
    if (item.kind === 'talk') { talks.set(id, item.row); continue; }
    const index = chapterIndex.filter(row => row.bai_viet_id === id);
    const revision = digest([item.version, index]);
    const chapterFile = `static/offline-data/chapters/${id}.json`;
    const old = existing.get(id);
    if (item.mode === 'shell') {
      articles.set(id, { ...item.row, is_pdf_book: true, bundled_offline: false });
    } else if (old && previous[id]?.revision === revision
      && previous[id].content === digest([old, read(chapterFile, [])]) && index.every(row => row.updated_at)
      && (!index.length || fs.existsSync(path.join(root, chapterFile)))) {
      // Giữ toàn văn đã xác minh; chỉ thay metadata bằng cùng snapshot web.
      articles.set(id, { ...old, ...item.row });
    } else {
      console.log(`Refreshing bundled article: ${id}`);
      let cursor = null;
      let article;
      const chapters = [];
      for (let pageNumber = 0; ; pageNumber++) {
        if (pageNumber >= 10000) throw new Error(`Chapter pagination exceeded: ${id}`);
        const params = { action: 'article', id, version: item.version };
        if (cursor !== null) params.after = String(cursor);
        const page = await json(params);
        if (page.article?.id !== id || !Array.isArray(page.chapters)) throw new Error(`Invalid article: ${id}`);
        if (!article) article = page.article;
        chapters.push(...page.chapters);
        if (page.next === null) break;
        if (!Number.isSafeInteger(page.next) || (cursor !== null && page.next <= cursor)) throw new Error(`Invalid chapter cursor: ${id}`);
        cursor = page.next;
      }
      if (chapters.length !== index.length || new Set(chapters.map(row => row.id)).size !== chapters.length
        || chapters.some(row => !index.some(meta => String(meta.id) === String(row.id) && meta.so_thu_tu === row.so_thu_tu
          && (meta.updated_at ?? '') === (row.updated_at ?? '')) || !String(row.noi_dung ?? '').trim())
        || (!chapters.length && !String(article.noi_dung ?? '').trim())) throw new Error(`Incomplete or changed article: ${id}`);
      articles.set(id, { ...article, is_pdf_book: false, bundled_offline: true });
      // Resolver ưu tiên file chương cũ, kể cả khi web đã chuyển sang bài một phần.
      staged.set(chapterFile, chapters.length ? chapters : [{ id: `${id}_full`, bai_viet_id: id, so_thu_tu: 0, tieu_de: article.tieu_de, noi_dung: article.noi_dung }]);
      changedArticles++;
    }
    versions[id] = { revision };
  }
  for (const [rows, field] of [[articles, 'anh_url'], [talks, 'anh_dai_dien']]) {
    for (const row of rows.values()) {
      if (!row[field]) continue;
      if (row.id === 'tt_1783429280091_jcrra' || (typeof row[field] === 'string' && row[field].includes('tho-khang-bao-giam.jpg'))) {
        const hash = row[field].includes('#') ? '#' + row[field].split('#').slice(1).join('#') : '';
        row[field] = 'covers/tho-khang-bao-giam.jpg' + (hash || '#pos=54%25%206%25');
        continue;
      }
      const url = new URL(row[field], 'https://media.quangtu.vn/');
      if (url.protocol !== 'https:' || !['media.quangtu.vn', 'quangtu.vn'].includes(url.hostname)) continue;
      const relative = decodeURIComponent(url.pathname.replace(/^\/api\/media\//u, '/')).slice(1);
      if (!relative.startsWith('covers/') || relative.includes('\\') || relative.includes('\0')
        || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid cover path');
      const target = path.join(root, 'static', relative);
      if (!fs.existsSync(target) && !staged.has(`static/${relative}`)) {
        url.pathname = '/' + relative;
        url.hash = '';
        const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
        requests++;
        if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Invalid cover: ${relative}`);
        const image = Buffer.from(await response.arrayBuffer());
        payloadBytes += image.length;
        staged.set(`static/${relative}`, image);
      }
      row[field] = relative + new URL(row[field], 'https://media.quangtu.vn/').hash;
    }
  }
  // Converted books ship their original illustrations with their complete text.
  // Stage everything before writing, so an image failure cannot publish a half bundle.
  const convertedSources = new Map();
  const imageExtension = bytes => bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
      : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'webp' : null;
  for (const [id, article] of articles) {
    const chapterFile = `static/offline-data/chapters/${id}.json`;
    const chapters = staged.get(chapterFile) ?? read(chapterFile, []);
    if (![article.noi_dung, ...chapters.map(row => row.noi_dung)].some(text => typeof text === 'string' && text.includes('tt-converted-book'))) continue;
    const manifest = new Map();
    const localize = async html => {
      if (typeof html !== 'string') return html;
      const matches = [...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/giu)];
      for (const match of matches) {
        const source = match[1].replaceAll('&amp;', '&');
        let local;
        let bytes;
        if (source.startsWith('/assets/book-content/converted/')) {
          if (!/^\/assets\/book-content\/converted\/[a-f0-9]+\.(?:png|jpeg|webp)$/u.test(source)) throw new Error(`Invalid illustration path: ${id}`);
          local = source;
          bytes = staged.get(source.slice(1)) ?? (fs.existsSync(path.join(root, source)) ? fs.readFileSync(path.join(root, source)) : null);
          if (!bytes || !imageExtension(bytes)) throw new Error(`Missing bundled illustration: ${id}`);
        } else {
          const url = new URL(source, 'https://media.quangtu.vn');
          if (url.protocol !== 'https:' || !['media.quangtu.vn', 'quangtu.vn'].includes(url.hostname)
            || url.username || url.password) throw new Error(`Unsupported illustration source: ${id}`);
          if (url.pathname.startsWith('/api/media/')) { url.hostname = 'media.quangtu.vn'; url.pathname = url.pathname.replace(/^\/api\/media\//u, '/'); }
          url.hash = '';
          let entry = convertedSources.get(url.href);
          if (!entry) {
            const key = createHash('sha256').update(url.href).digest('hex');
            const old = previous[id]?.images?.find(image => image.source === url.href);
            if (old && /^\/assets\/book-content\/converted\/[a-f0-9]+\.(?:png|jpeg|webp)$/u.test(old.path)
              && fs.existsSync(path.join(root, old.path))) {
              const stored = fs.readFileSync(path.join(root, old.path));
              if (stored.length === old.bytes && createHash('sha256').update(stored).digest('hex') === old.sha256) entry = { local: old.path, bytes: stored };
            }
            if (!entry) {
              const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
              requests++;
              if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`Invalid illustration: ${id}`);
              const original = Buffer.from(await response.arrayBuffer());
              payloadBytes += original.length;
              const extension = imageExtension(original);
              if (!extension) throw new Error(`Invalid illustration bytes: ${id}`);
              entry = { local: `/assets/book-content/converted/${key}.${extension}`, bytes: original };
              staged.set(entry.local.slice(1), original);
            }
            convertedSources.set(url.href, entry);
          }
          local = entry.local; bytes = entry.bytes;
          manifest.set(local, { source: url.href, path: local, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        }
        if (!manifest.has(local)) manifest.set(local, { ...(previous[id]?.images?.find(image => image.path === local) ?? {}), path: local, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
        html = html.replace(match[0], match[0].replace(match[1], local));
      }
      return html;
    };
    article.noi_dung = await localize(article.noi_dung);
    for (const chapter of chapters) chapter.noi_dung = await localize(chapter.noi_dung);
    staged.set(chapterFile, chapters);
    if (versions[id]) versions[id].images = [...manifest.values()];
  }

  // Giữ owner ảnh tải riêng; URL nguồn web và đường dẫn cục bộ cùng một ảnh đã xác minh.
  const missionFile = `static/offline-data/chapters/${missionImages.bookId}.json`;
  const missionChapters = staged.get(missionFile) ?? read(missionFile, []);
  const imagePaths = new Set(missionImages.images.map(image => image.path));
  const remotePrefix = `https://media.quangtu.vn/content/${missionImages.directory.split('/').at(-1)}/`;
  let localized = false;
  for (const chapter of missionChapters) {
    const content = chapter.noi_dung.replace(/https:\/\/media\.quangtu\.vn\/content\/[^\s)"'<>]+/gu, source => {
      if (!source.startsWith(remotePrefix)) return source;
      const local = `/${missionImages.directory}/${source.slice(remotePrefix.length)}`;
      if (!imagePaths.has(local)) throw new Error('Illustration manifest requires refresh');
      return local;
    });
    localized ||= content !== chapter.noi_dung;
    chapter.noi_dung = content;
  }
  if (localized) staged.set(missionFile, missionChapters);
  // Các bản hiển thị đã hiệu chỉnh phải giữ định dạng khi web cập nhật lại nội dung.
  const presentationIds = ['kinh-niem-phat-ba-la-mat', 'nghi-thuc-tri-chu-phat-danh-ton-thang-da-la-ni', 'kinh-duy-ma-cat'];
  const formatPresentation = (id, content) => {
    if (typeof content !== 'string') return content;
    if (id === 'kinh-niem-phat-ba-la-mat') {
      return content.replace(/<p\b[^>]*>Nguồn: <a href="https:\/\/chuahoangphap\.com\.vn\/thu-vien-kinh-sach\/chi-tiet-kinh-niem-phat-ba-la-mat-130\/"[^>]*>Chùa Hoằng Pháp — Kinh Niệm Phật Ba-la-mật<\/a>\.<\/p>/u, '');
    }
    let emphasis = 0;
    return content.split(/(<[^>]+>)/gu).map(token => {
      if (token.startsWith('<')) {
        if (/^<(?:em|i)\b/iu.test(token)) emphasis++;
        else if (/^<\/(?:em|i)\s*>/iu.test(token)) emphasis = Math.max(0, emphasis - 1);
        return token;
      }
      return emphasis ? token : token.replace(/\([^()]*\)/gu, '<em>$&</em>');
    }).join('');
  };
  for (const id of presentationIds) {
    const article = articles.get(id);
    if (!article) continue;
    article.noi_dung = formatPresentation(id, article.noi_dung);
    const file = `static/offline-data/chapters/${id}.json`;
    const chapters = staged.get(file) ?? read(file, []);
    let changed = false;
    for (const chapter of chapters) {
      const content = formatPresentation(id, chapter.noi_dung);
      changed ||= content !== chapter.noi_dung;
      chapter.noi_dung = content;
    }
    if (changed) staged.set(file, chapters);
  }
  const revisionFile = 'src/lib/data/ritual-guidance-revision.json';
  const revisions = read(revisionFile, []);
  for (const revision of revisions) {
    if (!versions[revision.id]) continue;
    const chapters = staged.get(`static/offline-data/chapters/${revision.id}.json`)
      ?? read(`static/offline-data/chapters/${revision.id}.json`, []);
    const hash = index => {
      const chapter = chapters.find(row => row.so_thu_tu === index);
      if (!chapter) throw new Error(`Missing ritual chapter: ${revision.id}`);
      return createHash('sha256').update(chapter.noi_dung).digest('hex');
    };
    revision.sha256 = hash(revision.chapterIndex);
    for (const section of revision.unchanged) section.sha256 = hash(section.index);
  }
  if (revisions.length) staged.set(revisionFile, revisions);
  for (const [id, version] of Object.entries(versions)) {
    version.content = digest([articles.get(id), staged.get(`static/offline-data/chapters/${id}.json`)
      ?? read(`static/offline-data/chapters/${id}.json`, [])]);
  }
  // Cùng một snapshot cho fetch asset cục bộ và dynamic import.
  for (const file of ['src/lib/data/offline-bundled-articles.json', 'static/offline-bundled-articles.json']) staged.set(file, [...articles.values()]);
  for (const file of ['src/lib/data/offline-talks.json', 'static/offline-data/talks.json']) staged.set(file, [...talks.values()]);
  staged.set('src/lib/data/offline-content-versions.json', versions);
  // Không ghi bundle dở khi mạng lỗi hoặc web thay đổi giữa các trang.
  for (const [file, value] of staged) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  const result = { requests, payloadBytes, changedArticles, talks: talks.size, writesToServer: 0 };
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await syncOfflineContent();
}
