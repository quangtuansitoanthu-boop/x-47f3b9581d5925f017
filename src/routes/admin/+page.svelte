<script lang="ts">
  import AdminDashboard from '$lib/components/admin/dashboard/AdminDashboard.svelte';
  import '$lib/styles/admin-dashboard.css';
  let { data } = $props();
</script>

<svelte:head>
  <title>Bảng điều khiển — Quản trị Quang Từ</title>
  <meta name="robots" content="noindex,nofollow" />
</svelte:head>

<AdminDashboard initialData={data.dashboard} />
