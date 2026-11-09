import fs from 'fs';
import path from 'path';

const sutrasToFetch = [
  {
    key: 'kinh-duoc-su',
    url: 'https://phatphapungdung.com/phap-bao/kinh-duoc-su-ht-thich-tri-quang-soan-165575.html',
    defaultTitle: 'KINH DƯỢC SƯ',
    defaultTacGia: 'HT. Thích Trí Quảng soạn'
  },
  {
    key: 'kinh-vo-luong-tho',
    url: 'https://phatphapungdung.com/phap-bao/kinh-vo-luong-tho-phat-164144.html',
    defaultTitle: 'KINH VÔ LƯỢNG THỌ PHẬT',
    defaultTacGia: 'Tào Ngụy Khương Tăng Khải dịch - HT. Thích Trí Tịnh Việt dịch'
  },
  {
    key: 'kinh-dai-bi-tam-da-la-ni',
    url: 'https://phatphapungdung.com/phap-bao/kinh-dai-bi-tam-da-la-ni-168637.html',
    defaultTitle: 'KINH ĐẠI BI TÂM ĐÀ LA NI',
    defaultTacGia: 'Tây Thiên Trúc Già Phạm Đạt Ma dịch'
  },
  {
    key: 'nghi-quy-da-la-ni-tuy-cau-tuc-dac',
    url: 'https://phatphapungdung.com/phap-bao/nghi-quy-da-la-ni-tuy-cau-tuc-dac-than-bien-gia-tri-thanh-tuu-kim-cang-danh-du-gia-toi-thang-bi-mat-thanh-phat-168841.html',
    defaultTitle: 'NGHI QUỸ ĐÀ LA NI TÙY CẦU TỨC ĐẮC',
    defaultTacGia: 'Tam Tạng Bất Không dịch'
  },
  {
    key: 'kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi',
    url: 'https://phatphapungdung.com/phap-bao/kinh-dai-phuong-quang-nhap-nhu-lai-tri-duc-bat-tu-nghi-114499.html',
    defaultTitle: 'KINH ĐẠI PHƯƠNG QUẢNG NHẬP NHƯ LAI TRÍ ĐỨC BẤT TƯ NGHÌ',
    defaultTacGia: 'Đại Đường Pháp Thành dịch'
  },
  {
    key: 'kinh-tuy-cau-tuc-dac-dai-tu-tai',
    url: 'https://phatphapungdung.com/phap-bao/kinh-tuy-cau-tuc-dac-dai-tu-tai-da-ra-ni-168806.html',
    defaultTitle: 'KINH TÙY CẦU TỨC ĐẮC ĐẠI TỰ TẠI ĐÀ RA NI',
    defaultTacGia: 'Bảo Tư Duy dịch'
  },
  {
    key: 'kinh-cuu-bat-nga-quy-diem-khau',
    url: 'https://phatphapungdung.com/phap-bao/kinh-phat-thuyet-da-la-ni-cuu-bat-nga-quy-diem-khau-168750.html',
    defaultTitle: 'KINH PHẬT THUYẾT ĐÀ LA NI CỨU BẠT NGẠ QUỶ DIỆM KHẨU',
    defaultTacGia: 'Tam Tạng Bất Không dịch'
  }
];

const outDir = path.resolve('scratch/sutras');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function fetchAndProcess() {
  for (const item of sutrasToFetch) {
    console.log(`\nFetching [${item.key}]: ${item.url}...`);
    try {
      const res = await fetch(item.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) {
        console.error(`Failed to fetch ${item.key}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      fs.writeFileSync(path.join(outDir, `${item.key}.raw.html`), html, 'utf8');

      // Extract article title
      const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i) 
                      || html.match(/<title>([^<]+)<\/title>/i);
      let pageTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : item.defaultTitle;
      pageTitle = pageTitle.replace(/\s*-\s*Pháp Bảo Phật Giáo.*$/i, '').trim();

      // Extract main content from td-post-content
      const contentStart = html.indexOf('<div class="td-post-content');
      let bodyHtml = '';
      if (contentStart !== -1) {
        // Find closing of td-post-content or footer
        let contentEnd = html.indexOf('<footer>', contentStart);
        if (contentEnd === -1) {
          contentEnd = html.indexOf('<div class="td-post-sharing', contentStart);
        }
        if (contentEnd === -1) {
          contentEnd = html.indexOf('<!-- .entry-content -->', contentStart);
        }
        if (contentEnd !== -1) {
          bodyHtml = html.slice(contentStart, contentEnd);
        } else {
          bodyHtml = html.slice(contentStart, contentStart + 300000);
        }
      }

      console.log(`  -> Title: "${pageTitle}"`);
      console.log(`  -> Raw content length: ${bodyHtml.length}`);

      // Basic cleanup
      let cleanHtml = bodyHtml
        // Remove scripts & styles
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        // Remove comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Remove ads or share buttons
        .replace(/<div class="td-a-rec[\s\S]*?<\/div>/gi, '')
        .replace(/<div class="td-post-sharing[\s\S]*?<\/div>/gi, '')
        .replace(/<div class="td-post-featured-image[\s\S]*?<\/div>/gi, '')
        // Remove 'Xem thêm' blocks or similar bottom blocks
        .replace(/<div class="td-post-source-tags[\s\S]*?<\/div>/gi, '')
        // Remove empty paragraphs
        .replace(/<p>\s*(&nbsp;|\s)*<\/p>/gi, '')
        .trim();

      fs.writeFileSync(path.join(outDir, `${item.key}.clean.html`), cleanHtml, 'utf8');
      console.log(`  -> Saved clean html: ${cleanHtml.length} chars`);
    } catch (err) {
      console.error(`Error on ${item.key}:`, err);
    }
  }
}

fetchAndProcess();
