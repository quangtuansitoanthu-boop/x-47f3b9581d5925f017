import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ICON_SRC = 'C:/Users/Admin/.gemini/antigravity/brain/72ec4594-54fe-4848-bbe5-e961b33f52e3/tu_tap_app_icon_1792371784194.jpg';
const BANNER_SRC = 'C:/Users/Admin/.gemini/antigravity/brain/72ec4594-54fe-4848-bbe5-e961b33f52e3/tu_tap_feature_graphic_1792371804118.jpg';

const OUT_DIR = path.resolve('store-assets/google-play');
const ARTIFACT_DIR = 'C:/Users/Admin/.gemini/antigravity/brain/72ec4594-54fe-4848-bbe5-e961b33f52e3';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function processIcon() {
  console.log('--- Processing 512x512 App Icon ---');

  // Background gradient matching warm ivory/amber
  const bgSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stop-color="#FFFDF8" />
          <stop offset="55%" stop-color="#FAF1E3" />
          <stop offset="100%" stop-color="#EFE0CB" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#grad)" />
    </svg>
  `);

  // Mask that smoothly fades out between r=415 and r=450 around center (512, 520)
  const maskSvg = Buffer.from(`
    <svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="feather" cx="50%" cy="50.8%" r="44%">
          <stop offset="88%" stop-color="#ffffff" stop-opacity="1" />
          <stop offset="97%" stop-color="#ffffff" stop-opacity="0.5" />
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1024" height="1024" fill="url(#feather)" />
    </svg>
  `);

  const maskedIcon = await sharp(ICON_SRC)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const final1024 = await sharp(bgSvg)
    .composite([{ input: maskedIcon, blend: 'over' }])
    .png()
    .toBuffer();

  const icon512Buffer = await sharp(final1024)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3 })
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.5 })
    .png()
    .toBuffer();

  const outPath1 = path.join(OUT_DIR, 'app-icon-512x512.png');
  const outPathArtifact = path.join(ARTIFACT_DIR, 'app-icon-512x512.png');
  fs.writeFileSync(outPath1, icon512Buffer);
  fs.writeFileSync(outPathArtifact, icon512Buffer);
  console.log('✓ Created:', outPath1);
}

async function processBanner() {
  console.log('--- Processing 1024x500 Feature Graphic Banner ---');

  // Banner src is 1376 x 768. Target is 1024 x 500 (ratio 2.048 vs 1.791)
  // We crop with center/attention or slight top bias so the Buddha and mountains look majestic
  const banner1024x500 = await sharp(BANNER_SRC)
    .resize(1024, 500, {
      fit: 'cover',
      position: sharp.position.center,
      kernel: sharp.kernel.lanczos3
    })
    .sharpen({ sigma: 0.8, m1: 0.5, m2: 1.5 })
    .png()
    .toBuffer();

  const outBannerClean = path.join(OUT_DIR, 'feature-graphic-1024x500.png');
  const outBannerCleanArtifact = path.join(ARTIFACT_DIR, 'feature-graphic-1024x500.png');
  fs.writeFileSync(outBannerClean, banner1024x500);
  fs.writeFileSync(outBannerCleanArtifact, banner1024x500);
  console.log('✓ Created clean banner:', outBannerClean);

  // Version with elegant typography
  const textSvg = Buffer.from(`
    <svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="#3A2814" flood-opacity="0.45"/>
        </filter>
        <filter id="subshadow" x="-20%" y="-20%" width="150%" height="150%">
          <feDropShadow dx="1" dy="2" stdDeviation="3" flood-color="#3A2814" flood-opacity="0.4"/>
        </filter>
        <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFFDF7" />
          <stop offset="40%" stop-color="#FFECC7" />
          <stop offset="100%" stop-color="#D9A85B" />
        </linearGradient>
      </defs>

      <!-- Decorative subtle line -->
      <line x1="70" y1="165" x2="380" y2="165" stroke="#FFECC7" stroke-width="2" stroke-opacity="0.6" />

      <!-- Main Title -->
      <text x="70" y="240" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="68" font-weight="800" fill="url(#goldText)" filter="url(#shadow)" letter-spacing="3">TU TẬP</text>

      <!-- Subtitle -->
      <text x="72" y="295" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#FFFDF8" filter="url(#subshadow)" letter-spacing="1.5">Ứng Dụng Học Phật &amp; Thiền Định</text>

      <!-- Feature Badges -->
      <text x="72" y="340" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="500" fill="#FCE8C8" filter="url(#subshadow)" letter-spacing="1">ĐỌC KINH  •  NGHE PHÁP  •  SỔ TAY TU TẬP</text>
    </svg>
  `);

  const bannerWithText = await sharp(banner1024x500)
    .composite([{ input: textSvg, blend: 'over' }])
    .png()
    .toBuffer();

  const outBannerText = path.join(OUT_DIR, 'feature-graphic-1024x500-with-title.png');
  const outBannerTextArtifact = path.join(ARTIFACT_DIR, 'feature-graphic-1024x500-with-title.png');
  fs.writeFileSync(outBannerText, bannerWithText);
  fs.writeFileSync(outBannerTextArtifact, bannerWithText);
  console.log('✓ Created banner with typography:', outBannerText);
}

async function processAndroidMipmaps() {
  console.log('--- Generating Android Launcher Icons (mipmap) ---');
  const RES_DIR = path.resolve('android/app/src/main/res');
  const SIZES = {
    'mipmap-mdpi': { icon: 48, foreground: 108 },
    'mipmap-hdpi': { icon: 72, foreground: 162 },
    'mipmap-xhdpi': { icon: 96, foreground: 216 },
    'mipmap-xxhdpi': { icon: 144, foreground: 324 },
    'mipmap-xxxhdpi': { icon: 192, foreground: 432 },
  };

  const masterPath = path.join(OUT_DIR, 'app-icon-512x512.png');
  const masterBuffer = fs.readFileSync(masterPath);

  function createCircleMask(size) {
    const r = size / 2;
    return Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff" /></svg>`);
  }

  for (const [folder, dims] of Object.entries(SIZES)) {
    const targetDir = path.join(RES_DIR, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Standard icon (ic_launcher.png)
    const stdIcon = await sharp(masterBuffer)
      .resize(dims.icon, dims.icon, { kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), stdIcon);

    // 2. Round icon (ic_launcher_round.png)
    const circleMask = createCircleMask(dims.icon);
    const roundIcon = await sharp(stdIcon)
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundIcon);

    // 3. Adaptive Foreground (ic_launcher_foreground.png)
    // In Android adaptive icon: standard foreground is 108dp, inner graphic centered at ~72% size
    const innerSize = Math.round(dims.foreground * 0.72);
    const padding = Math.round((dims.foreground - innerSize) / 2);
    const scaledInner = await sharp(masterBuffer)
      .resize(innerSize, innerSize, { kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    const fgIcon = await sharp({
      create: {
        width: dims.foreground,
        height: dims.foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{ input: scaledInner, left: padding, top: padding }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), fgIcon);
  }

  console.log('✓ Updated all Android mipmap launcher icons!');
}

async function main() {
  await processIcon();
  await processBanner();
  await processAndroidMipmaps();
  console.log('\n🎉 ALL STORE ASSETS GENERATED & SYNCHRONIZED SUCCESSFULLY!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

