import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const sutrasConfig = [
  {
    key: 'kinh-duoc-su',
    id: 'tt_kinh_duoc_su',
    tieu_de: 'KINH DƯỢC SƯ',
    tac_gia: 'HT. Thích Trí Quảng soạn',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Dược Sư, Dược Sư Lưu Ly Quang Vương Như Lai, HT Thích Trí Quảng, Kinh Phật, Tụng Niệm, Tiêu Tai Trừ Bệnh',
    noi_bat: 1,
    coverSrc: 'scratch/covers/kinh-duoc-su.webp',
    coverKey: 'covers/kinh-duoc-su.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-duoc-su.clean.html',
    tom_tat: 'Nghi thức tụng niệm Kinh Dược Sư do Trưởng lão Hòa thượng Thích Trí Quảng biên soạn theo thể văn vần dễ tụng trì. Bản kinh hiển bày mười hai đại nguyện của Đức Dược Sư Lưu Ly Quang Vương Như Lai, giúp hành giả tiêu trừ nghiệp chướng tật bệnh, thân tâm an lạc, phúc thọ tăng long và vãng sanh cõi Tịnh Lưu Ly.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const startIdx = c.indexOf('NGUYỆN HƯƠNG');
      if (startIdx !== -1) {
        c = `<h2 style="text-align: center;">KINH DƯỢC SƯ</h2>
<p style="text-align: center;"><em>Trưởng lão Hòa thượng Thích Trí Quảng biên soạn</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<h3 style="text-align: center;">NGUYỆN HƯƠNG</h3>` + c.slice(startIdx + 'NGUYỆN HƯƠNG'.length);
      }
      return c;
    }
  },
  {
    key: 'kinh-vo-luong-tho',
    id: 'tt_kinh_vo_luong_tho',
    tieu_de: 'KINH VÔ LƯỢNG THỌ PHẬT',
    tac_gia: 'Tào Ngụy Khương Tăng Khải dịch - HT. Thích Trí Tịnh Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Vô Lượng Thọ, Phật A Di Đà, HT Thích Trí Tịnh, Cực Lạc Tây Phương, Tịnh Độ Tông, 48 Đại Nguyện, Kinh Phật',
    noi_bat: 1,
    coverSrc: 'scratch/covers/kinh-vo-luong-tho.webp',
    coverKey: 'covers/kinh-vo-luong-tho.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-vo-luong-tho.clean.html',
    tom_tat: 'Bộ kinh căn bản của pháp môn Tịnh Độ do Pháp sư Khương Tăng Khải dịch chữ Hán, Trưởng lão Hòa thượng Thích Trí Tịnh dịch Việt ngữ. Bản kinh tuyên thuyết 48 đại nguyện cứu độ cùng cảnh giới trang nghiêm thù thắng của Đức Phật A Di Đà nơi cõi Tây Phương Cực Lạc, chỉ rõ ba bậc vãng sanh và pháp tu đoạn trừ năm điều ác, năm sự thống khổ.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Như vậy, tôi nghe';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">KINH VÔ LƯỢNG THỌ PHẬT</h2>
<p style="text-align: center;"><em>Hán dịch: Tào Ngụy Khương Tăng Khải — Việt dịch: HT. Thích Trí Tịnh</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  },
  {
    key: 'kinh-dai-bi-tam-da-la-ni',
    id: 'tt_kinh_dai_bi_tam_da_la_ni',
    tieu_de: 'KINH ĐẠI BI TÂM ĐÀ LA NI',
    tac_gia: 'Đường Già Phạm Đạt Ma dịch - HT. Thích Thiền Tâm Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Đại Bi Tâm Đà La Ni, Chú Đại Bi, Quán Thế Âm Bồ Tát, HT Thích Thiền Tâm, Mật Tông, Kinh Phật',
    noi_bat: 0,
    coverSrc: 'scratch/covers/kinh-dai-bi-tam-da-la-ni.webp',
    coverKey: 'covers/kinh-dai-bi-tam-da-la-ni.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-dai-bi-tam-da-la-ni.clean.html',
    tom_tat: 'Kinh Thiên Thủ Thiên Nhãn Quán Thế Âm Bồ Tát Quảng Đại Viên Mãn Vô Ngại Đại Bi Tâm Đà La Ni do ngài Già Phạm Đạt Ma dịch chữ Hán, HT. Thích Thiền Tâm dịch Việt ngữ kèm chú giải tường tận. Kinh xiển dương oai thần 84 câu thần chú Đại Bi, 40 tướng tay thủ nhãn và bản nguyện từ bi vô lượng cứu khổ muôn loài của Bồ Tát Quán Thế Âm.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Như thế tôi nghe';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">KINH ĐẠI BI TÂM ĐÀ LA NI</h2>
<p style="text-align: center;"><em>Hán dịch: Đường Già Phạm Đạt Ma — Việt dịch: HT. Thích Thiền Tâm</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  },
  {
    key: 'nghi-quy-da-la-ni-tuy-cau-tuc-dac',
    id: 'tt_nghi_quy_tuy_cau_tuc_dac',
    tieu_de: 'NGHI QUỸ ĐÀ LA NI TÙY CẦU TỨC ĐẮC',
    tac_gia: 'Đường Bất Không dịch - HT. Thích Viên Đức Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Nghi Quỹ Đà La Ni Tùy Cầu Tức Đắc, Kim Cang Đảnh Du Già, HT Thích Viên Đức, Mật Giáo, Kinh Phật',
    noi_bat: 0,
    coverSrc: 'scratch/covers/nghi-quy-da-la-ni-tuy-cau-tuc-dac.webp',
    coverKey: 'covers/nghi-quy-da-la-ni-tuy-cau-tuc-dac.webp',
    cleanHtmlSrc: 'scratch/sutras/nghi-quy-da-la-ni-tuy-cau-tuc-dac.clean.html',
    tom_tat: 'Bộ nghi quỹ Mật giáo Kim Cang Đảnh Du Già Tối Thắng Bí Mật Thành Phật do Tam Tạng Bất Không dịch chữ Hán, HT. Thích Viên Đức dịch Việt ngữ. Trình bày chi tiết phép lập mạn đà la, kết ấn, quán tưởng chữ chủng tử và trì tụng chân ngôn Tùy Cầu Tức Đắc giúp hành giả diệt trừ ác nghiệp, hộ trì thân tâm và mau chứng vô thượng Bồ Đề.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Bấy giờ Bồ-tát Diệt Ác Thú';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">NGHI QUỸ ĐÀ LA NI TÙY CẦU TỨC ĐẮC</h2>
<p style="text-align: center;"><em>Kim Cang Đảnh Du Già Tối Thắng Bí Mật Thành Phật</em></p>
<p style="text-align: center;"><em>Hán dịch: Đại Đường Tam Tạng Bất Không — Việt dịch: HT. Thích Viên Đức</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  },
  {
    key: 'kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi',
    id: 'tt_kinh_nhap_nhu_lai_tri_duc_bat_tu_nghi',
    tieu_de: 'KINH ĐẠI PHƯƠNG QUẢNG NHẬP NHƯ LAI TRÍ ĐỨC BẤT TƯ NGHÌ',
    tac_gia: 'Đường Thật Xoa Nan Đà dịch - Thích Nữ Như Phúc Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Đại Phương Quảng, Nhập Như Lai Trí Đức, Thích Nữ Như Phúc, Kinh Phật, Đại Thừa, Trí Huệ Bất Tư Nghì',
    noi_bat: 0,
    coverSrc: 'scratch/covers/kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi.webp',
    coverKey: 'covers/kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi.clean.html',
    tom_tat: 'Bản kinh Đại Thừa thâm sâu hiển bày cảnh giới trí huệ giải thoát và vô lượng công đức bất tư nghì của chư Phật Như Lai. Bản dịch Việt ngữ của Thích Nữ Như Phúc dẫn dắt hành giả khai mở tuệ giác thanh tịnh, thâm nhập biển trí tuệ Như Lai và phát khởi hạnh nguyện đại bi cúng dường vô thượng.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Tôi nghe như vầy:';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">KINH ĐẠI PHƯƠNG QUẢNG NHẬP NHƯ LAI TRÍ ĐỨC BẤT TƯ NGHÌ</h2>
<p style="text-align: center;"><em>Hán dịch: Đại Đường Thật Xoa Nan Đà — Việt dịch: Thích Nữ Như Phúc</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  },
  {
    key: 'kinh-tuy-cau-tuc-dac-dai-tu-tai',
    id: 'tt_kinh_tuy_cau_tuc_dac_dai_tu_tai',
    tieu_de: 'KINH TÙY CẦU TỨC ĐẮC ĐẠI TỰ TẠI ĐÀ RA NI',
    tac_gia: 'Đường Bảo Tư Duy dịch - HT. Thích Viên Đức Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Tùy Cầu Tức Đắc Đại Tự Tại, HT Thích Viên Đức, Mật Giáo, Thần Chú, Kinh Phật',
    noi_bat: 0,
    coverSrc: 'scratch/covers/kinh-tuy-cau-tuc-dac-dai-tu-tai.webp',
    coverKey: 'covers/kinh-tuy-cau-tuc-dac-dai-tu-tai.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-tuy-cau-tuc-dac-dai-tu-tai.clean.html',
    tom_tat: 'Kinh Tùy Cầu Tức Đắc Đại Tự Tại Đà Ra Ni do ngài Bảo Tư Duy dịch chữ Hán, HT. Thích Viên Đức dịch Việt ngữ. Ghi lại lời Đức Phật khai thị cho Đại Phạm Thiên Vương về uy lực bất khả tư nghị của thần chú Tùy Cầu: tiêu diệt trọng tội, bảo hộ thân tâm khỏi lửa nước đao binh độc dữ, và giúp người tu sở cầu như ý, đời này an vui đời sau sanh thiên.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Như thật tôi nghe:';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">KINH TÙY CẦU TỨC ĐẮC ĐẠI TỰ TẠI ĐÀ RA NI</h2>
<p style="text-align: center;"><em>Hán dịch: Đại Đường Bảo Tư Duy — Việt dịch: HT. Thích Viên Đức</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  },
  {
    key: 'kinh-cuu-bat-nga-quy-diem-khau',
    id: 'tt_kinh_cuu_bat_nga_quy_diem_khau',
    tieu_de: 'KINH PHẬT THUYẾT ĐÀ LA NI CỨU BẠT NGẠ QUỶ DIỆM KHẨU',
    tac_gia: 'Đường Bất Không dịch - Sa môn Quảng Minh Việt dịch',
    danh_muc: 'KINH PHẬT',
    tags: 'Kinh Cứu Bạt Ngạ Quỷ Diệm Khẩu, Thí Thực, Diệm Khẩu, Sa Môn Quảng Minh, Mật Giáo, Kinh Phật',
    noi_bat: 0,
    coverSrc: 'scratch/covers/kinh-cuu-bat-nga-quy-diem-khau.webp',
    coverKey: 'covers/kinh-cuu-bat-nga-quy-diem-khau.webp',
    cleanHtmlSrc: 'scratch/sutras/kinh-cuu-bat-nga-quy-diem-khau.clean.html',
    tom_tat: 'Bộ kinh nguồn gốc của nghi thức Du-già Diệm Khẩu Thí Thực do ngài Tam Tạng Bất Không dịch Hán văn, Sa môn Quảng Minh Việt dịch. Duyên khởi khi Tôn giả A Nan gặp quỷ Diệm Khẩu và được Đức Thế Tôn truyền trao thần chú biến thực biến thủy vô lượng cam lộ, giúp cứu độ tất cả loài quỷ đói và chúng sanh nơi chốn u minh được no đủ, siêu thăng thiện đạo.',
    cleanContent: (html) => {
      let c = html.replace(/<div class="td-post-content[^"]*"[^>]*>/i, '');
      const marker = 'Một thời đức Thế Tôn ở tại Tăng già lam';
      const idx = c.indexOf(marker);
      if (idx !== -1) {
        c = `<h2 style="text-align: center;">KINH PHẬT THUYẾT ĐÀ LA NI CỨU BẠT NGẠ QUỶ DIỆM KHẨU</h2>
<p style="text-align: center;"><em>Hán dịch: Đại Đường Tam Tạng Bất Không — Việt dịch: Sa môn Quảng Minh</em></p>
<hr style="border:0;border-top:1px solid #dfb75c;width:120px;margin:20px auto;"/>
<p style="text-align: justify;">${marker}` + c.slice(idx + marker.length);
      }
      return c;
    }
  }
];

function getSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

function escapeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function generalClean(html) {
  return html
    .replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<h3 style="text-align: justify;">/gi, '<h3 style="text-align: center;">')
    .replace(/<h4 style="text-align: justify;">/gi, '<h4 style="text-align: center;">')
    .replace(/<p>\s*(&nbsp;|\s)*<\/p>/gi, '')
    .replace(/<p style="[^"]*">\s*(\*+|\*\s*\*\s*\*)\s*<\/p>/gi, '')
    .trim();
}

function chunkString(str, size) {
  const chunks = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

async function main() {
  const now = new Date().toISOString();
  const ngayDang = '18/09/2026';

  console.log('=== BƯỚC 1: TẠO VÀ THỰC THI SQL CỦA MEDIA_OBJECTS CHO COVERS ===');
  const mediaSql = [];
  for (const s of sutrasConfig) {
    const coverStats = fs.statSync(s.coverSrc);
    const coverSha = getSha256(s.coverSrc);

    mediaSql.push(`
INSERT INTO media_objects (object_key, source_path, byte_size, sha256, content_type, cache_control, baseline, created_at, deleted_at)
VALUES (${escapeSql(s.coverKey)}, ${escapeSql(s.coverKey)}, ${coverStats.size}, ${escapeSql(coverSha)}, 'image/webp', 'public, max-age=31536000, immutable', 1, ${escapeSql(now)}, NULL)
ON CONFLICT(object_key) DO UPDATE SET
  byte_size = excluded.byte_size,
  sha256 = excluded.sha256,
  content_type = excluded.content_type;
`);
  }

  const mediaSqlPath = path.resolve('scratch/seed-media.sql');
  fs.writeFileSync(mediaSqlPath, mediaSql.join('\n'), 'utf8');
  console.log(`Executing media_objects SQL...`);
  const mediaOut = execFileSync('powershell', ['-Command', `npx wrangler d1 execute DB --remote --config wrangler.sveltekit.jsonc --env production --file "${mediaSqlPath}"`], { encoding: 'utf8' });
  console.log(mediaOut);

  console.log('\n=== BƯỚC 2: THỰC THI TỪNG BỘ KINH VÀO BAIVIET D1 ===');
  for (const s of sutrasConfig) {
    console.log(`\nProcessing: [${s.id}] ${s.tieu_de}...`);
    const rawHtml = fs.readFileSync(s.cleanHtmlSrc, 'utf8');
    let content = s.cleanContent(rawHtml);
    content = generalClean(content);

    // Chunk content into 10,000 char blocks so no statement exceeds SQLite/D1 limits
    const CHUNK_SIZE = 10000;
    const chunks = chunkString(content, CHUNK_SIZE);
    console.log(`  -> Content length: ${content.length} chars, divided into ${chunks.length} chunks`);

    const bookSql = [];
    const firstChunk = chunks[0] || '';

    bookSql.push(`
INSERT INTO baiviet (
  id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, link_ngoai,
  noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, created_at, updated_at, pdf_url
) VALUES (
  ${escapeSql(s.id)},
  ${escapeSql(s.tieu_de)},
  ${escapeSql(s.tom_tat)},
  ${escapeSql(firstChunk)},
  ${escapeSql(s.danh_muc)},
  ${escapeSql(s.tags)},
  ${escapeSql(s.tac_gia)},
  ${escapeSql(s.coverKey)},
  '',
  ${s.noi_bat},
  ${escapeSql(ngayDang)},
  0,
  0,
  'Hoàn thành',
  '[]',
  ${escapeSql(now)},
  ${escapeSql(now)},
  NULL
)
ON CONFLICT(id) DO UPDATE SET
  tieu_de = excluded.tieu_de,
  tom_tat = excluded.tom_tat,
  noi_dung = excluded.noi_dung,
  danh_muc = excluded.danh_muc,
  tags = excluded.tags,
  tac_gia = excluded.tac_gia,
  anh_url = excluded.anh_url,
  noi_bat = excluded.noi_bat,
  ngay_dang = excluded.ngay_dang,
  trang_thai = excluded.trang_thai,
  updated_at = excluded.updated_at;
`);

    for (let i = 1; i < chunks.length; i++) {
      bookSql.push(`
UPDATE baiviet SET noi_dung = noi_dung || ${escapeSql(chunks[i])} WHERE id = ${escapeSql(s.id)};
`);
    }

    const singleSqlPath = path.resolve(`scratch/seed-${s.key}.sql`);
    fs.writeFileSync(singleSqlPath, bookSql.join('\n'), 'utf8');

    const out = execFileSync('powershell', ['-Command', `npx wrangler d1 execute DB --remote --config wrangler.sveltekit.jsonc --env production --file "${singleSqlPath}"`], { encoding: 'utf8' });
    console.log(`  -> Inserted ${s.id} successfully!`);
  }

  console.log('\n=== BƯỚC 3: KIỂM TRA LẠI TRÊN D1 REMOTE ===');
  const verifyCmd = `npx wrangler d1 execute DB --remote --config wrangler.sveltekit.jsonc --env production --command "SELECT id, tieu_de, danh_muc, tac_gia, anh_url, length(noi_dung) as content_len FROM baiviet WHERE id LIKE 'tt_kinh_%' OR id LIKE 'tt_nghi_quy_%' ORDER BY id;"`;
  const verifyOutput = execFileSync('powershell', ['-Command', verifyCmd], { encoding: 'utf8' });
  console.log(verifyOutput);

  console.log('\n>>> ĐÃ HOÀN TẤT TẤT CẢ 7 BỘ KINH LÊN CLOUDFLARE D1 VÀ R2 THÀNH CÔNG! <<<');
}

main().catch(err => {
  console.error('Lỗi khi thực hiện:', err);
  process.exit(1);
});
