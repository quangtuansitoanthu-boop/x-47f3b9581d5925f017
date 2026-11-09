<script lang="ts">
  import AdminAnalytics from '$lib/components/admin/analytics/AdminAnalytics.svelte';
  import '$lib/styles/admin-analytics.css';
  let { data } = $props();
</script>

<svelte:head><title>Phân tích truy cập — Quản trị Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminAnalytics initialData={data.analytics} />
