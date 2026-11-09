import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const res = path.join(root, 'android/app/src/main/res');
const mark = path.join(root, 'assets/branding/lotus-mark.png');
const scenery = path.join(root, 'assets/branding/startup-sanctuary.webp');
// Gold lotus with a small Dharma wheel on a soft champagne ground.
const backup = path.join(root, 'output/branding-lotus/before');
async function write(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const old = path.join(backup, path.relative(root, file));
  try { await fs.access(old); } catch {
    try { await fs.mkdir(path.dirname(old), { recursive: true }); await fs.copyFile(file, old); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const temporary = `${file}.branding-tmp`;
  await fs.writeFile(temporary, data);
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(temporary, file); break; }
    catch (error) {
      if (attempt >= 5 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}
export async function emblem(size, fraction = .76, transparent = false) {
  const logoSize = Math.round(size * fraction);
  const logo = await sharp(mark).resize(logoSize, logoSize).toBuffer();
  const canvas = transparent
    ? sharp({ create: { width: size, height: size, channels: 4, background: '#00000000' } })
    : sharp(Buffer.from(`<svg width="${size}" height="${size}"><defs><linearGradient id="champagne" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff9ed"/><stop offset="1" stop-color="#ecd8ad"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#champagne)"/></svg>`));
  return canvas
    .composite([{ input: logo, left: Math.round((size - logoSize) / 2), top: Math.round((size - logoSize) / 2) }])
    .png({ palette: true, colours: 256, effort: 10 }).toBuffer();
}

export async function generateBranding() {
  const master = await emblem(1024);
  await write(path.join(root, 'output/branding-lotus/tu-tap-icon-1024.png'), master);
  await write(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'), master);
  const icon = await emblem(512);
  await write(path.join(root, 'assets/branding/tu-tap-logo.png'), icon);
  await write(path.join(root, 'store-assets/google-play/app-icon-512x512.png'), icon);
  for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const dir = path.join(res, `mipmap-${density}`);
    const size = Math.round(48 * scale);
    const flat = await emblem(size);
    await write(path.join(dir, 'ic_launcher.png'), flat);
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
    await write(path.join(dir, 'ic_launcher_round.png'), await sharp(flat).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer());
    // Adaptive masks remove the outer third. Keep all lotus petals inside the safe circle.
    await write(path.join(dir, 'ic_launcher_foreground.png'), await emblem(Math.round(108 * scale), .56, true));
  }
  await write(path.join(res, 'drawable-nodpi/startup_mark.png'), await emblem(864, .60, true));
  await write(path.join(res, 'values/ic_launcher_background.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F3E6CA</color>
    <color name="splash_background">#FFFAF2</color>
</resources>
`));
  await write(path.join(res, 'drawable/ic_launcher_champagne.xml'), Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <gradient android:angle="270" android:startColor="#FFF9ED" android:endColor="#ECD8AD" />
</shape>
`));
  const targets = [
    ['drawable', 480, 320],
    ['drawable-port-mdpi', 320, 480], ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280], ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720], ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280],
  ];
  for (const [folder, width, height] of targets) {
    const min = Math.min(width, height);
    const size = Math.round(min * .34);
    const left = Math.round((width - size) / 2);
    const top = Math.round(height * .43 - size * .5);
    const titleSize = Math.round(min * .052);
    const subtitleSize = Math.round(min * .027);
    const titleY = top + size + titleSize * 1.3;
    const panelWidth = Math.min(width - 32, Math.round(min * .84));
    const panelTop = Math.round(top - min * .06);
    const panelHeight = Math.round(titleY + subtitleSize * 3 - panelTop);
    const panel = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="${(width - panelWidth) / 2}" y="${panelTop}" width="${panelWidth}" height="${panelHeight}" rx="${min * .055}" fill="#fffaf2" fill-opacity=".91" stroke="#ffffff" stroke-opacity=".7"/></svg>`);
    const text = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <text x="${width / 2}" y="${titleY}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${titleSize}" font-weight="700" fill="#28594f">Tu tập Phật pháp</text>
      <text x="${width / 2}" y="${titleY + subtitleSize * 2}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${subtitleSize}" fill="#6a7566">Học lời Phật dạy · Thực hành mỗi ngày</text>
    </svg>`);
    const image = await sharp(scenery).resize(width, height, { fit: 'cover', position: 'centre' })
      .composite([{ input: panel }, { input: await sharp(mark).resize(size, size).toBuffer(), left, top }, { input: text }])
      .webp({ quality: 78, effort: 6 }).toBuffer();
    await write(path.join(res, folder, 'splash.webp'), image);
    // The old PNG has the same Android resource name and must not ship alongside WebP.
    const oldPng = path.join(res, folder, 'splash.png');
    try { await fs.unlink(oldPng); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  console.log('Generated lotus branding, adaptive icons and 11 compressed startup screens.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generateBranding();
