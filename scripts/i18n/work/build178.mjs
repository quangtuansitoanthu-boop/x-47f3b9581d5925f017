import fs from 'fs';
const W='scripts/i18n/work/';
function parseFull(f){
  const t=fs.readFileSync(W+f,'utf8');
  const lines=t.split('\n');
  const title=lines[0].replace(/^TITLE: /,'');
  const tomtat=lines[1].replace(/^TOMTAT: /,'');
  const idx=lines.indexOf('-----');
  const body=lines.slice(idx+1).join('\n');
  return {title,tomtat,body};
}
function parseHeader(f){
  const t=fs.readFileSync(W+f,'utf8');
  const lines=t.split('\n');
  return {title:lines[0].replace(/^TITLE: /,''), tomtat:lines[1].replace(/^TOMTAT: /,'')};
}
const parts={
 0:['ch178_00_header.txt',['ch178_00_en_p01.txt','ch178_00_en_p02.txt','ch178_00_en_p03.txt','ch178_00_en_p04.txt','ch178_00_en_p05.txt','ch178_00_en_p06.txt','ch178_00_en_p07.txt','ch178_00_en_p08.txt','ch178_00_en_p09.txt','ch178_00_en_p10.txt']],
 11:['ch178_11_header.txt',['ch178_11_en_p1.txt','ch178_11_en_p2.txt','ch178_11_en_p3.txt','ch178_11_en_p4.txt']],
 16:['ch178_16_header.txt',['ch178_16_en_p1.txt','ch178_16_en_p2.txt','ch178_16_en_p3.txt']],
 17:['ch178_17_header.txt',['ch178_17_en_p1.txt','ch178_17_en_p2.txt','ch178_17_en_p3.txt','ch178_17_en_p4.txt']],
};
const vi=JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224598651_2_i3l0j.json','utf8'));
const out=[];
for(let i=0;i<vi.length;i++){
  const pad=String(i).padStart(2,'0');
  let title,tomtat,body;
  if(parts[i]){
    const h=parseHeader(parts[i][0]);
    title=h.title; tomtat=h.tomtat;
    body=parts[i][1].map(f=>fs.readFileSync(W+f,'utf8').trim()).join('\n');
  }else{
    const r=parseFull(`ch178_${pad}_en.txt`);
    title=r.title; tomtat=r.tomtat; body=r.body.trim();
  }
  out.push({id:vi[i].id, bai_viet_id:vi[i].bai_viet_id, so_thu_tu:vi[i].so_thu_tu, tieu_de:title, tom_tat:tomtat, noi_dung:body});
}
// sanity: paragraph counts vs VI
let ok=true;
for(let i=0;i<vi.length;i++){
  const vp=(vi[i].noi_dung||'').split('\n').length;
  const ep=(out[i].noi_dung||'').split('\n').length;
  const flag=Math.abs(vp-ep)>2?'  <== MISMATCH':'';
  if(flag) ok=false;
  console.log(i, 'VI paras='+vp, 'EN paras='+ep, flag);
}
if(!ok){ console.log('PARA MISMATCH - not writing'); process.exit(1); }
fs.writeFileSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json', JSON.stringify(out,null,2), 'utf8');
console.log('written OK, bytes='+fs.statSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json').size);
