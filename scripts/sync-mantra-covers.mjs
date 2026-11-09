import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const output = 'output/mantra-covers';
const jobs = JSON.parse(fs.readFileSync(path.join(output, 'sources.json'), 'utf8'));
const catalogFiles = ['static/offline-bundled-articles.json', 'src/lib/data/offline-bundled-articles.json'];
const catalogs = catalogFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const overridesFile = 'src/lib/data/book-cover-overrides.json';
const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
for (const job of jobs) {
  if (!fs.existsSync(job.source)) throw new Error(`Missing source: ${job.key}`);
  if (!catalogs[0].some((book) => book.id === job.id)) throw new Error(`Missing book: ${job.id}`);
}
const manifest = [];
for (const job of jobs) {
  const filename = `${job.key}-20261022-v2.webp`;
  const cover = `/covers/${filename}`;
  fs.copyFileSync(job.source, path.join(output, `${job.key}.png`));
  const bytes = await sharp(job.source).resize(600, 900, { fit: 'contain', background: '#07172a' }).webp({ quality: 85, effort: 5 }).toBuffer();
  fs.writeFileSync(path.join('static/covers', filename), bytes);
  overrides[job.old] = cover;
  overrides[filename] = cover;
  for (const catalog of catalogs) {
    for (const book of catalog.filter((book) => book.id === job.id || book.id === `book_${job.id}`)) {
      const old = book.anh_url.split('#')[0].split('?')[0].split('/').pop();
      overrides[old] = cover;
      book.anh_url = cover;
    }
  }
  manifest.push({ key: job.key, id: job.id, cover, bytes: bytes.length });
}
catalogFiles.forEach((file, index) => fs.writeFileSync(file, JSON.stringify(catalogs[index])));
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const tiles = await Promise.all(manifest.map(async (job, index) => ({
  input: await sharp(`static${job.cover}`).resize(240, 360).png().toBuffer(),
  left: index * 252 + 6,
  top: 6,
})));
await sharp({ create: { width: manifest.length * 252, height: 372, channels: 3, background: '#f4eee4' } }).composite(tiles).jpeg({ quality: 92 }).toFile(path.join(output, 'preview.jpg'));
console.log(JSON.stringify(manifest, null, 2));
