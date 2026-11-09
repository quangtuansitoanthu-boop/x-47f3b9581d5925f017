import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FFMPEG = 'C:\\Program Files\\YT Helper\\YT Downloader\\Components\\ffmpeg.exe';
if (!fs.existsSync(FFMPEG)) {
  console.error('FFmpeg not found at:', FFMPEG);
  process.exit(1);
}

const assetsAudioDir = path.resolve('assets/audio');
const staticAudioDir = path.resolve('static/audio');

console.log('=== BẮT ĐẦU TỐI ƯU HÓA ÂM THANH (MP3 -> AAC CHUẨN VÀNG) ===\n');

// 1. Xóa bản sao chu-lang-nghiem.mp3 ở static/audio (vì đã có ở assets/audio)
const duplicateChuLangNghiem = path.join(staticAudioDir, 'chu-lang-nghiem.mp3');
if (fs.existsSync(duplicateChuLangNghiem)) {
  const sz = fs.statSync(duplicateChuLangNghiem).size;
  fs.unlinkSync(duplicateChuLangNghiem);
  console.log(`✓ Đã xóa file trùng lặp: static/audio/chu-lang-nghiem.mp3 (tiết kiệm ${(sz / 1024 / 1024).toFixed(2)} MB)`);
}

// 2. Chuyển đổi các bài nhạc thiền sang AAC (.m4a) 80kbps stereo
const tracks = [
  { name: 'nhac-thien-01.mp3', outName: 'nhac-thien-01.m4a', bitrate: '80k', channels: 2 },
  { name: 'nhac-thien-02.mp3', outName: 'nhac-thien-02.m4a', bitrate: '80k', channels: 2 },
  { name: 'nhac-thien-03.mp3', outName: 'nhac-thien-03.m4a', bitrate: '80k', channels: 2 },
  { name: 'tieng-mo.mp3', outName: 'tieng-mo.m4a', bitrate: '64k', channels: 1 }
];

let totalOldBytes = 0;
let totalNewBytes = 0;

for (const tr of tracks) {
  const inputPath = path.join(assetsAudioDir, tr.name);
  const outputPath = path.join(assetsAudioDir, tr.outName);

  if (!fs.existsSync(inputPath)) {
    console.warn(`File không tồn tại: ${inputPath}`);
    continue;
  }

  const oldSize = fs.statSync(inputPath).size;
  totalOldBytes += oldSize;

  console.log(`Đang nén ${tr.name} (${(oldSize / 1024 / 1024).toFixed(2)} MB) sang AAC ${tr.outName}...`);

  const args = [
    '-y',
    '-i', inputPath,
    '-c:a', 'aac',
    '-b:a', tr.bitrate,
    '-ac', String(tr.channels),
    '-ar', '44100',
    '-movflags', '+faststart',
    outputPath
  ];

  const result = spawnSync(FFMPEG, args, { stdio: 'pipe' });
  if (result.status !== 0) {
    console.error(`Lỗi khi nén ${tr.name}:`, result.stderr.toString());
  } else {
    const newSize = fs.statSync(outputPath).size;
    totalNewBytes += newSize;
    const pct = (((oldSize - newSize) / oldSize) * 100).toFixed(1);
    console.log(`  -> Xong: ${(newSize / 1024 / 1024).toFixed(2)} MB (giảm ${pct}%)`);
  }
}

console.log('\n=== TỔNG KẾT NÉN ÂM THANH ===');
console.log(`Dung lượng ban đầu: ${(totalOldBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Dung lượng AAC mới: ${(totalNewBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Tiết kiệm: ${(((totalOldBytes - totalNewBytes) / totalOldBytes) * 100).toFixed(1)}%`);
