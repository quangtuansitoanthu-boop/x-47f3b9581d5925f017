// Regenerate src/lib/data/chapters-en-availability.json from static/offline-data/chapters-en.
// Human-translated books: listed in HUMAN_IDS below (reviewed).
// Machine-translated drafts: every other file in chapters-en/ -> mtIds.
// Run: node scripts/i18n/sync-english-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dir = path.join(root, 'static', 'offline-data', 'chapters-en');
const out = path.join(root, 'src', 'lib', 'data', 'chapters-en-availability.json');

// Files reviewed by a human (full quality). Everything else in chapters-en/ is a machine draft.
const HUMAN_IDS = new Set([
  'tt_1781081372340_1_xqcxo',
  'tuyen-tap-phap-facebook-quang-tu',
]);

const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
const ids = files.map((f) => f.replace(/\.json$/, '')).sort();
const human = ids.filter((id) => HUMAN_IDS.has(id));
const mt = ids.filter((id) => !HUMAN_IDS.has(id));
const manifest = { generatedAt: new Date().toISOString(), count: ids.length, ids: human, mtIds: mt };
fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`chapters-en availability: ${human.length} human + ${mt.length} machine-draft (${ids.length}) -> ${out}`);
