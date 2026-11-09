import fs from 'node:fs';
import path from 'node:path';
import { filterIosContent, isIosExcludedContent } from '../../src/lib/domain/ios-content-policy.ts';

// Legacy export name; prune either native output, never source assets or downloads.
export function removeIosExcludedAssets(directory, { iosAudioAlias = true } = {}) {
  const root = path.resolve(directory);
  const originalAudio = path.join(root, 'assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3');
  if (iosAudioAlias && fs.existsSync(originalAudio)) fs.renameSync(originalAudio, path.join(root, 'assets/audio/chu-lang-nghiem.mp3'));
  const catalog = path.join(root, 'offline-bundled-articles.json');
  const talkCatalog = path.join(root, 'offline-data/talks.json');
  const rows = [...(fs.existsSync(catalog) ? JSON.parse(fs.readFileSync(catalog, 'utf8')) : []),
    ...(fs.existsSync(talkCatalog) ? JSON.parse(fs.readFileSync(talkCatalog, 'utf8')) : [])];
  const retainedCovers = new Set(rows.filter(row => !isIosExcludedContent(row))
    .map(row => new URL(String(row.anh_url || row.anh_dai_dien || ''), 'https://quangtu.vn').pathname));
  for (const row of rows.filter(isIosExcludedContent)) {
    const cover = new URL(String(row.anh_url || row.anh_dai_dien || ''), 'https://quangtu.vn').pathname;
    if (cover.startsWith('/covers/') && !retainedCovers.has(cover)) {
      const target = path.resolve(root, '.' + cover);
      if (target.startsWith(root + path.sep)) fs.rmSync(target, { force: true });
    }
  }
  for (const relative of ['offline-bundled-articles.json', 'offline-data/talks.json',
    'offline-data/articles-en.json', 'offline-data/english-pack-manifest.json']) {
    const file = path.join(root, relative);
    if (fs.existsSync(file)) {
      const filtered = JSON.stringify(filterIosContent(JSON.parse(fs.readFileSync(file, 'utf8'))));
      // File do adapter vừa ghi có thể còn bị giữ trên Windows; thay thế nguyên tử.
      const temporary = `${file}.ios-filter.tmp`;
      try {
        fs.writeFileSync(temporary, filtered);
        fs.renameSync(temporary, file);
      } finally { fs.rmSync(temporary, { force: true }); }
    }
  }
  for (const relative of ['offline-data/chapters', 'offline-data/chapters-en']) {
    const folder = path.join(root, relative);
    if (!fs.existsSync(folder)) continue;
    for (const file of fs.readdirSync(folder)) {
      if (isIosExcludedContent({ file })) fs.rmSync(path.join(folder, file), { force: true });
    }
  }
}
