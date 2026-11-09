import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { copyMobileFile } from './lib/mobile-assets.mjs';

// An artwork-only update does not require rebuilding the web application.
const names = ['lotus-mark.png', 'tu-tap-logo.png'];
for (const root of ['build', 'android/app/src/main/assets/public', 'ios/App/App/public']) {
  if (!fs.existsSync(path.join(root, 'index.html'))) continue;
  for (const name of names) {
    const target = path.join(root, 'assets/branding', name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    copyMobileFile(path.join('assets/branding', name), target);
  }
  const manifestPath = path.join(root, 'mobile-assets-manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const name of names) {
      const relative = `assets/branding/${name}`;
      const bytes = fs.readFileSync(path.join(root, relative));
      const entry = { path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
      const index = manifest.files.findIndex(file => file.path === relative);
      if (index < 0) manifest.files.push(entry);
      else manifest.files[index] = entry;
    }
    manifest.files.sort((a, b) => a.path.localeCompare(b.path));
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  }
  console.log(`Updated branding: ${root}`);
}
