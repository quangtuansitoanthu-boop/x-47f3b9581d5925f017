import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec, execFileSync } from 'child_process';
import util from 'util';
import sharp from 'sharp';

const execAsync = util.promisify(exec);

function decodeFB(str) {
  if (!str) return '';
  try {
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

const fbBase = 'QUANGTU_JSON_FACEBOOK';

function findMediaFile(uri) {
  if (!uri) return null;
  const p1 = path.join(fbBase, uri);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(fbBase, 'your_facebook_activity', uri);
  if (fs.existsSync(p2)) return p2;
  return null;
}

function cleanTitle(rawText) {
  const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!rawLines.length) return 'BÀI GIẢNG PHẬT PHÁP';

  let lineIdx = 0;
  while (lineIdx < rawLines.length && lineIdx < 6) {
    const l = rawLines[lineIdx];
    const lower = l.toLowerCase();
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('www.') ||
      lower.startsWith('(sưu tầm') ||
      lower.startsWith('sưu tầm') ||
      lower.startsWith('(chia sẻ') ||
      lower.startsWith('chia sẻ') ||
      lower.includes('bài mới dịch') ||
      lower.includes('chưa in sách') ||
      lower.includes('xin đừng sửa tựa') ||
      lower.includes('duyệt bài') ||
      lower.includes('phê duyệt') ||
      lower.startsWith('(nguồn') ||
      lower.startsWith('nguồn:') ||
      lower.startsWith('chào mọi người') ||
      lower.startsWith('chào cả nhà') ||
      lower.startsWith('chúc mọi người') ||
      lower.startsWith('chúc cả nhà') ||
      lower.startsWith('hi mọi người') ||
      lower.startsWith('alo mọi người') ||
      l.length < 5
    ) {
      lineIdx++;
    } else {
      break;
    }
  }

  let titleLine = rawLines[lineIdx] || rawLines[0];

  // Strip leading/trailing emojis, brackets, quotes, symbols
  titleLine = titleLine
    .replace(
      /^[\p{Emoji}\p{Symbol}\s\-–—*#•🌸🙏🌿🥣💔💫☘️🔆✿【】"“”'’࿐«»…()]+|[\p{Emoji}\p{Symbol}\s\-–—*#•🌸🙏🌿🥣💔💫☘️🔆✿【】"“”'’࿐«»…()]+$/gu,
      ''
    )
    .trim();

  // Strip common post prefixes
  titleLine = titleLine.replace(
    /^(BÀI VIẾT|CHIA SẺ|BÀI ĐĂNG|PHÁP THOẠI|GÓC NHÌN|TÂM SỰ|LỜI PHẬT DẠY|TRÍCH DẪN|CÂU CHUYỆN)\s*:\s*/iu,
    ''
  );

  if (titleLine.length < 6 && lineIdx + 1 < rawLines.length) {
    titleLine = rawLines[lineIdx + 1]
      .replace(
        /^[\p{Emoji}\p{Symbol}\s\-–—*#•🌸🙏🌿🥣💔💫☘️🔆✿【】"“”'’࿐«»…()]+|[\p{Emoji}\p{Symbol}\s\-–—*#•🌸🙏🌿🥣💔💫☘️🔆✿【】"“”'’࿐«»…()]+$/gu,
        ''
      )
      .trim();
  }

  if (titleLine.startsWith('http://') || titleLine.startsWith('https://')) {
    titleLine = 'BÀI GIẢNG PHẬT PHÁP';
  }

  if (titleLine.length > 110) {
    const cut = titleLine.slice(0, 110);
    const lastSpace = cut.lastIndexOf(' ');
    titleLine = (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim();
  }

  return titleLine || 'BÀI GIẢNG PHẬT PHÁP';
}

function normalizeTitleKey(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, 45)
    .trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function getSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

import { spawn } from 'child_process';

function uploadToR2(bucket, key, localPath, contentType, maxRetries = 3) {
  return new Promise(async (resolve, reject) => {
    const wranglerBin = path.resolve('node_modules/wrangler/bin/wrangler.js');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise((res, rej) => {
          const child = spawn(
            process.execPath,
            [
              wranglerBin,
              'r2',
              'object',
              'put',
              `${bucket}/${key}`,
              '--file',
              localPath,
              '--content-type',
              contentType,
              '--cache-control',
              'public, max-age=31536000, immutable',
              '--remote',
            ],
            { env: process.env, stdio: 'ignore' }
          );
          child.on('error', rej);
          child.on('close', (code) => {
            if (code === 0) res();
            else rej(new Error(`Exit ${code} uploading ${key}`));
          });
        });
        return resolve();
      } catch (err) {
        if (attempt === maxRetries) return reject(err);
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  });
}

async function runConcurrent(items, concurrency, fn) {
  const results = [];
  const executing = new Set();
  let doneCount = 0;
  for (const item of items) {
    const p = Promise.resolve().then(async () => {
      await fn(item);
      doneCount++;
      if (doneCount % 25 === 0 || doneCount === items.length) {
        console.log(`  [R2 Upload] Đã tải lên ${doneCount}/${items.length} file...`);
      }
    });
    results.push(p);
    executing.add(p);
    const clean = () => executing.delete(p);
    p.then(clean, clean);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isUpload = args.includes('--upload');

  console.log('===============================================================');
  console.log('  BỘ NHẬP LIỆU: TUYỂN TẬP BÀI PHÁP HAY TỪ FACEBOOK QUANG TỪ');
  console.log(
    `  Chế độ: ${
      isDryRun
        ? 'DRY-RUN (Xem trước, không ghi)'
        : isUpload
        ? 'UPLOAD THẬT (R2 + D1 Database Online)'
        : 'TẠO FILE SQL NỘI BỘ (Chưa đẩy lên cloud)'
    }`
  );
  console.log('===============================================================\n');

  if (!fs.existsSync(fbBase)) {
    throw new Error(`Thư mục ${fbBase} không tồn tại!`);
  }

  // 1. Scan candidate sources
  const sources = [
    'your_facebook_activity/your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json',
    'your_facebook_activity/posts/your_posts__check_ins__photos_and_videos_1.json',
    'your_facebook_activity/your_facebook_activity/posts/album/0.json',
    'your_facebook_activity/posts/album/0.json',
    'your_facebook_activity/your_facebook_activity/posts/album/1.json',
    'your_facebook_activity/posts/album/1.json',
    'your_facebook_activity/your_facebook_activity/posts/your_uncategorized_photos.json',
    'your_facebook_activity/posts/your_uncategorized_photos.json',
    'your_facebook_activity/your_facebook_activity/groups/group_posts_and_comments.json',
    'your_facebook_activity/groups/group_posts_and_comments.json',
  ];

  const processedSourcePaths = new Set();
  const rawItems = [];

  for (const rel of sources) {
    const full = path.join(fbBase, rel);
    if (!fs.existsSync(full) || processedSourcePaths.has(full)) continue;
    processedSourcePaths.add(full);

    const data = JSON.parse(fs.readFileSync(full, 'utf8'));

    if (Array.isArray(data)) {
      for (const item of data) {
        const text = item.data?.map((d) => decodeFB(d.post || '')).filter(Boolean).join('\n').trim() || '';
        let media = [];
        let isVideo = false;
        if (item.attachments) {
          for (const att of item.attachments) {
            if (att.data) {
              for (const d of att.data) {
                if (
                  d.media?.uri?.endsWith('.mp4') ||
                  d.media?.media_type === 'video' ||
                  (d.media?.uri && d.media.uri.includes('/videos/'))
                ) {
                  isVideo = true;
                } else if (d.media?.uri) {
                  media.push(d.media.uri);
                }
                if (
                  d.external_context?.url &&
                  (d.external_context.url.includes('youtube.com') ||
                    d.external_context.url.includes('youtu.be') ||
                    d.external_context.url.includes('tiktok.com') ||
                    d.external_context.url.includes('/videos/'))
                ) {
                  isVideo = true;
                }
              }
            }
          }
        }
        if (!isVideo && text.length >= 300) {
          rawItems.push({ text, timestamp: item.timestamp || 0, media, source: rel });
        }
      }
    } else if (data.photos) {
      for (const item of data.photos) {
        const text = decodeFB(item.description || '').trim();
        const media = item.uri ? [item.uri] : [];
        if (text.length >= 300) {
          rawItems.push({ text, timestamp: item.creation_timestamp || 0, media, source: rel });
        }
      }
    } else if (data.other_photos_v2) {
      for (const item of data.other_photos_v2) {
        const text = decodeFB(item.description || '').trim();
        const media = item.uri ? [item.uri] : [];
        if (text.length >= 300) {
          rawItems.push({ text, timestamp: item.creation_timestamp || 0, media, source: rel });
        }
      }
    } else if (data.group_posts_v2) {
      for (const item of data.group_posts_v2) {
        const text = item.data?.map((d) => decodeFB(d.post || '')).filter(Boolean).join('\n').trim() || '';
        let media = [];
        let isVideo = false;
        if (item.attachments) {
          for (const att of item.attachments) {
            if (att.data) {
              for (const d of att.data) {
                if (
                  d.media?.uri?.endsWith('.mp4') ||
                  d.media?.media_type === 'video' ||
                  (d.media?.uri && d.media.uri.includes('/videos/'))
                ) {
                  isVideo = true;
                } else if (d.media?.uri) {
                  media.push(d.media.uri);
                }
                if (
                  d.external_context?.url &&
                  (d.external_context.url.includes('youtube.com') ||
                    d.external_context.url.includes('youtu.be') ||
                    d.external_context.url.includes('/videos/'))
                ) {
                  isVideo = true;
                }
              }
            }
          }
        }
        if (!isVideo && text.length >= 300) {
          rawItems.push({ text, timestamp: item.timestamp || 0, media, source: rel });
        }
      }
    }
  }

  console.log(`1. Tổng số mục bài đăng không chứa video từ Facebook: ${rawItems.length}`);

  // 2. Filters for giveaways, fundraising, websites, non-dharma
  const excludePatterns = [
    'thỉnh tượng',
    'tặng tượng',
    'tặng tôn tượng',
    'thỉnh tôn tượng',
    'bức tượng',
    'ai muốn thỉnh',
    'muốn thỉnh',
    'tượng đã được chuyển',
    'chuyển tượng',
    'gửi tượng',
    'nhận tượng',
    'đăng ký nhận tượng',
    'đăng ký thỉnh',
    'đã gửi kinh',
    'chuyển kinh',
    'gửi sách',
    'ship kinh',
    'nhận kinh',
    'thông báo in kinh',
    'thông báo tặng kinh',
    'tặng kinh',
    'phát tâm in kinh',
    'in kinh địa tạng',
    'kinh địa tạng bản a4 đã in xong',
    'kinh địa tạng đã in xong',
    'kinh từ bi thủy sám khoảng 200 cuốn',
    'hùn phước',
    'góp phước',
    'kêu gọi',
    'giới thiệu website',
    'giới thiệu web',
    'trang web của em',
    'trang web mới',
    'tên miền mới',
    'sập do server',
    'vercel.app',
    'quangtu.vercel',
    'quangtu.vn',
    'link tham gia nhóm',
    'link tham gia',
    'nhóm zalo',
    'nhóm telegram',
    'ấn tống kinh',
    'kêu gọi ấn tống',
    'ủng hộ ấn tống',
    'số tài khoản',
    'stk:',
    'stk :',
    'vietcombank',
    'mbbank',
    'techcombank',
    'agribank',
    'sacombank',
    'bidv',
    'mong ad duyệt',
    'mong ad phê duyệt',
    'bác cao nhân',
    'xin chào ad',
    'xem bói',
    'bói toán',
    'tử vi',
    'trung quốc thực sự',
    'bán đất',
    'mua bán đất',
    'chính trị',
    'báo cáo công phu',
    'ngoảnh mặt, dù bạn có lưu luyến',
  ];

  const dharmaKeywords = [
    'phật', 'bồ tát', 'địa tạng', 'quán thế âm', 'quan âm', 'a di đà', 'thích ca', 'dược sư',
    'kinh', 'chú', 'đà ra ni', 'niệm phật', 'tu tập', 'nghiệp', 'nhân quả', 'báo ứng',
    'tái sinh', 'luân hồi', 'địa ngục', 'ngạ quỷ', 'súc sinh', 'cõi trời', 'phước',
    'oan gia', 'trái chủ', 'sám hối', 'phóng sinh', 'ăn chay', 'giới', 'thiền', 'tâm',
    'vãng sanh', 'tịnh độ', 'giải thoát', 'chánh pháp', 'bát nhã', 'vô thường', 'khổ',
    'hòa thượng', 'pháp sư', 'thiền sư', 'chùa', 'tăng', 'ni', 'tam bảo', 'pháp thoại',
    'công đức', 'hồi hướng', 'chân ngôn', 'án ma ni', 'lăng nghiêm', 'đại bi', 'thần chú',
    'nhân duyên', 'bố thí', 'trì giới', 'tinh tấn', 'nhẫn nhục', 'trí tuệ', 'thiện ác'
  ];

  function isDharmaArticle(text) {
    const lower = text.toLowerCase();
    let hits = 0;
    for (const kw of dharmaKeywords) {
      if (lower.includes(kw)) hits++;
    }
    return hits >= 2 && text.length >= 350;
  }

  const titleMap = new Map();
  let skippedExclude = 0;
  let skippedNotDharma = 0;

  for (const item of rawItems) {
    const lower = item.text.toLowerCase();
    if (excludePatterns.some((kw) => lower.includes(kw))) {
      skippedExclude++;
      continue;
    }
    if (!isDharmaArticle(item.text)) {
      skippedNotDharma++;
      continue;
    }

    const title = cleanTitle(item.text);
    const titleKey = normalizeTitleKey(title);
    if (titleKey.length < 6) continue;

    let validMedia = '';
    for (const m of item.media) {
      const p = findMediaFile(m);
      if (p && !m.endsWith('.mp4')) {
        validMedia = m;
        break;
      }
    }

    if (!titleMap.has(titleKey)) {
      titleMap.set(titleKey, {
        title,
        titleKey,
        text: item.text,
        timestamp: item.timestamp,
        mediaUri: validMedia,
        source: item.source,
      });
    } else {
      const existing = titleMap.get(titleKey);
      if (!existing.mediaUri && validMedia) {
        existing.mediaUri = validMedia;
      }
      if (item.text.length > existing.text.length) {
        existing.text = item.text;
      }
    }
  }

  const rawChapters = Array.from(titleMap.values());
  rawChapters.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  console.log(`4. Tổng số bài giảng Phật pháp sơ tuyển: ${rawChapters.length} bài.`);

  // 3. Khử trùng lặp nội dung sâu giữa các bài viết (chỉ giữ lại 1 bài tốt nhất)
  console.log('\n--- BƯỚC 1: KHỬ TRÙNG LẶP NỘI DUNG GIỮA CÁC BÀI VIẾT (OVERLAP >= 55%) ---');
  function getShingles(text) {
    const words = text
      .replace(/<[^>]+>/g, ' ')
      .replace(/https?:\/\/[^\s]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .trim()
      .split(' ')
      .filter((w) => w.length > 1);
    const shingles = new Set();
    for (let i = 0; i <= words.length - 6; i++) {
      shingles.add(words.slice(i, i + 6).join(' '));
    }
    return shingles;
  }

  function computeOverlap(s1, s2) {
    if (s1.size === 0 || s2.size === 0) return 0;
    let common = 0;
    const smaller = s1.size < s2.size ? s1 : s2;
    const larger = s1.size < s2.size ? s2 : s1;
    for (const sh of smaller) {
      if (larger.has(sh)) common++;
    }
    return common / smaller.size;
  }

  for (const c of rawChapters) {
    c.shingles = getShingles(c.text);
  }

  const toRemove = new Set();
  let dupeRemovedCount = 0;

  for (let i = 0; i < rawChapters.length; i++) {
    if (toRemove.has(i)) continue;
    const c1 = rawChapters[i];

    for (let j = i + 1; j < rawChapters.length; j++) {
      if (toRemove.has(j)) continue;
      const c2 = rawChapters[j];

      const tk1 = normalizeTitleKey(c1.title);
      const tk2 = normalizeTitleKey(c2.title);
      const titleMatch = tk1 === tk2;
      const overlap = computeOverlap(c1.shingles, c2.shingles);

      if (titleMatch || overlap >= 0.55) {
        let keep = i;
        let drop = j;

        if (!c1.mediaUri && c2.mediaUri) {
          keep = j;
          drop = i;
        } else if (c1.mediaUri && !c2.mediaUri) {
          keep = i;
          drop = j;
        } else if (c2.text.length > c1.text.length * 1.1) {
          keep = j;
          drop = i;
        }

        toRemove.add(drop);
        dupeRemovedCount++;
        console.log(
          `  [Khử trùng] Giữ: "${rawChapters[keep].title.slice(0, 45)}" | Bỏ: "${rawChapters[drop].title.slice(
            0,
            45
          )}" (${(overlap * 100).toFixed(1)}%)`
        );

        if (drop === i) break;
      }
    }
  }

  const chapters = rawChapters.filter((_, idx) => !toRemove.has(idx));
  console.log(`\nĐã loại bỏ ${dupeRemovedCount} bài viết bị trùng nội dung.`);
  console.log(`Tổng số bài pháp DUY NHẤT giữ lại: ${chapters.length} bài.\n`);

  // 4. Image optimization with Sharp
  const outImgDir = path.resolve('scratch/facebook-covers');
  fs.mkdirSync(outImgDir, { recursive: true });

  console.log('--- BƯỚC 2: XỬ LÝ VÀ NÉN ẢNH MINH HỌA BẰNG SHARP (WEBP) ---');
  let processedImages = 0;

  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    const chapNum = String(i + 1).padStart(3, '0');
    const outFileName = `fb-chap-${chapNum}.webp`;
    const outFilePath = path.join(outImgDir, outFileName);
    const r2Key = `facebook-tuyen-tap/${outFileName}`;

    chap.r2Key = r2Key;
    chap.localWebp = outFilePath;

    if (chap.mediaUri) {
      const srcPath = findMediaFile(chap.mediaUri);
      if (srcPath && fs.existsSync(srcPath)) {
        try {
          if (!fs.existsSync(outFilePath)) {
            await sharp(srcPath)
              .rotate()
              .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
              .webp({ quality: 80, effort: 4 })
              .toFile(outFilePath);
          }
          chap.hasImage = true;
          processedImages++;
        } catch (e) {
          chap.hasImage = false;
        }
      } else {
        chap.hasImage = false;
      }
    } else {
      chap.hasImage = false;
    }
  }

  console.log(`Đã sẵn sàng ${processedImages}/${chapters.length} ảnh minh họa WebP tối ưu dung lượng.`);

  // Book Cover
  const bookCoverLocal = path.join(outImgDir, 'cover-tuyen-tap-phap-facebook.webp');
  const bookCoverR2Key = 'covers/tuyen-tap-phap-facebook-quang-tu.webp';

  const firstWithImage = chapters.find((c) => c.hasImage);
  if (firstWithImage && !fs.existsSync(bookCoverLocal)) {
    await sharp(firstWithImage.localWebp)
      .resize(640, 360, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toFile(bookCoverLocal);
  }

  // 4. Format HTML for each chapter
  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    const lines = chap.text.split('\n').map((l) => l.trim()).filter(Boolean);

    let bodyLines = lines;
    if (lines.length > 1 && lines[0].toLowerCase().includes(chap.title.slice(0, 20).toLowerCase())) {
      bodyLines = lines.slice(1);
    }

    const htmlParts = [];
    htmlParts.push(
      `<h2 style="text-align: center; font-weight: 700; color: #b45309; margin: 0 0 20px 0; font-size: 1.35rem; line-height: 1.4;">${escapeHtml(
        chap.title
      )}</h2>`
    );

    if (chap.hasImage) {
      htmlParts.push(
        `<div style="text-align: center; margin: 20px 0;"><img src="https://media.quangtu.vn/${chap.r2Key}" alt="${escapeHtml(
          chap.title
        )}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.12);" loading="lazy" /></div>`
      );
    }

    htmlParts.push('<div style="text-align: justify; line-height: 1.9; font-size: 1.05rem;">');
    for (const line of bodyLines) {
      htmlParts.push(`  <p style="margin-bottom: 1.15em; text-align: justify;">${escapeHtml(line)}</p>`);
    }
    htmlParts.push('</div>');

    chap.htmlContent = htmlParts.join('\n');
    chap.summary = bodyLines.slice(0, 2).join(' ').slice(0, 200).trim();
  }

  // 5. Generate SQL
  console.log('\n--- BƯỚC 2: TẠO CÁC CÂU LỆNH SQL CHO D1 DATABASE ---');
  const sqlStatements = [];
  const now = new Date().toISOString();
  const bookId = 'tuyen-tap-phap-facebook-quang-tu';
  const bookTitle = 'TUYỂN TẬP BÀI PHÁP HAY TỪ FACEBOOK QUANG TỪ';
  const bookSummary = `Tuyển tập gồm ${chapters.length} bài giảng giải nhân quả, hướng dẫn tu tập, câu chuyện nhiệm màu và lời khai thị đặc sắc được chọn lọc kỹ lưỡng từ Facebook Quang Từ.`;
  const bookTags = 'Quang Từ, Facebook, Nhân Quả, Tu Tập, Khai Thị, Địa Tạng, Khuyến Thiện';
  const chapterTitlesJson = JSON.stringify(chapters.map((c) => c.title));

  // Media objects for book cover
  if (fs.existsSync(bookCoverLocal)) {
    const coverStat = fs.statSync(bookCoverLocal);
    const coverSha = getSha256(bookCoverLocal);
    sqlStatements.push(`
INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
VALUES (${escapeSql(bookCoverR2Key)}, ${escapeSql(bookCoverR2Key)}, ${coverStat.size}, ${escapeSql(coverSha)}, 'image/webp', 'public, max-age=31536000, immutable', 1, ${escapeSql(now)}, NULL)
ON CONFLICT(object_key) DO UPDATE SET byte_size = excluded.byte_size, sha256 = excluded.sha256, deleted_at = NULL;`);
  }

  // Media objects for chapter images
  for (const chap of chapters) {
    if (chap.hasImage && fs.existsSync(chap.localWebp)) {
      const stat = fs.statSync(chap.localWebp);
      const sha = getSha256(chap.localWebp);
      sqlStatements.push(`
INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
VALUES (${escapeSql(chap.r2Key)}, ${escapeSql(chap.r2Key)}, ${stat.size}, ${escapeSql(sha)}, 'image/webp', 'public, max-age=31536000, immutable', 1, ${escapeSql(now)}, NULL)
ON CONFLICT(object_key) DO UPDATE SET byte_size = excluded.byte_size, sha256 = excluded.sha256, deleted_at = NULL;`);
    }
  }

  // Insert/Update baiviet
  sqlStatements.push(`
INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, link_ngoai,
  noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, created_at, updated_at, pdf_url
) VALUES (
  ${escapeSql(bookId)},
  ${escapeSql(bookTitle)},
  ${escapeSql(bookSummary)},
  ${escapeSql(bookSummary)},
  'SÁCH KHUYẾN THIỆN',
  ${escapeSql(bookTags)},
  'Quang Từ',
  ${escapeSql(bookCoverR2Key)},
  '',
  1,
  '19/09/2026',
  1,
  ${chapters.length},
  'Hoàn thành',
  ${escapeSql(chapterTitlesJson)},
  ${escapeSql(now)},
  ${escapeSql(now)},
  ''
)
ON CONFLICT(id) DO UPDATE SET
  tieu_de = excluded.tieu_de,
  tom_tat = excluded.tom_tat,
  noi_dung = excluded.noi_dung,
  danh_muc = excluded.danh_muc,
  tags = excluded.tags,
  tac_gia = excluded.tac_gia,
  anh_url = excluded.anh_url,
  has_muc_luc = 1,
  so_tap = excluded.so_tap,
  tap_tieu_de = excluded.tap_tieu_de,
  updated_at = excluded.updated_at;
`);

  // Clear existing chapters
  sqlStatements.push(`DELETE FROM tap_noi_dung WHERE bai_viet_id = ${escapeSql(bookId)};`);

  // Insert chapters
  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    sqlStatements.push(`
INSERT INTO tap_noi_dung (
  bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung, updated_at
) VALUES (
  ${escapeSql(bookId)},
  ${i},
  ${escapeSql(chap.title)},
  ${escapeSql(chap.summary)},
  ${escapeSql(chap.htmlContent)},
  ${escapeSql(now)}
);`);
  }

  const sqlFilePath = path.resolve('scratch/seed-facebook-tuyen-tap.sql');
  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf8');
  console.log(
    `Đã tạo file SQL thành công: ${sqlFilePath} (${(fs.statSync(sqlFilePath).size / 1024 / 1024).toFixed(2)} MB, ${
      sqlStatements.length
    } câu lệnh)`
  );

  if (isDryRun) {
    console.log('\n[DRY RUN HOÀN TẤT] Không tải lên R2 hay thực thi vào D1. Danh sách bài đã sẵn sàng.');
    return;
  }

  if (isUpload) {
    console.log('\n--- BƯỚC 3: TẢI ẢNH LÊN CLOUDFLARE R2 (CONCURRENCY: 6) ---');
    const uploadTasks = [];
    if (fs.existsSync(bookCoverLocal)) {
      uploadTasks.push({ bucket: 'quangtu', key: bookCoverR2Key, local: bookCoverLocal, type: 'image/webp' });
    }
    for (const chap of chapters) {
      if (chap.hasImage && fs.existsSync(chap.localWebp)) {
        uploadTasks.push({ bucket: 'quangtu', key: chap.r2Key, local: chap.localWebp, type: 'image/webp' });
      }
    }
    console.log(`Bắt đầu tải lên ${uploadTasks.length} ảnh lên R2...`);
    await runConcurrent(uploadTasks, 6, async (task) => {
      await uploadToR2(task.bucket, task.key, task.local, task.type);
    });
    console.log('✅ Đã tải lên tất cả ảnh lên R2 thành công!');

    console.log('\n--- BƯỚC 4: THỰC THI SQL VÀO D1 DATABASE (REMOTE) ---');
    const chunkSize = 40;
    const totalChunks = Math.ceil(sqlStatements.length / chunkSize);
    console.log(`Chia ${sqlStatements.length} câu lệnh SQL thành ${totalChunks} phần để thực thi an toàn...`);

    const wranglerBin = path.resolve('node_modules/wrangler/bin/wrangler.js');

    for (let c = 0; c < totalChunks; c++) {
      const chunkStmts = sqlStatements.slice(c * chunkSize, (c + 1) * chunkSize);
      const chunkPath = path.resolve(`scratch/seed-facebook-chunk-${c + 1}.sql`);
      fs.writeFileSync(chunkPath, chunkStmts.join('\n'), 'utf8');
      console.log(`Đang thực thi phần ${c + 1}/${totalChunks} (${chunkStmts.length} câu lệnh)...`);
      execFileSync(
        process.execPath,
        [
          wranglerBin,
          'd1',
          'execute',
          'DB',
          '--remote',
          '--config',
          'wrangler.sveltekit.jsonc',
          '--env',
          'production',
          '--file',
          chunkPath,
        ],
        { env: process.env, encoding: 'utf8', stdio: 'pipe' }
      );
      console.log(`  -> Xong phần ${c + 1}/${totalChunks}`);
    }

    console.log('\n✅ ĐÃ HOÀN TẤT BỔ SUNG CÁC BÀI PHÁP VÀO D1 THÀNH CÔNG!');
  } else {
    console.log('\n[GHI CHÚ] Để tải ảnh lên R2 và nạp vào D1 database thật, hãy chạy lệnh:');
    console.log('  node scripts/books/import-facebook-tuyen-tap.mjs --upload');
  }
}

main().catch((err) => {
  console.error('Lỗi xảy ra:', err);
  process.exit(1);
});
