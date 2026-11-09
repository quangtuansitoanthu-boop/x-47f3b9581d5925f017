import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PracticeCatalogSkeleton from '../../../src/lib/components/practice/catalog/PracticeCatalogSkeleton.svelte';
import PracticeCatalog from '../../../src/lib/components/practice/catalog/PracticeCatalog.svelte';

describe('practice catalog loading state', () => {
  it.each(['KINH PHẬT', 'TRÌ CHÚ', 'NGHI THỨC KHÁC'] as const)('uses the shell Back control for %s without a duplicate content button', (currentSection) => {
    const body = render(PracticeCatalog, { props: {
      articles: [], loadError: null, currentSection, query: '',
      onOpen() {}, onQueryChange() {}, onMeditationOpen() {}, onRosaryOpen() {},
    } }).body;
    expect(body).not.toContain('Quay lại Tu Tập');
    expect(body).toContain('data-practice-route-back');
  });

  it('reserves the real practice-card geometry without exposing decorative content', () => {
    const { body } = render(PracticeCatalogSkeleton);
    const catalog = readFileSync('src/lib/components/practice/catalog/PracticeCatalog.svelte', 'utf8');
    const page = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
    expect(body.match(/class="practice-card-skeleton(?:\s|")/gu)).toHaveLength(6);
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('practice-card-skeleton__image');
    expect(catalog).toContain('<PracticeCatalogSkeleton />');
    const loading = render(PracticeCatalog, { props: {
      articles: [], loadError: null, loading: true, currentSection: 'KINH PHẬT', query: '',
      onOpen() {}, onQueryChange() {}, onMeditationOpen() {}, onRosaryOpen() {},
    } }).body;
    expect(loading).toContain('role="status"');
    expect(loading).toContain('Đang tải danh mục tu tập…');
    expect(loading.match(/class="practice-card-skeleton(?:\s|")/gu)).toHaveLength(6);
    expect(page).toContain("get('preview') === 'skeleton'");
  });
});
