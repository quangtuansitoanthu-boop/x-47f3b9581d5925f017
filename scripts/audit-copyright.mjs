import fs from 'node:fs';

const rawArticles = JSON.parse(fs.readFileSync('static/offline-bundled-articles.json', 'utf8'));

console.log('=== TỔNG SỐ BÀI VIẾT/SÁCH ĐÓNG GÓI:', rawArticles.length);

const authorMap = new Map();
const commercialSuspects = [];

// Các từ khóa nhà xuất bản hoặc tác giả thương mại cần lưu ý
const suspectKeywords = [
  'nguyên phong', 'first news', 'trí việt', 'nhã nam', 'thái hà', 'phương nam',
  'thích nhất hạnh', 'thiền sư', 'nguyễn hiến lê', 'dale carnegie', 'harv eker',
  'robin sharma', 'robert kiyosaki', 'thích thanh từ', 'thích chân quang'
];

for (const item of rawArticles) {
  const author = item.author || item.tac_gia || 'Khuyết danh';
  const title = item.title || item.tieu_de || '';
  const category = item.category || item.danh_muc || '';

  if (!authorMap.has(author)) authorMap.set(author, []);
  authorMap.get(author).push({ id: item.id, title, category });

  const textToCheck = `${author} ${title} ${item.summary || ''}`.toLowerCase();
  for (const kw of suspectKeywords) {
    if (textToCheck.includes(kw)) {
      commercialSuspects.push({ id: item.id, title, author, keyword: kw });
      break;
    }
  }
}

console.log('\n=== DANH SÁCH TÁC GIẢ & SỐ LƯỢNG SÁCH:');
for (const [author, books] of authorMap.entries()) {
  console.log(`- ${author}: ${books.length} cuốn`);
  for (const b of books.slice(0, 3)) {
    console.log(`    + [${b.id}] ${b.title}`);
  }
  if (books.length > 3) console.log(`    ... và ${books.length - 3} cuốn khác`);
}

console.log('\n=== CÁC MỤC NGHI VẤN BẢN QUYỀN THƯƠNG MẠI:');
if (commercialSuspects.length === 0) {
  console.log('Không phát hiện tác giả/từ khóa thương mại nghi vấn nào!');
} else {
  for (const s of commercialSuspects) {
    console.log(`⚠️ Nghi vấn [${s.keyword}]: [${s.id}] "${s.title}" - Tác giả: ${s.author}`);
  }
}
