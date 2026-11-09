import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('mobile architecture and content standards', () => {
  it('forbids direct @capacitor imports inside UI components in src/lib/components', () => {
    function findSourceFiles(dir: string): string[] {
      let results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          results = results.concat(findSourceFiles(full));
        } else if (full.endsWith('.svelte') || full.endsWith('.ts')) {
          results.push(full);
        }
      }
      return results;
    }

    const componentFiles = findSourceFiles('src/lib/components');
    const violations: { file: string; line: string }[] = [];

    for (const file of componentFiles) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/from\s+['"]@capacitor\//.test(line) || /require\(['"]@capacitor\//.test(line)) {
          violations.push({ file, line: line.trim() });
        }
      }
    }

    expect(
      violations,
      'UI components must not import @capacitor directly. Use abstractions in src/lib/browser/ instead.'
    ).toEqual([]);
  });

  it('enforces uppercase titles for all bundled practice rituals in TuTap datasets', () => {
    const bundledFiles = [
      'src/lib/data/offline-bundled-articles.json',
      'static/offline-bundled-articles.json',
    ];

    for (const file of bundledFiles) {
      const articles = JSON.parse(readFileSync(file, 'utf8')) as Array<{
        id: string;
        tieu_de: string;
      }>;

      for (const id of ['tt_nghi_thuc_tri_chu_bao_khiep_an', 'tt_nghi_thuc_tho_tri_dai_tuy_cau']) {
        const article = articles.find((a) => a.id === id);
        expect(article, `Article ${id} must exist in ${file}`).toBeDefined();
        expect(
          article?.tieu_de,
          `Title of ${id} in ${file} must be fully uppercase`
        ).toBe(article?.tieu_de.toUpperCase());
      }
    }

    // Also verify offline-books-vi.json
    const booksVi = JSON.parse(readFileSync('src/lib/data/offline-books-vi.json', 'utf8')) as Record<
      string,
      { title: string }
    >;
    for (const id of ['tt_nghi_thuc_tri_chu_bao_khiep_an', 'tt_nghi_thuc_tho_tri_dai_tuy_cau']) {
      expect(booksVi[id]?.title).toBe(booksVi[id]?.title.toUpperCase());
    }

    // Also verify bundled-mantra-content.json
    const mantras = JSON.parse(
      readFileSync('src/lib/data/bundled-mantra-content.json', 'utf8')
    ) as Array<{ detail: { id: string; title: string } }>;
    for (const id of ['tt_nghi_thuc_tri_chu_bao_khiep_an', 'tt_nghi_thuc_tho_tri_dai_tuy_cau']) {
      const mantra = mantras.find((m) => m.detail.id === id);
      expect(mantra?.detail.title).toBe(mantra?.detail.title.toUpperCase());
    }
  });

  it('enforces Bookerly reader font for Buddha & Bodhisattva profiles in Le Phat', () => {
    const dialogContent = readFileSync('src/lib/components/practice/le-phat/BuddhaProfileDialog.svelte', 'utf8');
    expect(dialogContent).toMatch(/\.reader\s*\{[^}]*font-family:\s*var\(--font-reader\)/);
  });
});
