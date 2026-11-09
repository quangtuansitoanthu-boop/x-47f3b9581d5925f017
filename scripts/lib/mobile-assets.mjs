import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import missionImages from '../../src/lib/data/mission-book-images.json' with { type: 'json' };

export function isOptionalBookImage(file) {
  return file.replaceAll('\\', '/').includes(`/${missionImages.directory}/`);
}

export function removeOptionalBookImages(buildDirectory) {
  const root = path.resolve(buildDirectory);
  const target = path.resolve(root, missionImages.directory);
  if (!target.startsWith(root + path.sep)) throw new Error('Optional images outside mobile build');
  fs.rmSync(target, { recursive: true, force: true });
}

export function resolveMobilePlatforms(args) {
  const index = args.indexOf('--platform');
  if (index === -1 || args[index + 1] === 'all') return ['android', 'ios'];
  const value = args[index + 1];
  if (value !== 'android' && value !== 'ios') throw new Error('Expected --platform android, ios, or all');
  return [value];
}

export function copyMobileFile(from, to, io = fs) {
  if (io.existsSync(to) && io.statSync(to).isFile()
    && io.statSync(from).size === io.statSync(to).size
    && io.readFileSync(from).equals(io.readFileSync(to))) return;
  try { io.copyFileSync(from, to); }
  catch {
    try { io.writeFileSync(to, io.readFileSync(from)); }
    catch (cause) { throw new Error(`Cannot package mobile asset: ${from}`, { cause }); }
  }
}

/** A retry may recover a Windows file lock; failure must never publish stale assets. */
export function copyMobileTree(source, destination, filter, io = fs) {
  if (!io.existsSync(source)) throw new Error(`Missing mobile asset source: ${source}`);
  io.mkdirSync(destination, { recursive: true });
  for (const entry of io.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (filter && !filter(from)) continue;
    if (entry.isDirectory()) copyMobileTree(from, to, filter, io);
    else {
      // adapter-static has already emitted most files. Compare bytes rather than
      // timestamps so unchanged media need not be overwritten on Windows.
      copyMobileFile(from, to, io);
    }
  }
}

const digest = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const MANIFEST_NAME = 'mobile-assets-manifest.json';

/** SHA khi sao chép không phát hiện fallback HTML và client thuộc hai lượt build khác nhau. */
export function verifyMobileBootstrap(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const { version } = JSON.parse(fs.readFileSync(path.join(root, '_app/version.json'), 'utf8'));
  if (typeof version !== 'string' || !version) throw new Error('Mobile bootstrap version missing');
  // Cùng thuật toán djb2 của SvelteKit utils/hash.js đang cài.
  let hash = 5381;
  for (let index = version.length; index > 0;) hash = (hash * 33) ^ version.charCodeAt(--index);
  const expected = `__sveltekit_${(hash >>> 0).toString(36)}`;
  const declared = new Set([...html.matchAll(/\b(__sveltekit_[a-z0-9]+)\s*=\s*\{/gu)].map(match => match[1]));
  const readers = new Set();
  const walk = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.js')) {
        const code = fs.readFileSync(file, 'utf8');
        // Chỉ đọc payload thực, bỏ qua global SvelteKit khác như service worker.
        for (const match of code.matchAll(/\bglobalThis\.(__sveltekit_[a-z0-9]+)\.data\b/gu)) readers.add(match[1]);
      }
    }
  };
  walk(path.join(root, '_app/immutable'));
  if (declared.size !== 1 || !declared.has(expected) || readers.size !== 1 || !readers.has(expected)) {
    throw new Error(`Mobile bootstrap mismatch: version expects ${expected}; HTML ${[...declared].join(',') || 'missing'}; client ${[...readers].join(',') || 'missing'}`);
  }
  return expected.slice('__sveltekit_'.length);
}

export function createAssetManifest(root, required = ['index.html']) {
  for (const name of required) {
    const file = path.join(root, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile() || fs.statSync(file).size === 0) {
      throw new Error(`Missing required mobile asset: ${name}`);
    }
  }
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // Android's AAPT ignoreAssetsPattern excludes dot paths. The shared
      // manifest must describe resources present inside the final APK too.
      if (entry.name.startsWith('.')) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const relative = path.relative(root, file).split(path.sep).join('/');
        if (relative !== MANIFEST_NAME) files.push({ path: relative, bytes: fs.statSync(file).size, sha256: digest(file) });
      }
    }
  };
  walk(root);
  return { version: 1, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

export function verifyAssetManifest(root, manifest) {
  const resolvedRoot = path.resolve(root);
  for (const entry of manifest.files) {
    const file = path.resolve(root, entry.path);
    if (!file.startsWith(resolvedRoot + path.sep) || !fs.existsSync(file)
      || !fs.statSync(file).isFile() || fs.statSync(file).size !== entry.bytes || digest(file) !== entry.sha256) {
      throw new Error(`Mobile asset integrity check failed: ${entry.path}`);
    }
  }
  return manifest.files.length;
}
