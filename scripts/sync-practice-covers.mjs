import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createAssetManifest, verifyAssetManifest } from './lib/mobile-assets.mjs';

const jobs = JSON.parse(fs.readFileSync('output/book-covers/practice-jobs.json', 'utf8'));
const sources = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const overridesFile = 'src/lib/data/book-cover-overrides.json';
const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
const destinations = ['static', 'build', 'android/app/src/main/assets/public', 'ios/App/App/public'].filter(fs.existsSync);
const manifest = [];
for (const job of jobs) {
  const source = sources[job.key];
  if (!source || !fs.existsSync(source)) throw new Error(`Missing generated image: ${job.key}`);
  const filename = `${job.key}-20261022.webp`;
  const cover = `/covers/${filename}`;
  const bytes = await sharp(source).resize(480, 720, { fit: 'fill' }).webp({ quality: 72, effort: 5 }).toBuffer();
  for (const dir of destinations) {
    fs.mkdirSync(path.join(dir, 'covers'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'covers', filename), bytes);
  }
  overrides[job.cover.split('#')[0].split('/').pop()] = cover;
  manifest.push({ id: job.id, title: job.title, cover, bytes: bytes.length });
}
for (const target of [...destinations.map((dir) => path.join(dir, 'offline-bundled-articles.json')), 'src/lib/data/offline-bundled-articles.json']) {
  if (!fs.existsSync(target)) continue;
  const data = JSON.parse(fs.readFileSync(target, 'utf8'));
  for (const article of data) {
    const match = manifest.find((entry) => entry.id === article.id);
    if (match) article.anh_url = match.cover;
  }
  fs.writeFileSync(target, JSON.stringify(data));
}
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2) + '\n');
fs.writeFileSync('output/book-covers/practice-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const tiles = await Promise.all(manifest.map(async (entry, index) => ({
  input: await sharp(`static${entry.cover}`).resize(160, 240).toBuffer(),
  left: (index % 5) * 172 + 6,
  top: Math.floor(index / 5) * 252 + 6,
})));
await sharp({ create: { width: 860, height: Math.ceil(manifest.length / 5) * 252, channels: 3, background: '#f3eee5' } }).composite(tiles).jpeg({ quality: 85 }).toFile('output/book-covers/practice-preview.jpg');
for (const dir of destinations.filter((entry) => entry !== 'static')) {
  const assets = createAssetManifest(dir);
  fs.writeFileSync(path.join(dir, 'mobile-assets-manifest.json'), JSON.stringify(assets));
  console.log(`Verified ${verifyAssetManifest(dir, assets)} assets: ${dir}`);
}
console.log(JSON.stringify({ covers: manifest.length, totalBytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0), destinations }, null, 2));
