import { readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const SRC_DIR = 'd:\\CA NHAN\\A.WEB_HP\\tutam-main\\scratch\\processed_videos';
const DEST_DIR = join(process.cwd(), 'static', 'videos');
const FFMPEG = 'C:\\Program Files\\YT Helper\\YT Downloader\\Components\\ffmpeg.exe';

if (!existsSync(DEST_DIR)) {
  mkdirSync(DEST_DIR, { recursive: true });
}

const files = readdirSync(SRC_DIR).filter(f => f.endsWith('.mp4'));
console.log(`Found ${files.length} video files to process.`);

let totalSrcBytes = 0;
let totalDestBytes = 0;

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const srcPath = join(SRC_DIR, file);
  const destPath = join(DEST_DIR, file);
  const srcStat = statSync(srcPath);
  totalSrcBytes += srcStat.size;

  if (existsSync(destPath) && statSync(destPath).size > 1000) {
    const destStat = statSync(destPath);
    totalDestBytes += destStat.size;
    console.log(`[${i + 1}/${files.length}] Already compressed: ${file} (${(destStat.size / 1024 / 1024).toFixed(2)} MB)`);
    continue;
  }

  console.log(`[${i + 1}/${files.length}] Compressing: ${file} (original ${(srcStat.size / 1024 / 1024).toFixed(2)} MB)...`);
  const startTime = Date.now();

  const args = [
    '-y',
    '-i', srcPath,
    '-vf', "scale='min(360,iw)':-2",
    '-r', '15',
    '-c:v', 'libx264',
    '-crf', '36',
    '-preset', 'veryfast',
    '-c:a', 'aac',
    '-b:a', '20k',
    '-ac', '1',
    '-movflags', '+faststart',
    destPath
  ];

  const result = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Error compressing ${file}`);
  } else {
    const destStat = statSync(destPath);
    totalDestBytes += destStat.size;
    const durSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  -> Done in ${durSec}s: ${(destStat.size / 1024 / 1024).toFixed(2)} MB (reduced ${(((srcStat.size - destStat.size) / srcStat.size) * 100).toFixed(1)}%)`);
  }
}

console.log('====================================');
console.log(`Original total: ${(totalSrcBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Compressed total: ${(totalDestBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total saved: ${(((totalSrcBytes - totalDestBytes) / totalSrcBytes) * 100).toFixed(1)}%`);
