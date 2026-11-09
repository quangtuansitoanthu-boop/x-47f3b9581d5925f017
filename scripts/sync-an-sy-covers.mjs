import fs from 'node:fs';
import sharp from 'sharp';

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const overridesFile = 'src/lib/data/book-cover-overrides.json';
const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
const roots = ['static', 'build', 'android/app/src/main/assets/public', 'ios/App/App/public'].filter(fs.existsSync);
const manifest = [];
for (const job of jobs) {
  const cover = `/covers/${job.key}-20261022.webp`;
  const image = await sharp(job.source).resize(480, 720).webp({ quality: 72, effort: 5 }).toBuffer();
  for (const root of roots) fs.writeFileSync(`${root}${cover}`, image);
  overrides[job.cover.split('#')[0].split('/').pop()] = cover;
  manifest.push({ id: job.id, title: job.title, cover, bytes: image.length });
}
for (const file of [...roots.map((root) => `${root}/offline-bundled-articles.json`), 'src/lib/data/offline-bundled-articles.json']) {
  const catalog = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const article of catalog) {
    const match = manifest.find((entry) => entry.id === article.id);
    if (match) article.anh_url = match.cover;
  }
  fs.writeFileSync(file, JSON.stringify(catalog));
}
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2) + '\n');
fs.writeFileSync('output/book-covers/an-sy-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const tiles = await Promise.all(manifest.map(async (entry, index) => ({ input: await sharp(`static${entry.cover}`).resize(240, 360).toBuffer(), left: index * 252 + 6, top: 6 })));
await sharp({ create: { width: 756, height: 372, channels: 3, background: '#f3eee5' } }).composite(tiles).jpeg({ quality: 85 }).toFile('output/book-covers/an-sy-preview.jpg');
console.log(JSON.stringify(manifest, null, 2));
