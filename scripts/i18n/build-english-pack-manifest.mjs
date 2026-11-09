import fs from 'node:fs';
import { createHash } from 'node:crypto';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entries = fs.readdirSync('static/offline-data/chapters-en').filter(file => file.endsWith('.json')).sort().map(file => {
  const bytes = fs.readFileSync(`static/offline-data/chapters-en/${file}`);
  const rows = JSON.parse(bytes);
  if (!Array.isArray(rows) || !rows.length || !rows.every(row => typeof row?.noi_dung === 'string')) throw new Error(`Invalid English book: ${file}`);
  return { file, bytes: bytes.length, sha256: hash(bytes) };
});
const manifest = JSON.stringify({ version: hash(JSON.stringify(entries)), entries });
fs.writeFileSync('src/lib/data/english-pack-manifest.json', manifest);
fs.writeFileSync('static/offline-data/english-pack-manifest.json', manifest);
console.log(`English manifest: ${entries.length} books`);
