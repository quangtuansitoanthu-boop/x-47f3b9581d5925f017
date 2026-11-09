import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

async function optimizeCovers() {
  const coversDir = path.resolve('static/covers');
  if (!fs.existsSync(coversDir)) return;
  const files = fs.readdirSync(coversDir);
  let totalSaved = 0;
  let count = 0;

  console.log(`Optimizing ${files.length} covers in static/covers...`);
  for (const file of files) {
    const filePath = path.join(coversDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const ext = path.extname(file).toLowerCase();
    const origSize = stat.size;

    try {
      // Read buffer into memory so libvips does not lock the file on Windows
      const inBuf = fs.readFileSync(filePath);
      let pipeline = sharp(inBuf).resize({ width: 600, withoutEnlargement: true });
      let outBuf;

      if (ext === '.webp') {
        outBuf = await pipeline.webp({ quality: 80, effort: 5 }).toBuffer();
      } else if (ext === '.jpg' || ext === '.jpeg') {
        outBuf = await pipeline.jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer();
      } else if (ext === '.png') {
        outBuf = await pipeline.png({ quality: 82, compressionLevel: 9 }).toBuffer();
      } else {
        continue;
      }

      if (outBuf.length < origSize * 0.95) {
        fs.writeFileSync(filePath, outBuf);
        totalSaved += (origSize - outBuf.length);
        count++;
      }
    } catch (err) {
      console.warn(`Could not optimize ${file}:`, err.message);
    }
  }

  console.log(`✓ Optimized ${count} covers. Saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

async function optimizeLePhat() {
  const lpDir = path.resolve('static/images/le-phat');
  if (!fs.existsSync(lpDir)) return;
  const files = fs.readdirSync(lpDir);
  let totalSaved = 0;
  let count = 0;

  console.log(`Optimizing ${files.length} images in static/images/le-phat...`);
  for (const file of files) {
    const filePath = path.join(lpDir, file);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) continue;

    const ext = path.extname(file).toLowerCase();
    if (ext !== '.webp') continue;
    const origSize = stat.size;

    try {
      const inBuf = fs.readFileSync(filePath);
      const outBuf = await sharp(inBuf)
        .resize({ width: 720, withoutEnlargement: true })
        .webp({ quality: 82, effort: 5 })
        .toBuffer();

      if (outBuf.length < origSize * 0.95) {
        fs.writeFileSync(filePath, outBuf);
        totalSaved += (origSize - outBuf.length);
        count++;
      }
    } catch (err) {
      console.warn(`Could not optimize ${file}:`, err.message);
    }
  }

  console.log(`✓ Optimized ${count} Le Phat images. Saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

async function run() {
  await optimizeCovers();
  await optimizeLePhat();
}

run().catch(console.error);
