import sharp from 'sharp';
import fs from 'fs';

async function run() {
  const fig = await sharp('static/covers/1781604170713_8erjg.webp')
    .extract({ left: 80, top: 110, width: 440, height: 440 })
    .resize(280, 280)
    .toBuffer();

  const svgText = Buffer.from(`
    <svg width="280" height="280">
      <defs>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff5cc"/>
          <stop offset="50%" stop-color="#ffd54f"/>
          <stop offset="100%" stop-color="#d4af37"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.9"/>
        </filter>
      </defs>
      <rect x="0" y="210" width="280" height="70" fill="rgba(8, 14, 28, 0.75)"/>
      <text x="140" y="254" font-family="'Times New Roman', serif, sans-serif" font-size="21" font-weight="bold" fill="url(#goldGrad)" text-anchor="middle" letter-spacing="1" filter="url(#shadow)">ÂM LUẬT VÔ TÌNH</text>
    </svg>
  `);

  await sharp(fig)
    .composite([{ input: svgText, top: 0, left: 0 }])
    .webp({ quality: 90 })
    .toFile('static/covers/talk_am_luat_vo_tinh.webp');

  fs.copyFileSync(
    'static/covers/talk_am_luat_vo_tinh.webp',
    'C:/Users/Admin/.gemini/antigravity/brain/c7e71501-39ed-4964-9cdd-a44049b52749/composite_am_luat.webp'
  );

  console.log('Done talk_am_luat_vo_tinh.webp');
}

run();
