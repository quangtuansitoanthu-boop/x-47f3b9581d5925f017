import fs from 'fs';
// usage: node view.mjs <file> : prints paragraphs one per block, wrapped
const f = process.argv[2];
const raw = fs.readFileSync(f,'utf8');
const paras = raw.split(/(?=<p[ >])/);
paras.forEach((p,i)=>{
  console.log(`--- P${i} ---`);
  console.log(p.replace(/\r\n/g,'\n').slice(0,4000));
});
