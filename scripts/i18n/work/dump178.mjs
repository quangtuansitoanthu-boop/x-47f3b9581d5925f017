import fs from 'fs';
const vi=JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224598651_2_i3l0j.json','utf8'));
const en=JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json','utf8'));
for(const i of [0,1,2,11,17,19]){
 console.log('===== VI ['+i+'] '+vi[i].tieu_de+' =====');
 console.log((vi[i].noi_dung||'').slice(0,1500));
 console.log('\n----- EN ['+i+'] '+en[i].tieu_de+' -----');
 console.log((en[i].noi_dung||'').slice(0,1500));
 console.log('\n\n');
}
