import fs from 'node:fs';
const VI = 'static/offline-data/chapters/tt_1783477721256.json';
const EN = 'static/offline-data/chapters-en/tt_1783477721256.json';
const idx = Number(process.argv[2]);
const raw = fs.readFileSync(`scripts/i18n/work/tt56_${idx}_en.txt`, 'utf8').replace(/^\uFEFF/, '');
const nl = raw.indexOf('\n');
if (nl < 0) { console.error('BAD TR FILE'); process.exit(1); }
const title = raw.slice(0, nl).trim();
const body = raw.slice(nl + 1).replace(/^\n+/, '').replace(/\s+$/, '');
const vi = JSON.parse(fs.readFileSync(VI, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN, 'utf8'));
if (vi.length !== en.length) { console.error('LENGTH MISMATCH'); process.exit(1); }
const v = vi[idx], e = en[idx];
if (e.id !== v.id || e.bai_viet_id !== v.bai_viet_id || e.so_thu_tu !== v.so_thu_tu) { console.error('ID MISMATCH'); process.exit(1); }
const countBlocks = (s) => (s.match(/\{align:/g) || []).length;
if (countBlocks(v.noi_dung) !== countBlocks(body)) {
  console.error(`BLOCK COUNT MISMATCH vi=${countBlocks(v.noi_dung)} en=${countBlocks(body)}`);
  process.exit(1);
}
e.tieu_de = title;
e.tom_tat = '';
e.noi_dung = body;
fs.writeFileSync(EN, JSON.stringify(en));
console.log(`applied ch${idx} id=${e.id} title=${title} blocks=${countBlocks(body)} chars=${body.length}`);
