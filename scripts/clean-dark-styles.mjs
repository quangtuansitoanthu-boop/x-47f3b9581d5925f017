import fs from 'fs';
import path from 'path';

const chaptersDir = 'static/offline-data/chapters';
let totalReplaced = 0;

for (const file of fs.readdirSync(chaptersDir)) {
  if (!file.endsWith('.json')) continue;
  const filePath = path.join(chaptersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Replace rgb(33, 37, 41) or rgb(33,37,41) or color:#212529 or color:#000
  content = content.replace(/style=\\"color:\s*rgb\(33,\s*37,\s*41\);?\\"/gi, '');
  content = content.replace(/style=\\"color:\s*#212529;?\\"/gi, '');
  content = content.replace(/<span\s+style=\\"color:\s*rgb\(33,\s*37,\s*41\);?\\">/gi, '<span>');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    totalReplaced++;
    console.log(`Cleaned: ${file}`);
  }
}

console.log(`Total files cleaned: ${totalReplaced}`);
