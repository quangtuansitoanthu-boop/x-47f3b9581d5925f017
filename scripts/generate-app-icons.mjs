import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_LOGO = 'd:/CA NHAN/A.WEB_HP/tutam-main/assets/branding/tu-tap-logo.png';
const RES_DIR = 'd:/CA NHAN/A.WEB_HP/tutam-mobile/android/app/src/main/res';

// Densities and sizes:
// Foreground is 108dp base (mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432)
// Launcher icon is 48dp base (mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192)
const SIZES = {
  'mipmap-mdpi': { icon: 48, foreground: 108 },
  'mipmap-hdpi': { icon: 72, foreground: 162 },
  'mipmap-xhdpi': { icon: 96, foreground: 216 },
  'mipmap-xxhdpi': { icon: 144, foreground: 324 },
  'mipmap-xxxhdpi': { icon: 192, foreground: 432 },
};

const BG_COLOR = { r: 255, g: 251, b: 246, alpha: 1 }; // #FFFBF6 - Warm zen ivory

async function generate() {
  console.log('Generating high-res crisp app icons from:', SOURCE_LOGO);

  // 1. Process master logo:
  // Apply subtle sharpness and contrast boost so fine details stay ultra crisp when scaled down
  const masterHighRes = await sharp(SOURCE_LOGO)
    .resize(1024, 1024, {
      fit: 'contain',
      background: BG_COLOR,
      kernel: sharp.kernel.lanczos3
    })
    .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
    .toBuffer();

  // Create Circular Mask for round launcher icon
  function createCircleMask(size) {
    const r = size / 2;
    const svg = `<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff" /></svg>`;
    return Buffer.from(svg);
  }

  for (const [folder, dims] of Object.entries(SIZES)) {
    const targetDir = path.join(RES_DIR, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // --- A. FOREGROUND (ic_launcher_foreground.png) ---
    // In Android Adaptive Icons:
    // Safe area is the center 66dp-72dp out of 108dp (67%-70%).
    // We scale the logo to ~72% and place on seamless BG_COLOR canvas.
    const fgSize = dims.foreground;
    const innerFgSize = Math.round(fgSize * 0.72);
    const innerFgPadding = Math.round((fgSize - innerFgSize) / 2);

    const scaledInnerFg = await sharp(masterHighRes)
      .resize(innerFgSize, innerFgSize, { fit: 'contain', background: BG_COLOR })
      .toBuffer();

    const foregroundBuffer = await sharp({
      create: {
        width: fgSize,
        height: fgSize,
        channels: 4,
        background: BG_COLOR
      }
    })
      .composite([{ input: scaledInnerFg, left: innerFgPadding, top: innerFgPadding }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetDir, 'ic_launcher_foreground.png'), foregroundBuffer);

    // --- B. STANDARD ICON (ic_launcher.png) ---
    // Full icon canvas with warm zen ivory background and full logo
    const iconSize = dims.icon;
    const innerIconSize = Math.round(iconSize * 0.92);
    const iconPadding = Math.round((iconSize - innerIconSize) / 2);

    const scaledIconLogo = await sharp(masterHighRes)
      .resize(innerIconSize, innerIconSize, { fit: 'contain', background: BG_COLOR })
      .toBuffer();

    const standardIconBuffer = await sharp({
      create: {
        width: iconSize,
        height: iconSize,
        channels: 4,
        background: BG_COLOR
      }
    })
      .composite([{ input: scaledIconLogo, left: iconPadding, top: iconPadding }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetDir, 'ic_launcher.png'), standardIconBuffer);

    // --- C. ROUND ICON (ic_launcher_round.png) ---
    // Scaled logo inside perfect circle
    const roundInnerSize = Math.round(iconSize * 0.92);
    const roundPadding = Math.round((iconSize - roundInnerSize) / 2);
    const roundBase = await sharp({
      create: {
        width: iconSize,
        height: iconSize,
        channels: 4,
        background: BG_COLOR
      }
    })
      .composite([{
        input: await sharp(masterHighRes).resize(roundInnerSize, roundInnerSize, { fit: 'contain', background: BG_COLOR }).toBuffer(),
        left: roundPadding,
        top: roundPadding
      }])
      .png()
      .toBuffer();

    const circleMask = createCircleMask(iconSize);
    const roundIconBuffer = await sharp(roundBase)
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(targetDir, 'ic_launcher_round.png'), roundIconBuffer);

    console.log(`Generated icons for ${folder}: fg=${fgSize}px, icon=${iconSize}px`);
  }

  // Update background color in values/ic_launcher_background.xml to match #FFFBF6
  const colorXmlPath = path.join(RES_DIR, 'values', 'ic_launcher_background.xml');
  const colorXmlContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFBF6</color>
</resources>
`;
  fs.writeFileSync(colorXmlPath, colorXmlContent, 'utf-8');
  console.log('Updated ic_launcher_background.xml with #FFFBF6');

  // Also create a sample preview for verification
  const previewPath = 'C:/Users/Admin/.gemini/antigravity-ide/brain/fc45e6f8-012c-4445-94f9-11841444c335/new_app_icon_preview.png';
  fs.copyFileSync(path.join(RES_DIR, 'mipmap-xxxhdpi', 'ic_launcher_round.png'), previewPath);
  console.log('Copied preview to:', previewPath);

  console.log('All icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
