import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const sources = JSON.parse(fs.readFileSync('output/branding-v2/sources.json', 'utf8'));
const backup = 'output/branding-v2/before';
for (const file of ['assets/branding/lotus-mark.png', 'assets/branding/startup-sanctuary.webp']) {
  fs.mkdirSync(path.dirname(`${backup}/${file}`), { recursive: true });
  if (!fs.existsSync(`${backup}/${file}`)) fs.copyFileSync(file, `${backup}/${file}`);
}
await sharp(sources.mark).trim().resize(800, 800, { fit: 'contain', background: '#00000000' }).png().toFile('assets/branding/lotus-mark.png');
function edit(file, transform) {
  const previous = fs.readFileSync(file, 'utf8');
  const next = transform(previous);
  if (previous !== next) fs.writeFileSync(file, next);
}
edit('scripts/generate-branding.mjs', (s) => s.replace('min * .069', 'min * .052').replace('min * .033', 'min * .027').replace('>Tu Tập</text>', '>Tu tập Phật pháp</text>').replace('Gieo an lành · Nuôi dưỡng tâm', 'Học lời Phật dạy · Thực hành mỗi ngày'));
edit('scripts/sync-ios-assets.mjs', (s) => s.replace('>TU TẬP</text>', '>TU TẬP PHẬT PHÁP</text>').replace('letter-spacing="14"', 'letter-spacing="6"').replace('Ứng Dụng Học Phật &amp; Thiền Định', 'Học lời Phật dạy · Thực hành mỗi ngày'));
edit('android/app/src/main/java/vn/quangtu/tutam/StartupArtworkView.java', (s) => s.replace('Shared native artwork: reads the ten compressed calendar assets without making network requests.', 'Shared native startup identity; all artwork is bundled for offline use.').replaceAll('"Tu Tập"', '"Tu tập Phật pháp"').replace('landscape ? 28 : 32', 'landscape ? 24 : 26').replace('title.setTypeface(', 'title.setGravity(android.view.Gravity.CENTER);\n        title.setTypeface(').replace('Gieo an lành · Nuôi dưỡng tâm', 'Học lời Phật dạy · Thực hành mỗi ngày'));
edit('android/app/src/main/res/values/strings.xml', (s) => s.replaceAll('>Tu Tập<', '>Tu tập<'));
edit('capacitor.config.ts', (s) => s.replaceAll("appName: 'Tu Tập'", "appName: 'Tu tập'"));
edit('ios/App/App/Info.plist', (s) => s.replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/, '$1Tu tập$2'));
edit('manifest.json', (s) => { const m = JSON.parse(s); m.name = 'Tu tập Phật pháp'; m.short_name = 'Tu tập'; return JSON.stringify(m, null, 2) + '\n'; });
edit('src/lib/i18n/translations.ts', (s) => s.replace("appTitle: 'Tu tập cùng Quang Từ'", "appTitle: 'Tu tập Phật pháp'").replace("appTitleLine1: 'Tu tập cùng'", "appTitleLine1: 'Tu tập'").replace("appTitleLine2: 'Quang Từ'", "appTitleLine2: 'Phật pháp'").replace("appTagline: 'Nhân Quả · Luân Hồi · Hành Thiện'", "appTagline: 'Học lời Phật dạy · Thực hành mỗi ngày'").replace("brandName: 'Tu tập cùng Quang Từ'", "brandName: 'Tu tập Phật pháp'").replace("tagline: 'Nhân Quả · Luân Hồi · Hành Thiện'", "tagline: 'Học lời Phật dạy · Thực hành mỗi ngày'"));
edit('src/lib/components/layout/SiteHeader.svelte', (s) => s.replace("?? 'Tu tập cùng'", "?? 'Tu tập'").replace("?? 'Quang Từ'", "?? 'Phật pháp'"));
console.log('Updated app identity, startup title, slogan and platform names.');
