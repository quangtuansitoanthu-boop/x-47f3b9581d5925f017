import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sources = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const output = 'output/lang-nghiem-covers';
fs.mkdirSync(output, { recursive: true });
const overridesFile = 'src/lib/data/book-cover-overrides.json';
const overrides = JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
const catalogFiles = ['static/offline-bundled-articles.json', 'src/lib/data/offline-bundled-articles.json'];
const catalogs = catalogFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const jobs = Array.from({ length: 10 }, (_, index) => {
  const volume = String(index + 1).padStart(2, '0');
  return { key: `kinh-lang-nghiem-q${volume}`, ids: [`tt_klngl_q${volume}`, `book_tt_klngl_q${volume}`] };
});
jobs.push(
  { key: 'chu-lang-nghiem', ids: ['book_5a8fc5fa07f9f2bc5f6d274442c787a1', '5a8fc5fa07f9f2bc5f6d274442c787a1'] },
  { key: 'tuyen-tap-bai-phap-quang-tu', ids: ['tuyen-tap-phap-facebook-quang-tu', 'book_tuyen-tap-phap-facebook-quang-tu'] },
);
for (const job of jobs) {
  if (!sources[job.key] || !fs.existsSync(sources[job.key])) throw new Error(`Missing source: ${job.key}`);
  if (!catalogs[0].some((book) => job.ids.includes(book.id))) throw new Error(`Missing book: ${job.key}`);
}
const manifest = [];
for (const job of jobs) {
  const version = job.key === 'tuyen-tap-bai-phap-quang-tu' ? 'v3' : 'v2';
  const filename = `${job.key}-20261022-${version}.webp`;
  const cover = `/covers/${filename}`;
  fs.copyFileSync(sources[job.key], path.join(output, `${job.key}.png`));
  const bytes = await sharp(sources[job.key]).resize(600, 900, { fit: 'contain', background: '#07172a' }).webp({ quality: 85, effort: 5 }).toBuffer();
  fs.writeFileSync(path.join('static/covers', filename), bytes);
  for (const catalog of catalogs) {
    for (const book of catalog.filter((book) => job.ids.includes(book.id))) {
      const oldFile = book.anh_url.split('#')[0].split('?')[0].split('/').pop();
      overrides[oldFile] = cover;
      book.anh_url = cover;
    }
  }
  for (const [legacy, target] of Object.entries(overrides)) {
    if (target.startsWith(`/covers/${job.key}-20261022-`)) overrides[legacy] = cover;
  }
  overrides[filename] = cover;
  manifest.push({ ...job, cover, bytes: bytes.length });
}
catalogFiles.forEach((file, index) => fs.writeFileSync(file, JSON.stringify(catalogs[index])));
fs.writeFileSync(overridesFile, JSON.stringify(overrides, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const tiles = await Promise.all(manifest.map(async (job, index) => ({
  input: await sharp(`static${job.cover}`).resize(180, 270).png().toBuffer(),
  left: index % 4 * 192 + 6,
  top: Math.floor(index / 4) * 282 + 6,
})));
await sharp({ create: { width: 768, height: 846, channels: 3, background: '#f4eee4' } }).composite(tiles).jpeg({ quality: 90 }).toFile(path.join(output, 'preview.jpg'));
console.log(JSON.stringify(manifest.map(({ key, bytes }) => ({ key, bytes })), null, 2));
