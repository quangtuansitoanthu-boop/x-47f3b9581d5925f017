<script lang="ts">
  import BookManager from '$lib/components/admin/books/BookManager.svelte';
  import '$lib/styles/global.css';
  let { data } = $props();
</script>
<svelte:head><title>Quản lý sách — Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<BookManager books={data.books} session={data.session} selectedBookId={data.selectedBookId} initialMode={data.initialMode} />
