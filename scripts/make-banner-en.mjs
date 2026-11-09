import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const baseBanner = 'store-assets/google-play/feature-graphic-1024x500.png';
const outEn = 'store-assets/google-play/feature-graphic-1024x500-en.png';
const artifactDir = 'C:/Users/Admin/.gemini/antigravity/brain/c0f0f4d5-6910-470a-8350-09ea0425a824';

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

    <!-- Decorative line -->
    <line x1="70" y1="165" x2="440" y2="165" stroke="#FFECC7" stroke-width="2" stroke-opacity="0.6" />

    <!-- Main Title -->
    <text x="70" y="240" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="64" font-weight="800" fill="url(#goldText)" filter="url(#shadow)" letter-spacing="2.5">TU TAP</text>

    <!-- Subtitle -->
    <text x="72" y="295" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="#FFFDF8" filter="url(#subshadow)" letter-spacing="1.5">Buddhist Practice &amp; Mindfulness</text>

    <!-- Feature Badges -->
    <text x="72" y="340" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="500" fill="#FCE8C8" filter="url(#subshadow)" letter-spacing="1">SACRED SUTRAS  •  CHANTING  •  DHARMA TALKS</text>
  </svg>
`);

async function run() {
  const banner = await sharp(baseBanner)
    .composite([{ input: textSvg, blend: 'over' }])
    .png()
    .toBuffer();

  fs.writeFileSync(outEn, banner);
  fs.writeFileSync(path.join(artifactDir, 'feature-graphic-1024x500-en.png'), banner);
  fs.copyFileSync('store-assets/google-play/feature-graphic-1024x500-with-title.png', path.join(artifactDir, 'feature-graphic-1024x500-vi.png'));
  fs.copyFileSync('store-assets/google-play/feature-graphic-1024x500.png', path.join(artifactDir, 'feature-graphic-1024x500-clean.png'));
  fs.copyFileSync('store-assets/google-play/app-icon-512x512.png', path.join(artifactDir, 'app-icon-512x512.png'));

  console.log('✓ Successfully created and copied banners to artifact directory');
}

run().catch(console.error);
