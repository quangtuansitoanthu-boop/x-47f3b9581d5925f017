<script lang="ts">
  import PdfCanvasReader from '$lib/components/reader/PdfCanvasReader.svelte';
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import type { LibraryArticle } from '$lib/components/library/article';
  setLocaleContext('vi');
  const article: LibraryArticle = { id: 'probe-pdf', title: 'PDF probe test', summary: '', content: '',
    category: 'KHÁC', tags: [], author: '', imageUrl: '', featured: false, publishedAt: '',
    hasTableOfContents: false, volumeCount: 1, status: 'published', pdfUrl: '/probe.pdf' };
</script>
<PdfCanvasReader url="/probe.pdf" articleId={article.id} title={article.title} category="KHÁC"
  categoryIcon="" author="" dateLabel="" viewCount={null} authenticated={false} currentArticle={article} />
