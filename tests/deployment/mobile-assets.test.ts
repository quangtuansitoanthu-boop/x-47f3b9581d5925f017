import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyMobileTree, createAssetManifest, verifyAssetManifest, resolveMobilePlatforms, isOptionalBookImage, removeOptionalBookImages } from '../../scripts/lib/mobile-assets.mjs';
import * as mobileAssets from '../../scripts/lib/mobile-assets.mjs';
import missionImages from '../../src/lib/data/mission-book-images.json';

const roots: string[] = [];
const temp = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutam-assets-')); roots.push(dir); return dir; };
afterEach(() => roots.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

describe('mobile artifact integrity', () => {
  const bootstrapFixture = (htmlId = 'l3muin', clientId = htmlId, version = '1793780765159') => {
    const root = temp();
    fs.mkdirSync(path.join(root, '_app/immutable/chunks'), { recursive: true });
    fs.writeFileSync(path.join(root, 'index.html'), `<script>__sveltekit_${htmlId} = {base: ""};</script>`);
    fs.writeFileSync(path.join(root, '_app/version.json'), JSON.stringify({ version }));
    fs.writeFileSync(path.join(root, '_app/immutable/chunks/client.js'),
      `const label = "__sveltekit_unrelated"; globalThis.__sveltekit_sw.env; function start() { return globalThis.__sveltekit_${clientId}.data; }`);
    return root;
  };
  const verifyBootstrap = (root: string) => Reflect.get(mobileAssets, 'verifyMobileBootstrap')(root);

  it('accepts matching HTML, client bootstrap and version without rewriting generated assets', () => {
    const root = bootstrapFixture();
    const before = createAssetManifest(root);
    expect(verifyBootstrap(root)).toBe('l3muin');
    expect(createAssetManifest(root)).toEqual(before);
  });
  it('rejects the observed Android HTML/client mismatch even when all asset bytes match their manifest', () => {
    const root = bootstrapFixture('1ks80da', 'l3muin');
    const before = createAssetManifest(root);
    expect(verifyAssetManifest(root, before)).toBe(3);
    expect(() => verifyBootstrap(root)).toThrow(/bootstrap.*mismatch/iu);
    expect(createAssetManifest(root)).toEqual(before);
  });
  it('rejects a matching HTML/client pair from a different version', () => {
    expect(() => verifyBootstrap(bootstrapFixture('1ks80da', '1ks80da'))).toThrow(/bootstrap.*mismatch/iu);
  });
  it('rejects missing or conflicting actual client payload readers', () => {
    const root = bootstrapFixture();
    fs.writeFileSync(path.join(root, '_app/immutable/chunks/client.js'), 'const text = "__sveltekit_l3muin";');
    expect(() => verifyBootstrap(root)).toThrow(/bootstrap/iu);
    fs.writeFileSync(path.join(root, '_app/immutable/chunks/client.js'), 'globalThis.__sveltekit_l3muin.data; globalThis.__sveltekit_1ks80da.data;');
    expect(() => verifyBootstrap(root)).toThrow(/bootstrap.*mismatch/iu);
  });
  it('excludes only optional illustrations from mobile output, preserving text and covers', () => {
    const output = temp();
    const source = temp();
    const image = missionImages.images[0].path.slice(1);
    for (const root of [source, output]) {
      fs.mkdirSync(path.dirname(path.join(root, image)), { recursive: true });
      fs.writeFileSync(path.join(root, image), 'image');
      fs.writeFileSync(path.join(root, 'book.json'), 'chapter text');
    }
    expect(isOptionalBookImage(path.join(source, image))).toBe(true);
    expect(isOptionalBookImage(path.join(source, 'covers/book.webp'))).toBe(false);
    removeOptionalBookImages(output);
    expect(fs.existsSync(path.join(output, image))).toBe(false);
    expect(fs.readFileSync(path.join(output, 'book.json'), 'utf8')).toBe('chapter text');
    expect(fs.existsSync(path.join(source, image))).toBe(true);
  });
  it('does not promise hidden paths that Android AAPT excludes from the APK', () => {
    const source = temp();
    fs.writeFileSync(path.join(source, 'index.html'), '<html>app</html>');
    fs.mkdirSync(path.join(source, '.well-known'));
    fs.writeFileSync(path.join(source, '.well-known/assetlinks.json'), '[]');
    expect(createAssetManifest(source).files.map((entry: { path: string }) => entry.path)).toEqual(['index.html']);
  });
  it('limits Android builds to Android sync while preserving the existing all-platform default', () => {
    expect(resolveMobilePlatforms([])).toEqual(['android', 'ios']);
    expect(resolveMobilePlatforms(['--platform', 'android'])).toEqual(['android']);
    expect(() => resolveMobilePlatforms(['--platform', 'unknown'])).toThrow();
    expect(() => resolveMobilePlatforms(['--platform'])).toThrow();
  });
  it('copies nested assets and detects stale or missing resources after native sync', () => {
    const source = temp(); const output = temp();
    fs.mkdirSync(path.join(source, 'audio'));
    fs.writeFileSync(path.join(source, 'index.html'), '<html>app</html>');
    fs.writeFileSync(path.join(source, 'audio/one.m4a'), 'audio');
    copyMobileTree(source, output);
    const manifest = createAssetManifest(source, ['index.html']);
    expect(verifyAssetManifest(output, manifest)).toBe(2);
    fs.writeFileSync(path.join(output, 'audio/one.m4a'), 'stale');
    expect(() => verifyAssetManifest(output, manifest)).toThrow(/audio\/one.m4a/);
    fs.unlinkSync(path.join(output, 'audio/one.m4a'));
    expect(() => verifyAssetManifest(output, manifest)).toThrow();
  });
  it('does not accept a bundle without the required entry point', () => {
    expect(() => createAssetManifest(temp(), ['index.html'])).toThrow(/index.html/);
  });
  it('fails if both copy attempts fail instead of shipping an old destination file', () => {
    const source = temp(); const output = temp();
    fs.writeFileSync(path.join(source, 'index.html'), 'new');
    fs.writeFileSync(path.join(output, 'index.html'), 'old');
    const lockedFs = Object.create(fs);
    lockedFs.copyFileSync = () => { throw new Error('locked'); };
    lockedFs.writeFileSync = () => { throw new Error('locked'); };
    expect(() => copyMobileTree(source, output, undefined, lockedFs)).toThrow(/index.html/);
  });
  it('does not rewrite an identical asset already emitted by the static adapter', () => {
    const source = temp(); const output = temp();
    fs.writeFileSync(path.join(source, 'video.mp4'), 'identical');
    fs.writeFileSync(path.join(output, 'video.mp4'), 'identical');
    const lockedFs = Object.create(fs);
    lockedFs.copyFileSync = () => { throw new Error('locked'); };
    lockedFs.writeFileSync = () => { throw new Error('locked'); };
    expect(() => copyMobileTree(source, output, undefined, lockedFs)).not.toThrow();
  });
});
