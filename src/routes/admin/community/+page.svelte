<script lang="ts">
  import AdminCommunity from '$lib/components/admin/community/AdminCommunity.svelte';
  import '$lib/styles/admin-community.css';
  let { data } = $props();
</script>

<svelte:head><title>Hoạt động cộng đồng — Quản trị Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminCommunity initialData={data.community} />
