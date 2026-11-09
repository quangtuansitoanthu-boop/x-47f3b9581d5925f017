import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('guide page ownership', () => {
  const route = readFileSync('src/routes/huong-dan/+page.svelte', 'utf8');
  const section = readFileSync('src/lib/components/guide/GuideSection.svelte', 'utf8');
  const blocks = readFileSync('src/lib/components/guide/GuideBlocks.svelte', 'utf8');
  const styles = readFileSync('src/lib/styles/guide-page.css', 'utf8');

  it('uses one native Svelte owner without raw HTML injection or slicing', () => {
    expect(route).not.toContain('?raw');
    expect(route).not.toContain('{@html');
    expect(route).not.toContain('.slice(');
    expect(section).not.toContain('{@html');
    expect(blocks).not.toContain('{@html');
  });

  it('exposes searchable hash targets and responsive sticky navigation', () => {
    expect(route).toContain('createGuideSearchTargets');
    expect(route).toContain('window.history.replaceState');
    expect(route).toContain('focusTarget?.focus');
    expect(route).toContain('aria-label="Mục lục nhanh"');
    expect(styles).toMatch(/\.guide-jump-bar\s*\{[^}]*position:\s*relative/u);
    expect(styles).toContain('@media(max-width:340px)');
  });

  it('keeps the PWA install event path native and intact', () => {
    const install = readFileSync('src/lib/components/guide/GuideInstallSection.svelte', 'utf8');

    expect(install).toContain("window.addEventListener('beforeinstallprompt', capturePrompt)");
    expect(install).toContain("window.addEventListener('appinstalled', markInstalled)");
    expect(install).toContain('await installPrompt.prompt()');
    expect(install).toContain('Thêm vào Màn hình chính');
  });
});
