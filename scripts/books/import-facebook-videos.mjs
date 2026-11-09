import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync, spawn, execFileSync } from 'child_process';

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
  const candidates = [
    path.join(fbBase, uri),
    path.join(fbBase, 'your_facebook_activity', uri),
    path.join(fbBase, 'your_facebook_activity', 'your_facebook_activity', uri),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

const SKIP_PATTERNS = [
  /in xong/i,
  /nhận tượng/i,
  /tặng tượng/i,
  /tặng kinh/i,
  /kêu gọi/i,
  /cúng dường/i,
  /chùa nghèo/i,
  /xây dựng cúng dường/i,
  /phóng sanh/i,
  /cấm cười/i,
  /trọn bộ báo ứng hiện đời/i,
];

function cleanTitle(rawText) {
  const rawLines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!rawLines.length) return 'BÀI GIẢNG PHẬT PHÁP CÓ VIDEO';

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

  let titleLine = rawLines[lineIdx] || rawLines[0] || 'BÀI GIẢNG PHẬT PHÁP CÓ VIDEO';
  titleLine = titleLine
    .replace(/^([0-9]+[\.\-\)\s]+)+/, '')
    .replace(/^[\*\-\—\•\>\#\s]+/, '')
    .replace(/[\*\#]+$/g, '')
    .trim();

  // Remove hashtags
  titleLine = titleLine.replace(/#\w+/g, '').trim();

  if (titleLine.length > 100) {
    const periodIdx = titleLine.indexOf('.');
    if (periodIdx > 20 && periodIdx < 100) {
      titleLine = titleLine.slice(0, periodIdx).trim();
    } else {
      titleLine = titleLine.slice(0, 95).trim() + '…';
    }
  }

  return titleLine || 'BÀI GIẢNG PHẬT PHÁP CÓ VIDEO';
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
      if (doneCount % 5 === 0 || doneCount === items.length) {
        console.log(`  [Tiến độ] Đã xử lý ${doneCount}/${items.length}...`);
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
  console.log('  BỘ BỔ SUNG CÁC BÀI PHÁP CÓ VIDEO TỪ FACEBOOK VÀO D1 VÀ R2');
  console.log(
    `  Chế độ: ${
      isDryRun
        ? 'DRY-RUN (Xem trước, không ghi)'
        : isUpload
        ? 'UPLOAD THẬT (R2 + D1 Database Online)'
        : 'XỬ LÝ NÉN VIDEO + TẠO SQL (Chưa nạp online)'
    }`
  );
  console.log('===============================================================\n');

  // 1. Quét tìm bài pháp có video
  const postsDir = path.join(fbBase, 'your_facebook_activity/your_facebook_activity/posts');
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith('.json') && f.startsWith('your_posts'));

  const candidatePosts = [];
  const seenTexts = new Set();

  for (const f of files) {
    const raw = fs.readFileSync(path.join(postsDir, f), 'utf8');
    const items = JSON.parse(raw);
    for (const item of items) {
      const attachments = item.attachments || [];
      let videoUris = [];
      for (const att of attachments) {
        for (const d of att.data || []) {
          if (d.media && d.media.uri && (d.media.uri.endsWith('.mp4') || d.media.uri.includes('videos/'))) {
            videoUris.push(d.media.uri);
          }
        }
      }
      if (videoUris.length > 0) {
        const postText = (item.data || []).map((d) => decodeFB(d.post || '')).filter(Boolean).join('\n').trim();
        if (!postText) continue;

        const shouldSkip = SKIP_PATTERNS.some((pattern) => pattern.test(postText));
        if (shouldSkip) continue;

        const normalizedText = postText.replace(/\s+/g, ' ').slice(0, 100);
        if (seenTexts.has(normalizedText)) continue;
        seenTexts.add(normalizedText);

        candidatePosts.push({
          timestamp: item.timestamp,
          date: new Date(item.timestamp * 1000).toLocaleDateString('vi-VN'),
          videoUris,
          text: postText,
        });
      }
    }
  }

  // Sắp xếp bài theo thứ tự thời gian tăng dần (cũ đến mới để tiếp nối)
  candidatePosts.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Đã phát hiện ${candidatePosts.length} bài pháp có video độc nhất.`);

  // 2. Chuẩn bị thư mục đầu ra
  const scratchDir = path.resolve('scratch/processed_videos');
  if (!fs.existsSync(scratchDir)) {
    fs.mkdirSync(scratchDir, { recursive: true });
  }

  // 3. Xử lý nén video và tạo poster
  console.log('\n--- BƯỚC 1: NÉN VIDEO VỀ 360P & TẠO POSTER THUMBNAIL ---');
  const processedChapters = [];

  for (let i = 0; i < candidatePosts.length; i++) {
    const post = candidatePosts[i];
    const rawVideoUri = post.videoUris[0];
    const localSrc = findMediaFile(rawVideoUri);

    if (!localSrc) {
      console.warn(`[Cảnh báo] Không tìm thấy file nguồn cho ${rawVideoUri}, bỏ qua.`);
      continue;
    }

    const title = cleanTitle(post.text);
    const videoBasename = `fb-video-${post.timestamp}-${i + 1}.mp4`;
    const posterBasename = `fb-poster-${post.timestamp}-${i + 1}.webp`;

    const destVideoPath = path.join(scratchDir, videoBasename);
    const destPosterPath = path.join(scratchDir, posterBasename);

    const videoR2Key = `videos/${videoBasename}`;
    const posterR2Key = `posters/${posterBasename}`;

    console.log(`\n[${i + 1}/${candidatePosts.length}] Đang xử lý: ${title}`);
    console.log(`  File gốc: ${localSrc} (${(fs.statSync(localSrc).size / 1024 / 1024).toFixed(2)} MB)`);

    let compressedSize = 0;
    let posterSize = 0;

    if (isDryRun) {
      console.log(`  [DRY-RUN] Bỏ qua nén thật, mô phỏng kích thước.`);
      compressedSize = Math.round(fs.statSync(localSrc).size * 0.25);
      posterSize = 25000;
    } else {
      // Compress video to 360p if not already processed
      if (!fs.existsSync(destVideoPath) || fs.statSync(destVideoPath).size === 0) {
        console.log(`  Đang nén video về 360p (fast preset, multi-threaded)...`);
        const cmd = `ffmpeg -y -i "${localSrc}" -vf "scale='min(640,iw)':-2" -c:v libx264 -crf 28 -preset fast -threads 4 -c:a aac -b:a 64k -ac 1 -movflags +faststart "${destVideoPath}"`;
        execSync(cmd, { stdio: 'ignore' });
      }

      // Generate poster thumbnail if not exists
      if (!fs.existsSync(destPosterPath) || fs.statSync(destPosterPath).size === 0) {
        console.log(`  Đang trích xuất ảnh poster thumbnail...`);
        try {
          const posterCmd = `ffmpeg -y -ss 00:00:01 -i "${destVideoPath}" -vframes 1 -vf "scale='min(640,iw)':-2" "${destPosterPath}"`;
          execSync(posterCmd, { stdio: 'ignore' });
        } catch {
          const posterCmd = `ffmpeg -y -ss 00:00:00 -i "${destVideoPath}" -vframes 1 -vf "scale='min(640,iw)':-2" "${destPosterPath}"`;
          execSync(posterCmd, { stdio: 'ignore' });
        }
      }

      compressedSize = fs.statSync(destVideoPath).size;
      posterSize = fs.statSync(destPosterPath).size;
    }
    console.log(`  -> Video nén xong: ${(compressedSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  -> Poster: ${(posterSize / 1024).toFixed(1)} KB`);

    // Xây dựng nội dung HTML chuẩn cho tập sách
    const paragraphs = post.text
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#') && !p.startsWith('http://') && !p.startsWith('https://'));

    const paragraphsHtml = paragraphs
      .map((p) => `<p style="margin-bottom: 0.85em;">${escapeHtml(p)}</p>`)
      .join('\n');

    const htmlContent = `
<h2 style="text-align: center; font-weight: 700; color: #b45309; margin: 0 0 20px 0; font-size: 1.35rem; line-height: 1.4;">${escapeHtml(title)}</h2>

<div class="reader-video-wrapper" style="text-align: center; margin: 22px auto 26px; max-width: 640px;">
  <video controls preload="metadata" playsinline poster="https://media.quangtu.vn/${posterR2Key}" style="width: 100%; max-width: 640px; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); background: #000;">
    <source src="https://media.quangtu.vn/${videoR2Key}" type="video/mp4">
    Trình duyệt của bạn không hỗ trợ xem video trực tiếp.
  </video>
</div>

<div style="text-align: justify; line-height: 1.9; font-size: 1.05rem;">
${paragraphsHtml}
</div>
`.trim();

    const summary = `[Có Video] ${paragraphs.slice(0, 3).join(' ').slice(0, 210).trim()}`;

    processedChapters.push({
      title,
      summary,
      htmlContent,
      videoPath: destVideoPath,
      posterPath: destPosterPath,
      videoKey: videoR2Key,
      posterKey: posterR2Key,
      videoSize: compressedSize,
      posterSize,
      videoSha256: fs.existsSync(destVideoPath) ? getSha256(destVideoPath) : 'dryrunsha256',
      posterSha256: fs.existsSync(destPosterPath) ? getSha256(destPosterPath) : 'dryrunsha256',
    });
  }

  console.log(`\n✅ Đã xử lý xong ${processedChapters.length} video và poster!`);

  // 4. Lấy thông tin sách hiện tại từ D1
  console.log('\n--- BƯỚC 2: KIỂM TRA SÁCH HIỆN TẠI TRÊN D1 DATABASE ---');
  const wranglerBin = path.resolve('node_modules/wrangler/bin/wrangler.js');
  const bookId = 'tuyen-tap-phap-facebook-quang-tu';

  let currentSoTap = 499;
  let currentTitles = [];

  try {
    const rawCheck = execFileSync(
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
        '--command',
        `SELECT so_tap, tap_tieu_de FROM baiviet WHERE id = '${bookId}';`,
        '--json',
      ],
      { env: process.env, encoding: 'utf8', stdio: 'pipe' }
    );
    const parsed = JSON.parse(rawCheck);
    const row = parsed[0]?.results?.[0];
    if (row) {
      currentSoTap = Number(row.so_tap) || 499;
      if (row.tap_tieu_de) {
        currentTitles = typeof row.tap_tieu_de === 'string' ? JSON.parse(row.tap_tieu_de) : row.tap_tieu_de;
      }
    }
  } catch (err) {
    console.warn('Không thể đọc thông tin trực tiếp từ D1, dùng mặc định:', err.message);
  }

  console.log(`Số tập hiện tại của sách: ${currentSoTap}`);
  const newSoTap = currentSoTap + processedChapters.length;
  console.log(`Số tập mới sau khi bổ sung: ${newSoTap}`);

  // Cập nhật danh sách tiêu đề tập
  const updatedTitles = [...currentTitles];
  for (const chap of processedChapters) {
    updatedTitles.push(chap.title);
  }

  // 5. Tạo các câu lệnh SQL
  const now = new Date().toISOString();
  const sqlStatements = [];

  // Thêm vào media_objects
  for (const chap of processedChapters) {
    sqlStatements.push(`
INSERT INTO media_objects (
  object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at
) VALUES (
  ${escapeSql(chap.videoKey)}, ${escapeSql(chap.videoKey)}, ${chap.videoSize}, ${escapeSql(chap.videoSha256)}, 'video/mp4', 'public, max-age=31536000, immutable', 0, ${escapeSql(now)}
) ON CONFLICT(object_key) DO UPDATE SET
  byte_size = excluded.byte_size, sha256 = excluded.sha256;
`);

    sqlStatements.push(`
INSERT INTO media_objects (
  object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at
) VALUES (
  ${escapeSql(chap.posterKey)}, ${escapeSql(chap.posterKey)}, ${chap.posterSize}, ${escapeSql(chap.posterSha256)}, 'image/webp', 'public, max-age=31536000, immutable', 0, ${escapeSql(now)}
) ON CONFLICT(object_key) DO UPDATE SET
  byte_size = excluded.byte_size, sha256 = excluded.sha256;
`);
  }

  // Thêm các tập mới vào tap_noi_dung
  for (let i = 0; i < processedChapters.length; i++) {
    const chap = processedChapters[i];
    const chapterOrder = currentSoTap + i;
    sqlStatements.push(`
INSERT INTO tap_noi_dung (
  bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung, updated_at
) VALUES (
  ${escapeSql(bookId)},
  ${chapterOrder},
  ${escapeSql(chap.title)},
  ${escapeSql(chap.summary)},
  ${escapeSql(chap.htmlContent)},
  ${escapeSql(now)}
) ON CONFLICT(bai_viet_id, so_thu_tu) DO UPDATE SET
  tieu_de = excluded.tieu_de,
  tom_tat = excluded.tom_tat,
  noi_dung = excluded.noi_dung,
  updated_at = excluded.updated_at;
`);
  }

  // Cập nhật baiviet
  sqlStatements.push(`
UPDATE baiviet SET
  so_tap = ${newSoTap},
  tap_tieu_de = ${escapeSql(JSON.stringify(updatedTitles))},
  updated_at = ${escapeSql(now)}
WHERE id = ${escapeSql(bookId)};
`);

  const sqlFilePath = path.resolve('scratch/import-facebook-videos.sql');
  fs.writeFileSync(sqlFilePath, sqlStatements.join('\n'), 'utf8');
  console.log(`\nĐã tạo file SQL thành công: ${sqlFilePath} (${sqlStatements.length} câu lệnh)`);

  if (isDryRun) {
    console.log('\n[DRY-RUN] Đã hoàn thành bước kiểm tra. Không có thay đổi nào được ghi lên Cloudflare.');
    return;
  }

  if (isUpload) {
    // 6. Upload R2
    console.log('\n--- BƯỚC 3: TẢI VIDEO & POSTER LÊN CLOUDFLARE R2 ---');
    const uploadTasks = [];
    for (const chap of processedChapters) {
      uploadTasks.push({ bucket: 'quangtu', key: chap.videoKey, local: chap.videoPath, type: 'video/mp4' });
      uploadTasks.push({ bucket: 'quangtu', key: chap.posterKey, local: chap.posterPath, type: 'image/webp' });
    }
    console.log(`Bắt đầu tải lên ${uploadTasks.length} file (videos + posters) lên Cloudflare R2...`);
    await runConcurrent(uploadTasks, 4, async (task) => {
      await uploadToR2(task.bucket, task.key, task.local, task.type);
    });
    console.log('✅ Đã tải lên toàn bộ video và poster lên R2 thành công!');

    // 7. Thực thi SQL vào D1
    console.log('\n--- BƯỚC 4: THỰC THI SQL VÀO D1 DATABASE ---');
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
        sqlFilePath,
      ],
      { env: process.env, encoding: 'utf8', stdio: 'inherit' }
    );
    console.log('\n✅ ĐÃ HOÀN TẤT BỔ SUNG CÁC BÀI PHÁP CÓ VIDEO VÀO SÁCH D1 THÀNH CÔNG!');
  } else {
    console.log('\n[GỢI Ý] Để tải video/poster lên Cloudflare R2 và cập nhật vào D1 online, chạy lệnh:');
    console.log('  node scripts/books/import-facebook-videos.mjs --upload');
  }
}

main().catch((err) => {
  console.error('Lỗi xảy ra:', err);
  process.exit(1);
});
