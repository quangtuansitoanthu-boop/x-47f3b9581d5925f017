import fs from 'fs';

const main = fs.readFileSync('node_modules/pdfjs-dist/build/pdf.mjs', 'utf8');
const vm1 = main.match(/pdfjsVersion\s*=\s*['"]([^'"]+)['"]/);
console.log('node_modules pdfjsVersion:', vm1 ? vm1[1] : 'not found');

const worker = fs.readFileSync('static/vendor/pdfjs/pdf.worker.min.mjs', 'utf8');
const vm2 = worker.match(/pdfjsVersion\s*=\s*['"]([^'"]+)['"]/);
console.log('static pdf.worker pdfjsVersion:', vm2 ? vm2[1] : 'not found');
