import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const jobs = JSON.parse(fs.readFileSync(new URL('./book-cover-refresh-jobs.json', import.meta.url)));
const sources = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const catalogFile = 'static/offline-bundled-articles.json';
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const overrides = JSON.parse(fs.readFileSync('src/lib/data/book-cover-overrides.json', 'utf8'));
const manifest = [];
const plain = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const destinations = ['static', 'build', 'android/app/src/main/assets/public', 'ios/App/App/public'].filter(fs.existsSync);

for (const job of jobs) {
  const source = sources[job.key];
  if (!source || !fs.existsSync(source)) throw new Error(`Missing generated image: ${job.key}`);
  const filename = `${job.key}-20261022.webp`;
  const cover = `/covers/${filename}`;
  const title = plain(job.title);
  const volume = plain(job.volume);
  const matches = catalog.filter((article) => {
    const text = plain(article.tieu_de);
    const titleMatch = title === 'kinh dia tang' ? text.includes('truyen tranh kinh dia tang') : text.includes(title);
    return titleMatch && (!volume || text.includes(volume));
  });
  if (!matches.length) throw new Error(`Missing book: ${job.key}`);
  const bytes = await sharp(source).resize(480, 720, { fit: 'fill' }).webp({ quality: 72, effort: 5 }).toBuffer();
  for (const dir of destinations) {
    fs.mkdirSync(path.join(dir, 'covers'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'covers', filename), bytes);
  }
  for (const article of matches) {
    const oldFile = article.anh_url.split('#')[0].split('/').pop();
    // The imported duplicate of volume 5 incorrectly shares volume 1's old cover.
    if (article.id !== 'book_a47c6c21f218958e353d9bbb7f8fc74e') overrides[oldFile] = cover;
    article.anh_url = cover;
  }
  manifest.push({ key: job.key, cover, ids: matches.map((book) => book.id), bytes: bytes.length });
}

for (const target of [...destinations.map((dir) => path.join(dir, 'offline-bundled-articles.json')), 'src/lib/data/offline-bundled-articles.json']) {
  if (fs.existsSync(target)) {
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    for (const article of data) {
      const match = manifest.find((entry) => entry.ids.includes(article.id));
      if (match) article.anh_url = match.cover;
    }
    fs.writeFileSync(target, JSON.stringify(data));
  }
}
fs.writeFileSync('src/lib/data/book-cover-overrides.json', JSON.stringify(overrides, null, 2) + '\n');
fs.mkdirSync('output/book-covers', { recursive: true });
fs.writeFileSync('output/book-covers/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
const tiles = await Promise.all(manifest.map(async (entry, index) => ({
  input: await sharp(`static${entry.cover}`).resize(192, 288).toBuffer(),
  left: (index % 4) * 204 + 6,
  top: Math.floor(index / 4) * 300 + 6,
})));
await sharp({ create: { width: 816, height: 1200, channels: 3, background: '#f3eee5' } }).composite(tiles).jpeg({ quality: 85 }).toFile('output/book-covers/preview.jpg');
console.log(JSON.stringify({ covers: manifest.length, books: manifest.reduce((sum, entry) => sum + entry.ids.length, 0), totalBytes: manifest.reduce((sum, entry) => sum + entry.bytes, 0), destinations }, null, 2));
