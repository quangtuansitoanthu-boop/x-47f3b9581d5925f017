<script lang="ts">
  import { setLocaleContext } from '$lib/stores/locale.svelte';
  import ReaderBoundary from '$lib/components/library/ReaderBoundary.svelte';
  import type { ReadingProgressRecord } from '$lib/browser/reading-activity-client';
  setLocaleContext('vi');
  const session = { authenticated: true, user: { id: 'a' } };
  const article = { id: 'converted-book', title: 'Converted', summary: '', content: 'INTRO', category: 'SÁCH KHUYẾN THIỆN' as const, tags: [], author: '', imageUrl: '', featured: false, publishedAt: '', hasTableOfContents: true, volumeCount: 2, status: 'Hoàn thành', pdfUrl: '/legacy.pdf' };
  let { initialProgress = null }: { initialProgress?: ReadingProgressRecord | null } = $props();
</script>
<ReaderBoundary {article} {session} {initialProgress} />
