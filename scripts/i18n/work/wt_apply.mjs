import fs from 'fs';
const ID = 'tt_1781081525279_1_t5eqk';
const ENP = `static/offline-data/chapters-en/${ID}.json`;
const VIP = `static/offline-data/chapters/${ID}.json`;
const idx = Number(process.argv[2]);
const raw = fs.readFileSync(`scripts/i18n/work/wt_${String(idx).padStart(2,'0')}_en.txt`, 'utf8');
const lines = raw.split('\n');
const title = lines[0].replace(/^TITLE: /, '').trim();
const tomtat = lines[1].replace(/^TOMTAT: /, '').trim();
if (lines[2].trim() !== '-----') { console.error('BAD SEP ch' + idx); process.exit(1); }
const body = lines.slice(3).join('\n').replace(/\n+$/, '');
const en = JSON.parse(fs.readFileSync(ENP, 'utf8'));
const vi = JSON.parse(fs.readFileSync(VIP, 'utf8'));
if (en.length !== vi.length) { console.error('LEN MISMATCH'); process.exit(1); }
if (en[idx].so_thu_tu !== idx || en[idx].id !== vi[idx].id) { console.error('INDEX/ID MISMATCH'); process.exit(1); }
// markup check: align tag counts must match VI
const cnt = (s) => (s.match(/\{align:/g) || []).length;
if (cnt(vi[idx].noi_dung) !== cnt(body)) { console.error(`ALIGN COUNT MISMATCH ch${idx} vi=${cnt(vi[idx].noi_dung)} en=${cnt(body)}`); process.exit(1); }
en[idx].tieu_de = title;
en[idx].tom_tat = tomtat;
en[idx].noi_dung = body;
fs.writeFileSync(ENP, JSON.stringify(en));
console.log(`applied ch${idx} id=${en[idx].id} align=${cnt(body)} title=${title.slice(0,50)}`);
