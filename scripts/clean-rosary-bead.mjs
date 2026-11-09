import sharp from 'sharp';
import fs from 'node:fs';

async function cleanBead() {
  const inputPath = 'static/images/rosary/hat-kim-cang-bo-de.png';
  const img = sharp(inputPath);
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  const centerX = 255.5;
  const centerY = 246.5;
  const maxRadius = 202; // natural radius of the Rudraksha bead

  // Create clean buffer
  const outData = Buffer.from(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const r = outData[idx];
      const g = outData[idx + 1];
      const b = outData[idx + 2];
      const a = outData[idx + 3];

      if (a === 0) continue;

      const dx = x - centerX;
      const dy = y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Check for pedestal: neutral grey/white under y > 375
      const isGrey = (Math.abs(r - g) < 22 && Math.abs(g - b) < 22 && Math.abs(r - b) < 25);
      const isWhiteish = (r > 185 && g > 185 && b > 185);

      if (y > 370 && (isGrey || isWhiteish)) {
        outData[idx + 3] = 0;
        continue;
      }

      // Beyond natural radius at the bottom
      if (y > 380 && dist > maxRadius) {
        outData[idx + 3] = 0;
        continue;
      }

      // Smooth feathering at the bottom edge between maxRadius - 2 and maxRadius
      if (y > 380 && dist > maxRadius - 2) {
        const factor = Math.max(0, 1 - (dist - (maxRadius - 2)) / 2);
        outData[idx + 3] = Math.round(a * factor);
      }
    }
  }

  // Also remove any isolated small alpha artifacts
  const cleanedImage = sharp(outData, {
    raw: {
      width,
      height,
      channels,
    },
  });

  // Re-center slightly so the bead is perfectly centered at 256, 256
  // Current center is 255.5, 246.5 -> shift down by 9.5 pixels so it's centered at 256, 256
  const shiftY = 9;
  const centered = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: await cleanedImage.png().toBuffer(),
        top: shiftY,
        left: 0,
      },
    ])
    .png()
    .toBuffer();

  fs.writeFileSync('static/images/rosary/hat-kim-cang-bo-de.png', centered);

  // Generate webp with high quality
  await sharp(centered)
    .webp({ quality: 95, alphaQuality: 100, lossless: false })
    .toFile('static/images/rosary/hat-kim-cang-bo-de.webp');

  console.log('✓ Cleaned bead image successfully written to PNG & WebP');
}

cleanBead().catch(console.error);
