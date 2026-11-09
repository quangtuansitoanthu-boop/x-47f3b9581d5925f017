#!/usr/bin/env node
/**
 * execute-sync-books.mjs
 * Uploads generated book covers to Cloudflare R2 bucket `quangtu`,
 * registers them in `media_objects` table,
 * and updates `anh_url` and `tom_tat` in `baiviet` on Cloudflare D1 production.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const D1_DATABASE_NAME = 'quangtu-db';
const BRAIN_DIR = 'C:/Users/Admin/.gemini/antigravity-ide/brain/7d395d14-8827-47b1-8c2f-c760cb720744';

// 16 books configuration
const BOOKS = [
  {
    id: 'book_1d90dbea5600ee1738e90ae00ba76c17',
    tieu_de: 'Hải Hội Thánh Hiền Lục',
    sourceFile: path.join(BRAIN_DIR, 'cover_hai_hien_1789278275882.jpg'),
    objectKey: 'covers/hai-hoi-thanh-hien-luc.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/hai-hoi-thanh-hien-luc.jpg',
    tomTat: 'Cuộc đời, hành trạng và đạo nghiệp thanh tịnh của Đại lão Hòa thượng Hải Hiền (1900 - 2013) — tấm gương chân thật tu hành, nhất tâm niệm Phật vãng sanh Cực Lạc thù thắng thời hiện đại.'
  },
  {
    id: 'book_a470c0b867366dc5786112ce466a4a9e',
    tieu_de: 'Khai Thị — Quyển 1',
    sourceFile: path.join(BRAIN_DIR, 'cover_khai_thi_1_1789278497757.jpg'),
    objectKey: 'covers/khai-thi-quyen-1.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/khai-thi-quyen-1.jpg',
    tomTat: 'Tuyển tập những lời khai thị căn bản của Hòa Thượng Tuyên Hóa dẫn dắt người học Phật thiết thực hành trì Giới - Định - Tuệ, sám hối nghiệp chướng và phát khởi bồ-đề tâm kiên cố.'
  },
  {
    id: 'book_be52a401cd827d9b66bb9792b8db5044',
    tieu_de: 'Khai Thị — Quyển 2',
    sourceFile: path.join(BRAIN_DIR, 'cover_khai_thi_2_1789278523839.jpg'),
    objectKey: 'covers/khai-thi-quyen-2.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/khai-thi-quyen-2.jpg',
    tomTat: 'Lời khai thị thâm sâu của Hòa Thượng Tuyên Hóa về quy củ tu trì tại Vạn Phật Thánh Thành, oai lực của Kinh Chú Lăng Nghiêm và phương pháp phá trừ si mê vọng tưởng.'
  },
  {
    id: 'book_219ab04335d3bbfb165580fc8ac495e9',
    tieu_de: 'Khai Thị — Quyển 4',
    sourceFile: path.join(BRAIN_DIR, 'cover_khai_thi_4_1789278548035.jpg'),
    objectKey: 'covers/khai-thi-quyen-4.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/khai-thi-quyen-4.jpg',
    tomTat: 'Lời khai thị chuyên sâu của Hòa Thượng Tuyên Hóa về diệu dụng vô lượng của Thần Chú Đại Bi và phương pháp chí thành niệm danh hiệu Bồ Tát Quán Thế Âm để cảm ứng đạo giao.'
  },
  {
    id: 'book_e91ef5336221b1c48dde6341bf423bef',
    tieu_de: 'Khai Thị — Quyển 5',
    existingKey: 'covers/444a2c99-ccd8-4b6e-b8af-fac777598f22-Anh-chup-man-hinh-2026-08-28-100028.png',
    anhUrl: 'https://media.quangtu.vn/covers/444a2c99-ccd8-4b6e-b8af-fac777598f22-Anh-chup-man-hinh-2026-08-28-100028.png#pos=55%25%204%25',
    tomTat: 'Tuyển tập khai thị chỉ dạy công phu tu tập của Hòa Thượng Tuyên Hóa trong các kỳ thiền thất, Phật thất và thất Quán Âm, chỉ rõ cốt tủy phản bổn hoàn nguyên.'
  },
  {
    id: 'book_e7e9e35131db441efd4819880623a11a',
    tieu_de: 'Khai Thị — Quyển 6',
    existingKey: 'covers/a92511aa-03e1-4b87-a7db-07732609327c-Anh-chup-man-hinh-2026-08-28-100028.png',
    anhUrl: 'https://media.quangtu.vn/covers/a92511aa-03e1-4b87-a7db-07732609327c-Anh-chup-man-hinh-2026-08-28-100028.png#pos=55%25%204%25',
    tomTat: 'Lời khai thị của Hòa Thượng Tuyên Hóa soi sáng con đường khai mở Bát Nhã, thực hành nhẫn nhục ba-la-mật, giữ gìn chánh pháp và gánh vác sứ mạng xương minh Phật đạo.'
  },
  {
    id: 'book_362f4bce40f435b7a380d7e81e983c77',
    tieu_de: 'Linh Cảm Bồ Tát Địa Tạng',
    sourceFile: path.join(BRAIN_DIR, 'cover_linh_cam_dia_tang_1789278298995.jpg'),
    objectKey: 'covers/linh-cam-bo-tat-dia-tang.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/linh-cam-bo-tat-dia-tang.jpg',
    tomTat: 'Tổng hợp hạnh nguyện đại bi cứu khổ cứu nạn của Bồ Tát Địa Tạng và những câu chuyện linh cảm nhiệm màu có thật từ người chí thành đọc tụng, trì niệm danh hiệu Ngài.'
  },
  {
    id: 'book_aeea64c77b4096fa80518c759d3337f6',
    tieu_de: 'Địa Tạng Bồ Tát Bản Tích Linh Cảm Lục',
    sourceFile: path.join(BRAIN_DIR, 'cover_ban_tich_dia_tang_1789278317264.jpg'),
    objectKey: 'covers/dia-tang-bo-tat-ban-tich-linh-cam-luc.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/dia-tang-bo-tat-ban-tich-linh-cam-luc.jpg',
    tomTat: 'Bản tích bổn nguyện độ sinh của Địa Tạng Vương Bồ Tát cùng các tích truyện linh cảm ứng nghiệm qua các thời kỳ, do Đại sư Ấn Quang đích thân duyệt lãm và giám định.'
  },
  {
    id: 'book_369d61f117d384734e11cbec91c78dcc',
    tieu_de: 'Ấn Quang Pháp Sư Văn Sao Tục Biên',
    sourceFile: path.join(BRAIN_DIR, 'cover_van_sao_an_quang_1789278342664.jpg'),
    objectKey: 'covers/an-quang-phap-su-van-sao-tuc-bien.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/an-quang-phap-su-van-sao-tuc-bien.jpg',
    tomTat: 'Tuyển tập thư từ, pháp ngữ và khai thị tiếp nối của Ấn Quang Đại Sư — ngọn đuốc soi đường cho hành giả Tịnh Độ với tôn chỉ chân thật giữ vẹn luân thường, dứt ác làm lành, tha thiết niệm Phật.'
  },
  {
    id: 'book_cfab6dea8430aada3d2cf19180dd4d27',
    tieu_de: 'Lá Thư Tịnh Độ',
    sourceFile: path.join(BRAIN_DIR, 'cover_la_thu_tinh_do_1789278365450.jpg'),
    objectKey: 'covers/la-thu-tinh-do.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/la-thu-tinh-do.jpg',
    tomTat: 'Bức tâm thư quý giá đúc kết tinh hoa tu học Tịnh Độ của Đại sư Ấn Quang qua bản dịch truyền cảm của Hòa thượng Thiền Tâm, khai mở niềm tin sâu sắc vào cõi Tây Phương.'
  },
  {
    id: 'book_678c9f5cd97c7a9b9a08d3141b5fe468',
    tieu_de: 'Ngữ Lục',
    sourceFile: path.join(BRAIN_DIR, 'cover_ngu_luc_tuyen_hoa_1789278440238.jpg'),
    objectKey: 'covers/ngu-luc-ht-tuyen-hoa.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/ngu-luc-ht-tuyen-hoa.jpg',
    tomTat: 'Những lời pháp ngữ thẳng thắn, sáng tỏ như gương báu của Hòa Thượng Tuyên Hóa chỉ rõ căn cốt tu hành: nghiêm trì giới luật, không tham danh lợi, thật thà hành đạo.'
  },
  {
    id: 'book_8d90cc08f2897b4fd7d5712cf1372e94',
    tieu_de: 'Pháp Ngữ',
    sourceFile: path.join(BRAIN_DIR, 'cover_phap_ngu_tuyen_hoa_1789278471956.jpg'),
    objectKey: 'covers/phap-ngu-ht-tuyen-hoa.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/phap-ngu-ht-tuyen-hoa.jpg',
    tomTat: 'Tập hợp những lời dạy ngắn gọn mà cô đọng, giàu đạo lý của Hòa Thượng Tuyên Hóa giúp người học Phật tỉnh thức tâm trí và ứng dụng Phật pháp vào đời sống hàng ngày.'
  },
  {
    id: 'book_771454f42e9c9ed649160d7bc83de117',
    tieu_de: 'Niệm Phật Thập Yếu',
    existingKey: 'covers/5d6728b7-33f8-4420-ba17-1a7d7a7198d5-Anh-chup-man-hinh-2026-08-31-104836.png',
    anhUrl: 'https://media.quangtu.vn/covers/5d6728b7-33f8-4420-ba17-1a7d7a7198d5-Anh-chup-man-hinh-2026-08-31-104836.png#pos=56%25%2022%25',
    tomTat: 'Bộ luận kinh điển về mười điều cốt yếu của pháp môn Niệm Phật do Hòa thượng Thiền Tâm trước tác, từ phát tâm Bồ Đề đến phương pháp trợ niệm khi lâm chung để vãng sanh Cực Lạc.'
  },
  {
    id: 'book_c35b7e41c07303b630514153c39caa12',
    tieu_de: 'Quê Hương Cực Lạc',
    sourceFile: path.join(BRAIN_DIR, 'cover_que_huong_cuc_lac_1789278414636.jpg'),
    objectKey: 'covers/que-huong-cuc-lac.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/que-huong-cuc-lac.jpg',
    tomTat: 'Tổng hợp lời giáo huấn châu ngọc của chư Phật, chư Bồ Tát và chư Tổ sư về cõi nước an lạc trang nghiêm và pháp môn niệm Phật vi diệu giải thoát sinh tử.'
  },
  {
    id: 'book_ceedb666ca679c312bb423ee2f5b7f20',
    tieu_de: 'Đường Về Cực Lạc',
    sourceFile: path.join(BRAIN_DIR, 'cover_duong_ve_cuc_lac_1789278392178.jpg'),
    objectKey: 'covers/duong-ve-cuc-lac.jpg',
    anhUrl: 'https://media.quangtu.vn/covers/duong-ve-cuc-lac.jpg',
    tomTat: 'Tác phẩm dẫn lối tâm linh của Đại lão Hòa thượng Trí Tịnh khắc họa đại nguyện Phật A Di Đà, cảnh giới Cực Lạc và gương sáng vãng sanh của các bậc tiền hiền.'
  },
  {
    id: 'book_a47c6c21f218958e353d9bbb7f8fc74e',
    tieu_de: 'Nhân Quả Giải Theo Phật Giáo — Báo Ứng Hiện Đời Tập 5',
    existingKey: 'covers/1781137669714_a8ooz.webp',
    anhUrl: 'https://media.quangtu.vn/covers/1781137669714_a8ooz.webp',
    tomTat: 'Tuyển tập những câu chuyện nhân quả mắt thấy tai nghe có thật thời hiện đại, minh chứng rõ ràng lý báo ứng phân minh để thức tỉnh tâm người hướng thiện lánh ác.'
  }
];

function runD1Sql(sql) {
  const tmpFile = 'scratch/exec-temp.sql';
  writeFileSync(tmpFile, sql, 'utf-8');
  const res = spawnSync(
    'npx.cmd',
    ['wrangler', 'd1', 'execute', D1_DATABASE_NAME, '--remote', `--file=${tmpFile}`, '--json'],
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, shell: true }
  );
  try { unlinkSync(tmpFile); } catch {}
  if (res.status !== 0 || res.error) {
    throw new Error(`D1 error: ${res.error?.message || res.stderr || res.stdout}`);
  }
  const stdout = String(res.stdout || '').trim();
  const start = stdout.indexOf('[');
  const end = stdout.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(stdout.slice(start, end + 1));
  }
  const objStart = stdout.indexOf('{');
  const objEnd = stdout.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    return JSON.parse(stdout.slice(objStart, objEnd + 1));
  }
  return [];
}

function runR2Put(objectPath, localFilePath, contentType) {
  const res = spawnSync(
    'npx.cmd',
    ['wrangler', 'r2', 'object', 'put', objectPath, `--file=${localFilePath}`, `--content-type=${contentType}`, '--remote'],
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, shell: true }
  );
  if (res.status !== 0 || res.error) {
    throw new Error(`R2 put error: ${res.error?.message || res.stderr || res.stdout}`);
  }
  return res.stdout;
}

function sqlEscape(str) {
  return String(str || '').replace(/'/g, "''");
}

async function main() {
  console.log('=== BẮT ĐẦU ĐỒNG BỘ ẢNH BÌA & MÔ TẢ VÀO R2 VÀ D1 PRODUCTION ===\n');

  // Bước 1: Upload các ảnh mới lên R2 và thêm vào media_objects
  const mediaSqlStatements = [];

  for (const book of BOOKS) {
    if (book.sourceFile) {
      console.log(`[R2 Upload] Đang tải lên: ${book.objectKey}...`);
      const fileBytes = readFileSync(book.sourceFile);
      const byteSize = fileBytes.byteLength;
      const sha256 = createHash('sha256').update(fileBytes).digest('hex');
      const contentType = book.sourceFile.endsWith('.png') ? 'image/png' : 'image/jpeg';

      runR2Put(`quangtu/${book.objectKey}`, book.sourceFile, contentType);
      console.log(`    -> R2 Put thành công (${byteSize} bytes, sha256: ${sha256.slice(0, 10)}...)`);

      mediaSqlStatements.push(`
        INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at)
        VALUES ('${book.objectKey}', '${book.objectKey}', ${byteSize}, '${sha256}', '${contentType}', 'public, max-age=31536000, immutable', 0, datetime('now'))
        ON CONFLICT(object_key) DO UPDATE SET byte_size=excluded.byte_size, sha256=excluded.sha256;
      `);
    } else {
      console.log(`[R2 Re-use] Sách "${book.tieu_de}" sử dụng ảnh bìa R2 đã có: ${book.existingKey}`);
    }
  }

  if (mediaSqlStatements.length > 0) {
    console.log('\n[D1 media_objects] Đang ghi nhận metadata ảnh vào bảng media_objects...');
    runD1Sql(mediaSqlStatements.join('\n'));
    console.log('    -> Ghi nhận media_objects thành công!');
  }

  // Bước 2: Cập nhật bảng baiviet
  console.log('\n[D1 baiviet] Đang cập nhật anh_url và tom_tat cho 16 cuốn sách...');
  const updateSqlStatements = BOOKS.map((book) => `
    UPDATE baiviet 
    SET anh_url = '${sqlEscape(book.anhUrl)}',
        tom_tat = '${sqlEscape(book.tomTat)}',
        updated_at = datetime('now')
    WHERE id = '${sqlEscape(book.id)}';
  `);

  runD1Sql(updateSqlStatements.join('\n'));
  console.log('    -> Cập nhật baiviet thành công!');

  // Bước 3: Xác minh kết quả
  console.log('\n[Xác minh] Truy vấn kiểm tra lại 16 cuốn sách trên D1 production:');
  const verifyResult = runD1Sql(`
    SELECT id, tieu_de, 
           (CASE WHEN anh_url IS NOT NULL AND trim(anh_url) != '' THEN 1 ELSE 0 END) as has_cover,
           anh_url,
           substr(tom_tat, 1, 60) || '...' as tom_tat_preview
    FROM baiviet
    WHERE id LIKE 'book_%'
    ORDER BY tieu_de;
  `);

  const rows = verifyResult[0].results;
  let allGood = true;
  for (const row of rows) {
    if (!row.has_cover) {
      console.log(`  [CHƯA CÓ COVER] ${row.tieu_de} (${row.id})`);
      allGood = false;
    } else {
      console.log(`  [OK] ${row.tieu_de}: ${row.anh_url}`);
    }
  }

  if (allGood) {
    console.log('\n=== TẤT CẢ 16 CUỐN SÁCH ĐÃ ĐƯỢC ĐIỀN ĐẦY ĐỦ ẢNH COVER VÀ MÔ TẢ TRANG NGHIÊM! ===');
  } else {
    console.warn('\nMột số sách vẫn chưa có cover.');
  }
}

main().catch((err) => {
  console.error('LỖI THỰC THI:', err);
  process.exit(1);
});
