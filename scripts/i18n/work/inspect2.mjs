import fs from 'fs';
const f='static/offline-data/chapters/tt_1781224598651_2_i3l0j.json';
const vi=JSON.parse(fs.readFileSync(f,'utf8'));
console.log('VI count:',vi.length);
vi.forEach((c,i)=>console.log(i,'id='+c.id,'stt='+c.so_thu_tu,'title='+JSON.stringify((c.tieu_de||'').slice(0,80)),'tt_len='+(c.tom_tat||'').length,'nd_len='+(c.noi_dung||'').length));
const raw=fs.readFileSync(f,'utf8');
console.log('starts:',JSON.stringify(raw.slice(0,120)));
const fen='static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json';
try{
 const raw2=fs.readFileSync(fen,'utf8');
 console.log('EN starts:',JSON.stringify(raw2.slice(0,120)));
 const en=JSON.parse(raw2);
 console.log('EN count:',en.length);
 en.forEach((c,i)=>console.log(i,'id='+c.id,'stt='+c.so_thu_tu,'title='+JSON.stringify((c.tieu_de||'').slice(0,80)),'tt_len='+(c.tom_tat||'').length,'nd_len='+(c.noi_dung||'').length));
}catch(e){console.log('EN err',e.message);}
