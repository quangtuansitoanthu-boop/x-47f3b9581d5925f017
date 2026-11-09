const fs = require('fs');

const data = JSON.parse(fs.readFileSync('D:/source.json', 'utf-8'));

console.log(`Total chapters: ${data.length}`);
data.forEach((ch, i) => {
    console.log(`Chapter ${i}: id=${ch.id}, so_thu_tu=${ch.so_thu_tu}, tieu_de=${ch.tieu_de.substring(0, 80)}`);
});