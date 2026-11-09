import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const volumes = [
  {
    num: 1,
    volText: 'QUYỂN 1',
    highlight: 'BẢY CHỖ GẠN HỎI TÂM · THẦN CHÚ LĂNG NGHIÊM',
    subtext: 'Khai thị bản tâm thanh tịnh · Cứu độ A-Nan',
    colorAccent: '#C98A2C'
  },
  {
    num: 2,
    volText: 'QUYỂN 2',
    highlight: 'MƯỜI PHEN CHỈ THỊ CÁI THẤY',
    subtext: 'Thập phiên hiển kiến · Tánh thấy không sinh diệt',
    colorAccent: '#B87333'
  },
  {
    num: 3,
    volText: 'QUYỂN 3',
    highlight: 'NGŨ UẨN · LỤC NHẬP · THẬP BÁT GIỚI · THẤT ĐẠI',
    subtext: 'Vạn pháp quy về bản thể Như Lai Tạng',
    colorAccent: '#8B4513'
  },
  {
    num: 4,
    volText: 'QUYỂN 4',
    highlight: 'TAM CHỦNG TƯƠNG TỤC · HAI NGHĨA QUYẾT ĐỊNH',
    subtext: 'Nguồn gốc vũ trụ chúng sinh · Mở gút sáu căn',
    colorAccent: '#9E4712'
  },
  {
    num: 5,
    volText: 'QUYỂN 5',
    highlight: 'HAI MƯƠI LĂM VỊ THÁNH BẠCH VIÊN THÔNG',
    subtext: 'Mở sáu gút căn trần · Khởi tu phương tiện tối thắng',
    colorAccent: '#7A3803'
  },
  {
    num: 6,
    volText: 'QUYỂN 6',
    highlight: 'QUÁN ÂM NHĨ CĂN VIÊN THÔNG',
    subtext: 'Văn Thù tuyển chọn căn tu · Tứ thanh tịnh minh hối',
    colorAccent: '#2B547E'
  },
  {
    num: 7,
    volText: 'QUYỂN 7',
    highlight: 'ĐẠO TRÀNG & THẦN CHÚ THỦ LĂNG NGHIÊM',
    subtext: 'Năm đệ đại thần chú · Mười hai loài chúng sinh',
    colorAccent: '#6C2D58'
  },
  {
    num: 8,
    volText: 'QUYỂN 8',
    highlight: 'CÁC ĐỊA VỊ BỒ TÁT · BẢY CÕI LUÂN HỒI',
    subtext: 'Tiến trình tu chứng 60 quả vị · Quả báo mười phương',
    colorAccent: '#8A5A00'
  },
  {
    num: 9,
    volText: 'QUYỂN 9',
    highlight: 'PHÁ TRỪ NĂM MƯƠI CẢNH GIỚI ẤM MA (I)',
    subtext: 'Mười ma cảnh Sắc Ấm & Mười ma cảnh Thọ Ấm',
    colorAccent: '#701C1C'
  },
  {
    num: 10,
    volText: 'QUYỂN 10',
    highlight: 'PHÁ TRỪ NĂM MƯƠI CẢNH GIỚI ẤM MA (II)',
    subtext: 'Ma chướng Tưởng, Hành, Thức · Ngũ ấm giai không',
    colorAccent: '#5A1E1E'
  }
];

function generateHtml(v) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800;900&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,500&family=Lora:ital,wght@0,500;0,600;1,400&display=swap');
  
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  body {
    width: 800px;
    height: 1200px;
    overflow: hidden;
    background: #171109;
    font-family: 'Playfair Display', serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cover {
    width: 800px;
    height: 1200px;
    position: relative;
    background: radial-gradient(circle at 50% 38%, #3d2813 0%, #201409 60%, #110904 100%);
    padding: 50px 45px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    color: #f7ecd5;
    box-shadow: inset 0 0 100px rgba(0,0,0,0.85);
  }
  
  /* Texture layer */
  .cover::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.12;
    background-image: radial-gradient(#d4af37 1px, transparent 1px), radial-gradient(#d4af37 1px, transparent 1px);
    background-size: 32px 32px;
    background-position: 0 0, 16px 16px;
    pointer-events: none;
  }

  /* Ornate frame border */
  .border-outer {
    position: absolute;
    top: 25px;
    bottom: 25px;
    left: 25px;
    right: 25px;
    border: 2px solid #b38738;
    border-radius: 4px;
    pointer-events: none;
  }
  .border-inner {
    position: absolute;
    top: 33px;
    bottom: 33px;
    left: 33px;
    right: 33px;
    border: 1px solid rgba(212, 175, 55, 0.45);
    border-radius: 2px;
    pointer-events: none;
  }
  
  /* Corner decorations */
  .corner {
    position: absolute;
    width: 44px;
    height: 44px;
    border: 3px solid #dfb75c;
  }
  .corner-tl { top: 20px; left: 20px; border-right: none; border-bottom: none; }
  .corner-tr { top: 20px; right: 20px; border-left: none; border-bottom: none; }
  .corner-bl { bottom: 20px; left: 20px; border-right: none; border-top: none; }
  .corner-br { bottom: 20px; right: 20px; border-left: none; border-top: none; }

  .header {
    text-align: center;
    margin-top: 15px;
    position: relative;
    z-index: 2;
  }
  .slogan {
    font-family: 'Cinzel', serif;
    font-size: 15px;
    letter-spacing: 5px;
    color: #dfb75c;
    text-transform: uppercase;
    margin-bottom: 8px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.6);
  }
  .series-tag {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 3px;
    color: #e8d09f;
    border-top: 1px solid rgba(223, 183, 92, 0.4);
    border-bottom: 1px solid rgba(223, 183, 92, 0.4);
    padding: 3px 20px;
    text-transform: uppercase;
  }

  .main-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    position: relative;
    z-index: 2;
    margin: -10px 0;
  }
  
  .lotus-icon {
    width: 80px;
    height: 80px;
    margin-bottom: 18px;
    filter: drop-shadow(0 4px 10px rgba(223, 183, 92, 0.35));
  }

  .title-prefix {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 20px;
    color: #e0ca9b;
    letter-spacing: 2px;
    margin-bottom: 6px;
  }

  .title-main {
    font-family: 'Cinzel', serif;
    font-size: 46px;
    font-weight: 900;
    letter-spacing: 4px;
    line-height: 1.15;
    background: linear-gradient(180deg, #fff7e0 0%, #edd391 50%, #c49638 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 10px 25px rgba(0,0,0,0.7);
    margin-bottom: 12px;
  }

  .title-sub {
    font-family: 'Lora', serif;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 8px;
    color: #dfb75c;
    text-transform: uppercase;
    margin-bottom: 24px;
    position: relative;
    padding: 0 20px;
  }
  .title-sub::before, .title-sub::after {
    content: "◆";
    position: absolute;
    font-size: 14px;
    top: 50%;
    transform: translateY(-50%);
    color: #dfb75c;
    opacity: 0.8;
  }
  .title-sub::before { left: -10px; }
  .title-sub::after { right: -10px; }

  /* Volume emblem */
  .volume-badge {
    background: radial-gradient(circle, #541616 0%, #2b0606 100%);
    border: 2px solid #e5c168;
    box-shadow: 0 6px 20px rgba(0,0,0,0.6), 0 0 15px rgba(229, 193, 104, 0.25);
    border-radius: 40px;
    padding: 10px 38px;
    margin-bottom: 24px;
  }
  .volume-text {
    font-family: 'Cinzel', serif;
    font-size: 24px;
    font-weight: 800;
    color: #ffe6aa;
    letter-spacing: 5px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  }

  .chapter-box {
    max-width: 620px;
    background: rgba(18, 11, 4, 0.65);
    border: 1px solid rgba(223, 183, 92, 0.35);
    border-radius: 6px;
    padding: 18px 24px;
    backdrop-filter: blur(4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .chapter-highlight {
    font-family: 'Playfair Display', serif;
    font-size: 17px;
    font-weight: 700;
    color: #fce8c0;
    letter-spacing: 1.5px;
    line-height: 1.4;
    margin-bottom: 6px;
  }
  .chapter-subtext {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 14px;
    color: #c7b28c;
    letter-spacing: 0.5px;
  }

  .footer {
    text-align: center;
    margin-bottom: 20px;
    position: relative;
    z-index: 2;
  }
  .author-intro {
    font-size: 13px;
    color: #bfa16f;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 4px;
  }
  .author-name {
    font-family: 'Cinzel', serif;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 3px;
    color: #fff1d0;
    text-shadow: 0 2px 6px rgba(0,0,0,0.6);
    margin-bottom: 16px;
  }
  .library-mark {
    font-family: 'Lora', serif;
    font-size: 12px;
    letter-spacing: 4px;
    color: #8c734e;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="cover">
    <div class="border-outer"></div>
    <div class="border-inner"></div>
    <div class="corner corner-tl"></div>
    <div class="corner corner-tr"></div>
    <div class="corner corner-bl"></div>
    <div class="corner corner-br"></div>

    <div class="header">
      <div class="slogan">Vạn Phật Thánh Thành</div>
      <div class="series-tag">Đại Thừa Diệu Pháp Kinh Điển</div>
    </div>

    <div class="main-center">
      <svg class="lotus-icon" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 15 C55 35 68 55 50 82 C32 55 45 35 50 15 Z" fill="url(#goldGrad)" opacity="0.9"/>
        <path d="M50 35 C62 48 78 60 74 76 C58 78 52 64 50 35 Z" fill="url(#goldGrad)" opacity="0.75"/>
        <path d="M50 35 C38 48 22 60 26 76 C42 78 48 64 50 35 Z" fill="url(#goldGrad)" opacity="0.75"/>
        <path d="M50 50 C68 62 88 68 84 84 C68 84 58 72 50 50 Z" fill="url(#goldGrad)" opacity="0.6"/>
        <path d="M50 50 C32 62 12 68 16 84 C32 84 42 72 50 50 Z" fill="url(#goldGrad)" opacity="0.6"/>
        <circle cx="50" cy="85" r="4" fill="#dfb75c"/>
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff0cc"/>
            <stop offset="50%" stop-color="#dfb75c"/>
            <stop offset="100%" stop-color="#8c581e"/>
          </linearGradient>
        </defs>
      </svg>

      <div class="title-prefix">Kinh Đại Phật Đảnh</div>
      <div class="title-main">THỦ LĂNG NGHIÊM</div>
      <div class="title-sub">Lược Giảng</div>

      <div class="volume-badge">
        <div class="volume-text">${v.volText}</div>
      </div>

      <div class="chapter-box">
        <div class="chapter-highlight">${v.highlight}</div>
        <div class="chapter-subtext">${v.subtext}</div>
      </div>
    </div>

    <div class="footer">
      <div class="author-intro">Giảng giải</div>
      <div class="author-name">HÒA THƯỢNG TUYÊN HÓA</div>
      <div class="library-mark">Tu Tâm Phật Học Thư Viện</div>
    </div>
  </div>
</body>
</html>`;
}

async function run() {
  const outDir = path.resolve('scratch/covers');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 800, height: 1200 },
    deviceScaleFactor: 1
  });

  for (const v of volumes) {
    const html = generateHtml(v);
    await page.setContent(html, { waitUntil: 'networkidle' });
    const padded = String(v.num).padStart(2, '0');
    const outPath = path.join(outDir, `kinh-lang-nghiem-luoc-giang-ht-tuyen-hoa-q${padded}.webp`);
    await page.screenshot({ path: outPath, type: 'webp', quality: 90 });
    const stats = fs.statSync(outPath);
    console.log(`Generated: ${outPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();
  console.log('Finished generating 10 covers.');
}

run().catch(console.error);
