import fs from 'fs';
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json','utf8');
const en = JSON.parse(raw);
const rx = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;
const mantraOK = /Nam Mô|A Di Đà|Ứng Cúng|Chánh Biến Tri|Ma Ha|Tát Đỏa|Án |Om |A Di Da Phat/i;
[41,42,45,50].forEach(i=>{
  const blob = en[i].tieu_de+'\n'+en[i].tom_tat+'\n'+en[i].noi_dung;
  blob.split('\n').forEach(l=>{
    if (rx.test(l) && !mantraOK.test(l)) console.log(`idx${i}: ${l.slice(0,220)}`);
  });
});
console.log('done');
