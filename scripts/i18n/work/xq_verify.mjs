import fs from 'fs';
const ENP = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const VIP = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const en = JSON.parse(fs.readFileSync(ENP,'utf8'));
const vi = JSON.parse(fs.readFileSync(VIP,'utf8'));
console.log('EN count:', en.length, '| VI count:', vi.length);
let ok = true;
en.forEach((c,i)=>{
  if (c.id !== vi[i].id || c.bai_viet_id !== vi[i].bai_viet_id || c.so_thu_tu !== vi[i].so_thu_tu) { console.log('ID MISMATCH at', i); ok = false; }
  for (const k of ['tieu_de','tom_tat','noi_dung']) if (typeof c[k] !== 'string' || !c[k].length) { console.log('EMPTY', i, k); ok = false; }
});
console.log('ids/order/nonempty ok:', ok);
const raw = fs.readFileSync(ENP,'utf8');
const cjk = raw.match(/[̀-鿿぀-ヿ가-힯]/g);
console.log('CJK chars:', cjk ? cjk.length : 0, cjk ? [...new Set(cjk)].slice(0,20).join(' ') : '');
const tags = s => (s.match(/<\/?[a-zA-Z][^>]*>|!\[[^\]]*\]\(https:[^)]*\)/g)||[]).join('|');
vi.forEach((v,i)=>{ if (tags(v.noi_dung) !== tags(en[i].noi_dung)) console.log('TAG MISMATCH ch idx', i); });
console.log('tag check done');
console.log('--- SAMPLE 1 (ch41 Lan Yama court) ---');
const p41 = en[41].noi_dung.split('\n').filter(l=>l.trim().length);
console.log(p41.find(l=>l.includes("Yama's court")));
console.log(p41.find(l=>l.includes('13 pieces')));
console.log('--- SAMPLE 2 (ch50 appendix opening) ---');
const p50 = en[50].noi_dung.split('\n').filter(l=>l.trim().length);
const h = p50.findIndex(l=>l.includes('SOME REFLECTIONS'));
console.log(p50.slice(h, h+3).join('\n').slice(0,600));
