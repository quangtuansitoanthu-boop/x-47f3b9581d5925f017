<script lang="ts">
  import AdminPracticeManager from '$lib/components/admin/practice/AdminPracticeManager.svelte';
  import '$lib/styles/admin-content-management.css';
  let { data } = $props();
</script>

<svelte:head><title>Quản lý Tu tập — Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminPracticeManager initialArticles={data.articles} role={data.role} userId={data.userId} />
