import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const sutraCovers = [
  {
    key: 'kinh-duoc-su',
    slogan: 'DIỆT TRỪ TẬT BỆNH · TIÊU TAI DIỄN THỌ',
    titlePrefix: 'Kinh Điển Đại Thừa',
    titleMain: 'KINH DƯỢC SƯ',
    titleSub: 'BỔN NGUYỆN CÔNG ĐỨC',
    highlight: '12 ĐẠI NGUYỆN CỦA ĐỨC DƯỢC SƯ LƯU LY QUANG',
    subtext: 'Bạt trừ nghiệp chướng · Thân tâm an lạc · Phúc thọ tăng long',
    authorRole: 'Biên soạn & Tuyên giảng',
    authorName: 'HT. THÍCH TRÍ QUẢNG',
    bgGradient: 'radial-gradient(circle at 50% 36%, #123761 0%, #091e38 55%, #050f1d 100%)',
    borderColor: '#4da8da',
    accentColor: '#dfb75c',
    iconType: 'medicine_bowl'
  },
  {
    key: 'kinh-vo-luong-tho',
    slogan: 'TỊNH ĐỘ CĂN BẢN · ĐẠI THỪA PHÁP BẢO',
    titlePrefix: 'Phật Thuyết',
    titleMain: 'KINH VÔ LƯỢNG THỌ',
    titleSub: 'PHẬT THUYẾT VÔ LƯỢNG THỌ KINH',
    highlight: '48 ĐẠI NGUYỆN PHÁP TẠNG · TRANG NGHIÊM CỰC LẠC',
    subtext: 'Ba bậc vãng sanh · Đoạn trừ ngũ ác · Thành tựu Bồ Đề',
    authorRole: 'Hán dịch: Khương Tăng Khải — Việt dịch',
    authorName: 'HT. THÍCH TRÍ TỊNH',
    bgGradient: 'radial-gradient(circle at 50% 36%, #4a290a 0%, #291605 55%, #130a02 100%)',
    borderColor: '#e67e22',
    accentColor: '#ffd700',
    iconType: 'infinite_lotus'
  },
  {
    key: 'kinh-dai-bi-tam-da-la-ni',
    slogan: 'MẬT TẠNG DIỆU DỤNG · ĐẠI TỪ ĐẠI BI',
    titlePrefix: 'Thiên Thủ Thiên Nhãn Quán Thế Âm',
    titleMain: 'KINH ĐẠI BI TÂM',
    titleSub: 'ĐÀ LA NI',
    highlight: '84 CÂU ĐẠI BI THẦN CHÚ · 40 TƯỚNG TAY THỦ NHÃN',
    subtext: 'Quảng đại viên mãn · Vô ngại từ bi · Diệt trừ tội khổ',
    authorRole: 'Hán dịch: Già Phạm Đạt Ma — Việt dịch',
    authorName: 'HT. THÍCH THIỀN TÂM',
    bgGradient: 'radial-gradient(circle at 50% 36%, #3b1654 0%, #210c30 55%, #100517 100%)',
    borderColor: '#af7ac5',
    accentColor: '#dfb75c',
    iconType: 'avalokiteshvara_hands'
  },
  {
    key: 'nghi-quy-da-la-ni-tuy-cau-tuc-dac',
    slogan: 'DU GIÀ TỐI THẮNG · BÍ MẬT THÀNH PHẬT',
    titlePrefix: 'Kim Cang Đảnh Du Già',
    titleMain: 'NGHI QUỸ ĐÀ LA NI',
    titleSub: 'TÙY CẦU TỨC ĐẮC',
    highlight: 'THẦN BIẾN GIA TRÌ · THÀNH TỰU BÍ MẬT PHÁP TẠNG',
    subtext: 'Nghi thức đàn tràng · Thủ ấn quán tưởng · Sở cầu như ý',
    authorRole: 'Hán dịch: Tam Tạng Bất Không — Việt dịch',
    authorName: 'HT. THÍCH VIÊN ĐỨC',
    bgGradient: 'radial-gradient(circle at 50% 36%, #4e1217 0%, #2b080b 55%, #150305 100%)',
    borderColor: '#e74c3c',
    accentColor: '#f1c40f',
    iconType: 'vajra_sceptre'
  },
  {
    key: 'kinh-nhap-nhu-lai-tri-duc-bat-tu-nghi',
    slogan: 'ĐẠI PHƯƠNG QUẢNG · HOA NGHIÊM DIỆU NGHĨA',
    titlePrefix: 'Kinh Đại Phương Quảng',
    titleMain: 'NHẬP NHƯ LAI TRÍ ĐỨC',
    titleSub: 'BẤT TƯ NGHÌ',
    highlight: 'BIỂN CÔNG ĐỨC NHƯ LAI · CẢNH GIỚI TRÍ HUỆ VÔ CÙNG',
    subtext: 'Phát Bồ Đề tâm · Nhập biển trí Phật · Giáo hóa cùng khắp',
    authorRole: 'Hán dịch: Thật Xoa Nan Đà — Việt dịch',
    authorName: 'THÍCH NỮ NHƯ PHÚC',
    bgGradient: 'radial-gradient(circle at 50% 36%, #172852 0%, #0d1730 55%, #050b18 100%)',
    borderColor: '#5dade2',
    accentColor: '#dfb75c',
    iconType: 'dharmachakra'
  },
  {
    key: 'kinh-tuy-cau-tuc-dac-dai-tu-tai',
    slogan: 'MẬT TẠNG BẢO ĐIỂN · DIỆT TỘI TIÊU TAI',
    titlePrefix: 'Phật Thuyết',
    titleMain: 'TÙY CẦU TỨC ĐẮC',
    titleSub: 'ĐẠI TỰ TẠI ĐÀ RA NI',
    highlight: 'NHƯ Ý BẢO CHÂU · HỘ TRÌ THÂN MẠNG BÌNH AN',
    subtext: 'Tránh đao binh độc hại · Tiêu diệt ác nghiệp · Phước đức vô lượng',
    authorRole: 'Hán dịch: Bảo Tư Duy — Việt dịch',
    authorName: 'HT. THÍCH VIÊN ĐỨC',
    bgGradient: 'radial-gradient(circle at 50% 36%, #134636 0%, #0b2920 55%, #041410 100%)',
    borderColor: '#48c9b0',
    accentColor: '#dfb75c',
    iconType: 'cintamani'
  },
  {
    key: 'kinh-cuu-bat-nga-quy-diem-khau',
    slogan: 'DU GIÀ THÍ THỰC · CỨU KHỔ U MINH',
    titlePrefix: 'Phật Thuyết Đà La Ni',
    titleMain: 'CỨU BẠT NGẠ QUỶ',
    titleSub: 'DIỆM KHẨU ĐÀ LA NI',
    highlight: 'BIẾN THỰC BIẾN THỦY · PHỔ ĐỘ PHÁP GIỚI CHÚNG SANH',
    subtext: 'Duyên khởi A-Nan · Khai mở cổ họng đói khát · Sanh về thiện đạo',
    authorRole: 'Hán dịch: Tam Tạng Bất Không — Việt dịch',
    authorName: 'SA MÔN QUẢNG MINH',
    bgGradient: 'radial-gradient(circle at 50% 36%, #4d2b12 0%, #2b1708 55%, #140a03 100%)',
    borderColor: '#eb984e',
    accentColor: '#f5b041',
    iconType: 'nectar_vase'
  }
];

function renderSvgIcon(type) {
  switch (type) {
    case 'medicine_bowl': // Lapis Lazuli Medicine Bowl & Myrobalan
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <path d="M50 18 C58 28 64 36 60 48 C55 38 45 38 40 48 C36 36 42 28 50 18 Z" fill="url(#goldGrad)" opacity="0.85"/>
        <path d="M28 54 C28 46 36 44 50 44 C64 44 72 46 72 54 C72 74 62 82 50 82 C38 82 28 74 28 54 Z" fill="url(#goldGrad)" opacity="0.75"/>
        <ellipse cx="50" cy="54" rx="22" ry="7" fill="#091e38" stroke="url(#goldGrad)" stroke-width="2"/>
        <circle cx="50" cy="54" r="3.5" fill="#4da8da"/>
        <path d="M50 30 L50 44" stroke="url(#goldGrad)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="50" cy="24" r="3" fill="#dfb75c"/>
      </svg>`;

    case 'infinite_lotus': // Thousand-Petal Lotus of Amitabha
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <!-- Central Lotus -->
        <path d="M50 15 C56 34 68 54 50 82 C32 54 44 34 50 15 Z" fill="url(#goldGrad)" opacity="0.9"/>
        <path d="M50 35 C63 48 78 60 74 76 C58 78 52 64 50 35 Z" fill="url(#goldGrad)" opacity="0.75"/>
        <path d="M50 35 C37 48 22 60 26 76 C42 78 48 64 50 35 Z" fill="url(#goldGrad)" opacity="0.75"/>
        <path d="M50 50 C68 62 88 68 84 84 C68 84 58 72 50 50 Z" fill="url(#goldGrad)" opacity="0.6"/>
        <path d="M50 50 C32 62 12 68 16 84 C32 84 42 72 50 50 Z" fill="url(#goldGrad)" opacity="0.6"/>
        <circle cx="50" cy="85" r="4" fill="#ffd700"/>
      </svg>`;

    case 'avalokiteshvara_hands': // Compassionate Moonlight / Thousand Arms Motif
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <!-- Radiant Halo -->
        <circle cx="50" cy="50" r="34" stroke="url(#goldGrad)" stroke-width="1.2" opacity="0.5"/>
        <!-- Willow Branch & Pure Water Vase -->
        <path d="M38 68 C38 56 44 52 50 52 C56 52 62 56 62 68 C62 76 56 80 50 80 C44 80 38 76 38 68 Z" fill="url(#goldGrad)" opacity="0.8"/>
        <path d="M47 52 L47 42 C47 38 53 38 53 42 L53 52" stroke="url(#goldGrad)" stroke-width="2.5" fill="none"/>
        <path d="M50 38 C56 26 68 22 74 24 C72 32 64 36 50 38 Z" fill="url(#goldGrad)" opacity="0.85"/>
        <circle cx="68" cy="24" r="2.5" fill="#fff"/>
        <circle cx="50" cy="66" r="3" fill="#af7ac5"/>
      </svg>`;

    case 'vajra_sceptre': // Vajra of Tantric Power
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <!-- Center Spherical Hub -->
        <circle cx="50" cy="50" r="8" fill="url(#goldGrad)"/>
        <!-- Top Prongs -->
        <path d="M50 42 L50 16 M45 40 C42 26 36 22 47 16 M55 40 C58 26 64 22 53 16" stroke="url(#goldGrad)" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Bottom Prongs -->
        <path d="M50 58 L50 84 M45 60 C42 74 36 78 47 84 M55 60 C58 74 64 78 53 84" stroke="url(#goldGrad)" stroke-width="2.5" stroke-linecap="round"/>
        <!-- Side Lotus Collars -->
        <ellipse cx="50" cy="42" rx="10" ry="3" fill="url(#goldGrad)" opacity="0.8"/>
        <ellipse cx="50" cy="58" rx="10" ry="3" fill="url(#goldGrad)" opacity="0.8"/>
        <circle cx="50" cy="50" r="3" fill="#f1c40f"/>
      </svg>`;

    case 'dharmachakra': // Eight-spoked Wheel of the Law
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <circle cx="50" cy="50" r="34" stroke="url(#goldGrad)" stroke-width="3" fill="none"/>
        <circle cx="50" cy="50" r="10" fill="url(#goldGrad)"/>
        <circle cx="50" cy="50" r="4" fill="#0a1228"/>
        <!-- 8 Spokes -->
        <line x1="50" y1="16" x2="50" y2="84" stroke="url(#goldGrad)" stroke-width="2.5"/>
        <line x1="16" y1="50" x2="84" y2="50" stroke="url(#goldGrad)" stroke-width="2.5"/>
        <line x1="26" y1="26" x2="74" y2="74" stroke="url(#goldGrad)" stroke-width="2.5"/>
        <line x1="26" y1="74" x2="74" y2="26" stroke="url(#goldGrad)" stroke-width="2.5"/>
      </svg>`;

    case 'cintamani': // Wish-fulfilling Flaming Jewel
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <!-- Lotus Base -->
        <path d="M26 76 C34 70 42 72 50 78 C58 72 66 70 74 76 C68 84 32 84 26 76 Z" fill="url(#goldGrad)" opacity="0.8"/>
        <!-- Flaming Jewel Triple Orbs -->
        <circle cx="42" cy="58" r="12" fill="url(#goldGrad)" opacity="0.85"/>
        <circle cx="58" cy="58" r="12" fill="url(#goldGrad)" opacity="0.85"/>
        <circle cx="50" cy="44" r="13" fill="url(#goldGrad)"/>
        <!-- Flaming Aura Peak -->
        <path d="M50 18 C55 28 58 34 50 40 C42 34 45 28 50 18 Z" fill="url(#goldGrad)"/>
        <circle cx="50" cy="44" r="4" fill="#2ecc71"/>
      </svg>`;

    case 'nectar_vase': // Vase of Sweet Dew / Cam Lộ Bình
      return `
      <svg class="sacred-icon" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="46" stroke="url(#goldGrad)" stroke-width="1.5" opacity="0.6" stroke-dasharray="4 3"/>
        <!-- Radiant Nectar Cloud -->
        <path d="M34 68 C34 52 42 46 50 46 C58 46 66 52 66 68 C66 78 58 82 50 82 C42 82 34 78 34 68 Z" fill="url(#goldGrad)" opacity="0.85"/>
        <ellipse cx="50" cy="46" rx="12" ry="4" fill="url(#goldGrad)"/>
        <path d="M46 46 L46 34 C46 30 54 30 54 34 L54 46" stroke="url(#goldGrad)" stroke-width="2.5" fill="none"/>
        <ellipse cx="50" cy="32" rx="9" ry="3" fill="url(#goldGrad)"/>
        <!-- Nectar Sprig -->
        <path d="M50 30 C56 18 64 20 62 26 C56 26 52 28 50 30 Z" fill="url(#goldGrad)"/>
        <circle cx="50" cy="65" r="4" fill="#e67e22"/>
      </svg>`;

    default:
      return '';
  }
}

function generateHtml(item) {
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
    background: #0d0a06;
    font-family: 'Playfair Display', serif;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .cover {
    width: 800px;
    height: 1200px;
    position: relative;
    background: ${item.bgGradient};
    padding: 50px 45px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    color: #f7ecd5;
    box-shadow: inset 0 0 120px rgba(0,0,0,0.9);
  }
  
  /* Texture layer */
  .cover::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.1;
    background-image: radial-gradient(${item.accentColor} 1px, transparent 1px), radial-gradient(${item.accentColor} 1px, transparent 1px);
    background-size: 32px 32px;
    background-position: 0 0, 16px 16px;
    pointer-events: none;
  }

  /* Ornate frame border */
  .border-outer {
    position: absolute;
    top: 24px;
    bottom: 24px;
    left: 24px;
    right: 24px;
    border: 2px solid ${item.accentColor};
    border-radius: 4px;
    pointer-events: none;
    opacity: 0.85;
  }
  .border-inner {
    position: absolute;
    top: 32px;
    bottom: 32px;
    left: 32px;
    right: 32px;
    border: 1px solid rgba(223, 183, 92, 0.4);
    border-radius: 2px;
    pointer-events: none;
  }
  
  /* Corner decorations */
  .corner {
    position: absolute;
    width: 44px;
    height: 44px;
    border: 3px solid ${item.accentColor};
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
    font-size: 14px;
    letter-spacing: 5px;
    color: ${item.accentColor};
    text-transform: uppercase;
    margin-bottom: 8px;
    text-shadow: 0 2px 5px rgba(0,0,0,0.8);
  }
  .series-tag {
    display: inline-block;
    font-size: 12px;
    letter-spacing: 4px;
    color: #eeddbb;
    border-top: 1px solid rgba(223, 183, 92, 0.4);
    border-bottom: 1px solid rgba(223, 183, 92, 0.4);
    padding: 4px 22px;
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
  
  .sacred-icon {
    width: 96px;
    height: 96px;
    margin-bottom: 20px;
    filter: drop-shadow(0 6px 14px rgba(223, 183, 92, 0.45));
  }

  .title-prefix {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 21px;
    color: #edd9b0;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }

  .title-main {
    font-family: 'Cinzel', serif;
    font-size: 44px;
    font-weight: 900;
    letter-spacing: 3px;
    line-height: 1.18;
    background: linear-gradient(180deg, #ffffff 0%, #fae5b5 50%, #c9993b 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-shadow: 0 10px 25px rgba(0,0,0,0.8);
    margin-bottom: 12px;
  }

  .title-sub {
    font-family: 'Lora', serif;
    font-size: 24px;
    font-weight: 600;
    letter-spacing: 6px;
    color: ${item.accentColor};
    text-transform: uppercase;
    margin-bottom: 24px;
    position: relative;
    padding: 0 20px;
  }
  .title-sub::before, .title-sub::after {
    content: "◆";
    position: absolute;
    font-size: 13px;
    top: 50%;
    transform: translateY(-50%);
    color: ${item.accentColor};
    opacity: 0.8;
  }
  .title-sub::before { left: -10px; }
  .title-sub::after { right: -10px; }

  .chapter-box {
    margin-top: 14px;
    padding: 16px 28px;
    border-top: 1px solid rgba(223, 183, 92, 0.35);
    border-bottom: 1px solid rgba(223, 183, 92, 0.35);
    background: rgba(0,0,0,0.3);
    max-width: 660px;
    backdrop-filter: blur(4px);
    border-radius: 4px;
  }
  .chapter-highlight {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 2.5px;
    color: #ffffff;
    margin-bottom: 6px;
    line-height: 1.4;
  }
  .chapter-subtext {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 14px;
    color: #e0d0b8;
    letter-spacing: 0.5px;
  }

  .footer {
    text-align: center;
    margin-bottom: 15px;
    position: relative;
    z-index: 2;
  }
  .author-intro {
    font-family: 'Lora', serif;
    font-style: italic;
    font-size: 14px;
    color: #edd9b0;
    margin-bottom: 4px;
  }
  .author-name {
    font-family: 'Cinzel', serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 4px;
    color: #fff4db;
    margin-bottom: 14px;
    text-shadow: 0 2px 4px rgba(0,0,0,0.8);
  }
  .library-mark {
    font-family: 'Lora', serif;
    font-size: 11px;
    letter-spacing: 5px;
    color: ${item.accentColor};
    text-transform: uppercase;
    opacity: 0.9;
  }

  defs {
    display: block;
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
      <div class="slogan">${item.slogan}</div>
      <div class="series-tag">Pháp Bảo Đại Thừa · Tu Tâm Thư Viện</div>
    </div>

    <div class="main-center">
      <svg width="0" height="0" style="position:absolute">
        <defs>
          <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#fff8e7"/>
            <stop offset="50%" stop-color="${item.accentColor}"/>
            <stop offset="100%" stop-color="#8c581e"/>
          </linearGradient>
        </defs>
      </svg>

      ${renderSvgIcon(item.iconType)}

      <div class="title-prefix">${item.titlePrefix}</div>
      <div class="title-main">${item.titleMain}</div>
      <div class="title-sub">${item.titleSub}</div>

      <div class="chapter-box">
        <div class="chapter-highlight">${item.highlight}</div>
        <div class="chapter-subtext">${item.subtext}</div>
      </div>
    </div>

    <div class="footer">
      <div class="author-intro">${item.authorRole}</div>
      <div class="author-name">${item.authorName}</div>
      <div class="library-mark">Tu Tâm Phật Học Thư Viện</div>
    </div>
  </div>
</body>
</html>`;
}

async function run() {
  const outDir = path.resolve('scratch/covers');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Launching browser to render sutra covers...');
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 800, height: 1200 },
    deviceScaleFactor: 1
  });

  for (const item of sutraCovers) {
    const html = generateHtml(item);
    await page.setContent(html, { waitUntil: 'networkidle' });
    const outPath = path.join(outDir, `${item.key}.webp`);
    await page.screenshot({ path: outPath, type: 'webp', quality: 90 });
    const stats = fs.statSync(outPath);
    console.log(`✓ Generated cover: ${item.key}.webp (${(stats.size / 1024).toFixed(1)} KB)`);
  }

  await browser.close();
  console.log('\nAll 7 sutra covers generated successfully in scratch/covers/');
}

run().catch(console.error);
