import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const directory = process.argv[2] || 'output/branding-lotus';
const icon = await sharp(path.join(directory, 'tu-tap-icon-1024.png')).resize(260, 260).toBuffer();
const masks = [
  '<rect width="260" height="260" rx="58" fill="white"/>',
  '<circle cx="130" cy="130" r="130" fill="white"/>',
];
const shapes = await Promise.all(masks.map(shape => sharp(icon).composite([{
  input: Buffer.from(`<svg width="260" height="260">${shape}</svg>`), blend: 'dest-in',
}]).png().toBuffer()));
await fs.mkdir(directory, { recursive: true });
await sharp({ create: { width: 640, height: 340, channels: 3, background: '#f5f2eb' } })
  .composite(shapes.map((input, index) => ({ input, left: 40 + index * 300, top: 40 })))
  .png().toFile(path.join(directory, 'icon-preview.png'));
console.log(`Icon preview: ${directory}/icon-preview.png`);
