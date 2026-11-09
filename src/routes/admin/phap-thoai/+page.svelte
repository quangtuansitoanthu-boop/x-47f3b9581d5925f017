<script lang="ts">
  import AdminTalkManager from '$lib/components/admin/talks/AdminTalkManager.svelte';
  import '$lib/styles/admin-content-management.css';
  let { data } = $props();
</script>

<svelte:head><title>Quản lý Pháp thoại — Quang Từ</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<AdminTalkManager initialAlbums={data.albums} role={data.role} userId={data.userId} />
