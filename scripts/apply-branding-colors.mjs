import fs from 'node:fs';
import sharp from 'sharp';
const { source } = JSON.parse(fs.readFileSync(process.argv[2] || 'output/branding-v2/color-source.json', 'utf8'));
const mark = 'assets/branding/lotus-mark.png';
if (!fs.existsSync('output/branding-v2/gold-mark-before.png')) fs.copyFileSync(mark, 'output/branding-v2/gold-mark-before.png');
await sharp(source).trim().resize(800, 800, { fit: 'contain', background: '#00000000' }).png().toFile(mark);
// Keep the user's ten rotating backgrounds when reapplying the initial identity.
const scriptFile = 'scripts/apply-branding-v2.mjs';
let script = fs.readFileSync(scriptFile, 'utf8');
const start = script.indexOf(".replace('asset(");
if (start >= 0) {
  const end = script.indexOf('.replaceAll', start);
  if (end < 0) throw new Error('Cannot safely preserve startup background rotation');
  script = script.slice(0, start) + script.slice(end);
  fs.writeFileSync(scriptFile, script);
}
console.log('Applied multicolour lotus and eight-spoked Dharma wheel; preserved background rotation.');
