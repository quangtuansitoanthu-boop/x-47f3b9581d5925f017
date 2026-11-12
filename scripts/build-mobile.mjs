import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { copyMobileFile, copyMobileTree, createAssetManifest, verifyAssetManifest, verifyMobileBootstrap, resolveMobilePlatforms, isOptionalBookImage, removeOptionalBookImages } from './lib/mobile-assets.mjs';
import bundledEnglishRituals from '../src/lib/data/bundled-english-rituals.json' with { type: 'json' };
import { removeIosExcludedAssets } from './lib/ios-content-assets.mjs';
import { configureIosGoogle, resolveIosGoogleClientId } from './lib/ios-google-config.mjs';

const root = process.cwd();
const staticDir = path.join(root, 'static');
const buildDir = path.join(root, 'build');
const platforms = resolveMobilePlatforms(process.argv.slice(2));
// CI phải dừng trước khi tải nội dung/build; client và URL scheme dùng cùng một ID.
const iosGoogleClientId = platforms.includes('ios')
  ? resolveIosGoogleClientId(process.env.VITE_GOOGLE_IOS_CLIENT_ID,
    Boolean(process.env.CI) && !['false', '0'].includes(process.env.CI)) : '';
if (iosGoogleClientId) process.env.VITE_GOOGLE_IOS_CLIENT_ID = iosGoogleClientId;
else if (platforms.includes('ios')) console.warn('[build-mobile] VITE_GOOGLE_IOS_CLIENT_ID is missing: Google Sign-In on iOS is unavailable. Set it before a release build on Mac.');

// Mỗi nền tảng cần bundle riêng để bộ lọc iOS không lọt sang Android.
if (platforms.length > 1) {
  execFileSync(process.execPath, ['--use-system-ca', 'scripts/sync-offline-content.mjs'], { cwd: root, stdio: 'inherit' });
  for (const platform of platforms) {
    execFileSync(process.execPath, ['scripts/build-mobile.mjs', '--platform', platform], { cwd: root, stdio: 'inherit', env: { ...process.env, TUTAM_BUNDLE_SYNCED: '1' } });
  }
  process.exit(0);
}

if (process.env.TUTAM_BUNDLE_SYNCED !== '1') {
  execFileSync(process.execPath, ['--use-system-ca', 'scripts/sync-offline-content.mjs'], { cwd: root, stdio: 'inherit' });
}

execFileSync('npm', ['run', 'build'], {
  cwd: root,
  env: { ...process.env, CAPACITOR_BUILD: '1', VITE_CAPACITOR_BUILD: '1', VITE_CONTENT_PLATFORM: platforms[0] },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

// Giữ dữ liệu nguồn; bộ lọc iOS chỉ áp dụng trên output bên dưới.
const EXCLUDED_CHAPTER_FILES = new Set();
const EXCLUDED_COVER_FILES = new Set();

// Mặc định loại bỏ videos (~73MB) ra khỏi bộ cài đặt di động để phát stream & tải On-Demand
const skipVideos = process.env.BUNDLE_VIDEOS !== '1';

if (skipVideos) {
  const buildVideos = path.join(buildDir, 'videos');
  if (fs.existsSync(buildVideos)) {
    try {
      fs.rmSync(buildVideos, { recursive: true, force: true });
      console.log('✓ Đã tách thư mục videos (~73MB) ra khỏi build/ theo cơ chế On-Demand.');
    } catch (e) {
      console.warn('[build-mobile] Không thể xóa build/videos:', e.message);
    }
  }
} else {
  console.log('✓ Bao gồm thư mục videos (~73MB) cho các bài pháp Quang Từ theo cờ BUNDLE_VIDEOS=1.');
}

const copyDirResilient = copyMobileTree;

for (const name of ['covers', 'images', 'offline-data', 'offline-bundled-articles.json', 'videos']) {
  if (skipVideos && name === 'videos') continue;
  const source = path.join(staticDir, name);
  const target = path.join(buildDir, name);
  if (!fs.existsSync(source)) continue;

  if (name === 'covers') {
    copyDirResilient(source, target, (src) => !EXCLUDED_COVER_FILES.has(path.basename(src)));
  } else if (name === 'offline-data') {
    copyDirResilient(source, target, (src) => {
      // Only the explicitly bundled practice rituals ship in English; other books download on demand.
      if (src.includes('chapters-en')) return fs.statSync(src).isDirectory() || bundledEnglishRituals.includes(path.basename(src));
      return !EXCLUDED_CHAPTER_FILES.has(path.basename(src));
    });
    // Remove English books left by older builds while retaining the bundled rituals.
    const enDir = path.join(target, 'chapters-en');
    if (fs.existsSync(enDir)) {
      for (const file of fs.readdirSync(enDir)) {
        if (!bundledEnglishRituals.includes(file)) fs.rmSync(path.join(enDir, file), { recursive: true, force: true });
      }
    }
    // Đảm bảo các file tiếng Việt có bản quyền bị xóa khỏi build/offline-data/chapters
    for (const file of EXCLUDED_CHAPTER_FILES) {
      const viFile = path.join(target, 'chapters', file);
      if (fs.existsSync(viFile)) {
        try { fs.unlinkSync(viFile); } catch {}
      }
    }
  } else if (name === 'offline-bundled-articles.json') {
    if (EXCLUDED_CHAPTER_FILES.size === 0) {
      copyMobileFile(source, target);
    } else {
      const raw = JSON.parse(fs.readFileSync(source, 'utf8'));
      const filtered = Array.isArray(raw)
        ? raw.filter((art) => !EXCLUDED_CHAPTER_FILES.has(`${art.id}.json`))
        : raw;
      fs.writeFileSync(target, JSON.stringify(filtered));
    }
  } else {
    copyDirResilient(source, target, () => true);
  }
}

// Đồng bộ thư mục assets/ gốc (chứa audio .m4a tối ưu, branding, fonts) vào build/assets
const rootAssets = path.join(root, 'assets');
const buildAssets = path.join(buildDir, 'assets');
if (fs.existsSync(rootAssets)) {
  copyDirResilient(rootAssets, buildAssets, (source) => !isOptionalBookImage(source));
  const audioDir = path.join(buildAssets, 'audio');
  for (const oldMp3 of ['nhac-thien-01.mp3', 'nhac-thien-02.mp3', 'nhac-thien-03.mp3', 'tieng-mo.mp3']) {
    const f = path.join(audioDir, oldMp3);
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
  // R2 practice objects are not guaranteed available; native ambient playback reads assets.
  console.log('✓ Giữ đủ nhạc thiền và âm thanh phụ trợ trong mobile bundle để phát offline.');
}

// Chỉ dọn output native đã resolve, giữ nguyên ảnh nguồn để web phục vụ lượt tải riêng.
removeOptionalBookImages(buildDir);
console.log('✓ Ảnh Sứ Mệnh Độ Vong tải riêng, không đóng gói trong bộ cài mobile.');
removeIosExcludedAssets(buildDir, { iosAudioAlias: platforms[0] === 'ios' });

const assetManifest = createAssetManifest(buildDir, [
  'index.html', 'offline-bundled-articles.json', 'offline-data/talks.json',
  ...bundledEnglishRituals.map(file => `offline-data/chapters-en/${file}`),
  'images/le-phat/quan-the-am-approved.webp', 'assets/fonts/be-vietnam-pro-regular.ttf',
  ...['nhac-thien-01.m4a', 'nhac-thien-02.m4a', 'nhac-thien-03.m4a', 'tieng-mo.m4a', 'rosary-tap.m4a',
    ...fs.readdirSync(path.join(rootAssets, 'audio', 'ambient')).filter(file => file.endsWith('.mp3')).map(file => `ambient/${file}`),
  ].map(file => `assets/audio/${file}`),
]);
fs.writeFileSync(path.join(buildDir, 'mobile-assets-manifest.json'), JSON.stringify(assetManifest));

execFileSync('node', ['scripts/patch-google-auth.mjs'], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (platforms[0] === 'ios') configureIosGoogle(path.join(root, 'ios/App/App/Info.plist'), iosGoogleClientId);

function syncPlatforms() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('npx', ['cap', 'sync', ...(platforms.length === 1 ? platforms : [])], {
        cwd: root,
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      console.warn(`[build-mobile] cap sync attempt ${attempt} failed (${error.message}), retrying in 1s...`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
}
verifyMobileBootstrap(buildDir);
syncPlatforms();

// Dọn dẹp các tệp lớn không đóng gói khỏi android/app/src/main/assets/public
const androidPublic = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public');
for (const platform of platforms) {
  const directory = platform === 'android' ? androidPublic : path.join(root, 'ios', 'App', 'App', 'public');
  console.log(`✓ Kiểm tra SHA-256: ${verifyAssetManifest(directory, assetManifest)} tài nguyên ${platform}.`);
  console.log(`✓ Kiểm tra bootstrap: ${verifyMobileBootstrap(directory)} (${platform}).`);
}
if (platforms.includes('android')) {
const androidChaptersEn = path.join(androidPublic, 'offline-data', 'chapters-en');
if (fs.existsSync(androidChaptersEn)) {
  try {
    for (const file of fs.readdirSync(androidChaptersEn)) {
      if (!bundledEnglishRituals.includes(file)) fs.rmSync(path.join(androidChaptersEn, file), { recursive: true, force: true });
    }
    console.log('✓ Đã giữ lại các nghi thức tiếng Anh đóng gói trong android assets/public.');
  } catch {}
}

const androidAudioDir = path.join(androidPublic, 'assets', 'audio');
for (const oldMp3 of ['nhac-thien-01.mp3', 'nhac-thien-02.mp3', 'nhac-thien-03.mp3', 'tieng-mo.mp3']) {
  const f = path.join(androidAudioDir, oldMp3);
  if (fs.existsSync(f)) {
    try { fs.unlinkSync(f); } catch {}
  }
}

if (skipVideos) {
  const androidVideos = path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'videos');
  if (fs.existsSync(androidVideos)) {
    try {
      fs.rmSync(androidVideos, { recursive: true, force: true });
      console.log('✓ Đã dọn dẹp videos khỏi android/assets/public.');
    } catch (e) {
      console.warn('[build-mobile] Không thể xóa android videos:', e.message);
    }
  }
  const iosVideos = path.join(root, 'ios', 'App', 'App', 'public', 'videos');
  if (fs.existsSync(iosVideos)) {
    try {
      fs.rmSync(iosVideos, { recursive: true, force: true });
      console.log('✓ Đã dọn dẹp videos khỏi ios/App/public.');
    } catch (e) {
      console.warn('[build-mobile] Không thể xóa ios videos:', e.message);
    }
  }
}
}
