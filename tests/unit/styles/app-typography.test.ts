import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('application typography', () => {
  it('uses system fonts for the app and preserves reading fonts', () => {
    const tokens = readFileSync('src/lib/styles/tokens.css', 'utf8');
    const shell = readFileSync('src/lib/styles/master-shell.css', 'utf8');
    const globalStyles = readFileSync('src/lib/styles/global.css', 'utf8');
    const practice = readFileSync('src/lib/components/practice/catalog/PracticeCatalog.svelte', 'utf8');
    const audio = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
    const admin = readFileSync('src/lib/styles/admin-layout.css', 'utf8');

    expect(tokens).toContain("--font-app: -apple-system, BlinkMacSystemFont, 'San Francisco Web', system-ui,");
    for (const path of ['src/lib/components/library/ReaderBoundary.svelte', 'src/lib/components/practice/reader/PracticePreview.svelte']) {
      const reader = readFileSync(path, 'utf8');
      expect(reader).toMatch(/fontFamily\s*===\s*'be-vietnam-pro'\s*\?\s*"var\(--font-app\)"/);
    }
    expect(tokens).toContain("--font-reader: 'Bookerly', Georgia, serif");
    expect(shell).toMatch(/body\s*\{[^}]*font-family: var\(--font-app\)/s);
    expect(shell).toMatch(/button,\s*input,\s*select,\s*textarea\s*\{\s*font-family: inherit/s);
    expect(globalStyles).toMatch(/\.tt-practice \.ttp-content\s*\{\s*font-family: var\(--font-reader\) !important/s);
    expect(globalStyles).toMatch(/\.import-json-header h2\s*\{\s*font-family: var\(--font-app\) !important/s);
    expect(practice).toContain(':global(body){font-family:var(--font-app)!important}');
    expect(audio).toContain('font-family:var(--font-app)!important');
    expect(admin).toContain('font-family: var(--font-app)');
  });
});
