import fs from 'fs';
const vi=JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224598651_2_i3l0j.json','utf8'));
const raw=fs.readFileSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json','utf8');
const en=JSON.parse(raw);
console.log('EN count:', en.length, '| VI count:', vi.length);
let bad=0;
for(let i=0;i<vi.length;i++){
  const e=en[i];
  if(e.id!==vi[i].id||e.bai_viet_id!==vi[i].bai_viet_id||e.so_thu_tu!==vi[i].so_thu_tu){ console.log('ID MISMATCH at',i); bad++; }
  // markup check: align wrappers count
  const va=(vi[i].noi_dung.match(/\{align:/g)||[]).length;
  const ea=(e.noi_dung.match(/\{align:/g)||[]).length;
  if(va!==ea){ console.log('MARKUP MISMATCH at',i,va,ea); bad++; }
  // closing braces balance
  const open=(e.noi_dung.match(/\{align:/g)||[]).length;
  const close=(e.noi_dung.match(/\}/g)||[]).length;
  if(open!==close){ console.log('BRACE IMBALANCE at',i); bad++; }
}
console.log(bad===0?'IDS+MARKUP OK':'PROBLEMS:'+bad);
// leftover Vietnamese diacritics check (allow mantras/names)
const mantraLines=['Nam mô A Di Đà Phật','Nam mô Quan Thế Âm Bồ tát','Nam Mô Diệu Sắc Thân Như Lai','Nam Mô Diệu sắc Thân Như Lai','Nam mô Địa Tạng Vương Bồ tát','Nam mô đại từ đại bi Quan Thế Âm Bồ tát','Thập phương thế giới ngã tận kiến, nhất thiết vô hữu như Phật giả','Vạn bang giai hạ phẩm, duy hữu độc thư cao'];
let tmp=raw;
for(const m of mantraLines) tmp=tmp.split(m).join('');
// strip personal/place names with diacritics (keep-as-is list)
const names=['Chánh Đạo','Viên An','Hồng Minh Châu','Hạnh Đoan','Diệu Pháp','Chân Minh','Đan Lương','Hằng Vân','Liên Sinh','Quả Khanh','Quả Hồng','Quả Anh','Tiết Nhan','Thu Dĩnh','Thừa Ngọc','Thu Oanh','Trieu Le Binh','Triệu Lệ Bình','Thái Minh Thông','Thể Huệ','Dieu Chan','Diệu Chân','Hue Tham','Huệ Thâm','Phuc Duc Hai','Phúc Đức Hải','Thieu Hoa','Thiếu Hoa','Chan Ngu','Chân Ngữ','Bao Quang','Bảo Quang','Tu Quang','Từ Quang','Tri Chan','Trí Chân','Lam Long Dat','Lâm Long Đạt','Lien Hoa Tieu Binh','Liên Hoa Tiểu Bính','Tang Chanh Hue','Tăng Chánh Huệ','Thai Son','Thái Sơn','Tuyen','Hach','Hách','Dien Kiet','Điền Kiệt','Kim Doanh','Liễu Như','Diệu An','Nguyên Tâm','Thanh Hải','út Chiến','Chứng Nghiêm','Tịnh Không','Tuyên Hóa','Hư Vân','Bạch Vân','Trường Xuân','Trương Lư Nhi','Đậu Nga','Đào Ngột','Đậu Thiên Chương','Thái Minh Thông','Quan Hán Khanh','Trương giáo sư','Trương Giáo sư','Thơm','Mạc Thư','Lữ Cố','Ngụy Thanh Bình','Diệp sư phụ','Hương Cảng','Đài Loan','Đài Trung','Đài Bắc','Tân Trúc','Hồ Khẩu','Kim Môn','Sơn Tây','Cẩm Châu','Liêu Ninh','Bảo Thanh','Hắc Long Giang','Bảo Lâm','Trung Quan','Ngọa Long','Tây An','Dương Châu','Thông Giáo','Vạn Phật Thành','Ngũ Đài Sơn','Bắc Kinh','Vĩnh Định Môn','Nam Đầu','Hoàng Dương','Thiểm Tây','Hồ Nam','Vũ Hán','Hải Nam','Tam Á','Phượng Hoàng','Thượng Hải','Hà Nam','Tân Cương','Los Angeles','Trung Hoa','Trung Quốc','Sở Châu','Thiện Đạo','Cheng Yen','Hsuan Hua','Maitreya','Di Lặc','Quan Âm','Thế Âm','Địa Tạng','A Di Đà','Phật','Bồ tát','Bồ Tát','Kinh','Pháp','Tăng','Tam Bảo','Tam bảo','Cực Lạc','Tây Phương','Lương Hoàng Sám','Kim Cang','Lăng Nghiêm','Đại Bi','Phổ Môn','Diệu Pháp Liên Hoa','Thập Thiện','Bát quan trai','Bồ Đề','Bồ đề'];
for(const n of names) tmp=tmp.split(n).join('');
const viet=tmp.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]+/g);
if(viet){ console.log('LEFTOVER VI COUNT:', viet.length); console.log([...new Set(viet)].slice(0,40)); }
else console.log('NO LEFTOVER VIETNAMESE');
// standard terms spot check
for(const [t,n] of [['Avalokiteshvara',1],['Ksitigarbha',1],['Amitabha',0],['cause and effect',1],['karmic retribution',0],['repentance',0],['vegetarianism',0],['merit',0]]){
  const c=(raw.match(new RegExp(t,'g'))||[]).length;
  console.log(t+': '+c);
}
console.log('EN indent check:', JSON.stringify(raw.slice(0,40)));
