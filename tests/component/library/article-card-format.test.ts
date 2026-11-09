import { render } from 'svelte/server';
import { expect, it, vi } from 'vitest';
vi.mock('$lib/stores/locale.svelte', async () => { const { translations } = await import('$lib/i18n/translations'); return { getLocaleContext: () => ({ current: 'vi', t: translations.vi }) }; });
import ArticleCard from '$lib/components/library/ArticleCard.svelte';
const base = { id: 'book', title: 'Book', summary: '', content: '', category: 'SÁCH KHUYẾN THIỆN' as const, tags: [], author: '', imageUrl: '', featured: false, publishedAt: '', hasTableOfContents: false, volumeCount: 0, status: 'Hoàn thành', pdfUrl: '/original.pdf' };
it('shows only the regular-book chapter label after conversion even when the original URL is retained', () => {
 const { body } = render(ArticleCard, { props: { article: { ...base, hasTableOfContents: true, volumeCount: 50 }, isDownloaded: true } });
 expect(body).toContain('50'); expect(body).not.toContain('art-pdf'); expect(body).not.toContain('>PDF<');
});
it('keeps the PDF badge and downloaded mark for unchanged comics', () => {
 const { body } = render(ArticleCard, { props: { article: base, isDownloaded: true } });
 expect(body).toContain('art-pdf'); expect(body).toContain('art-pdf-downloaded');
});
